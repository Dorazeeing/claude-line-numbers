import type { EngineInterface, Register, RenderElement, SessionMessage, TextProps } from 'claude-code'

import type { Starts } from '../types'
import { findLineRefs, lastNumber, numberReply, rowsAtMost, splitUnits, textKey } from './lines'
import type { Unit } from './lines'
import { layoutTable } from './table'
import type { Span } from './table'

type ApiBlock = { type: string; text?: unknown }

// Where each text block of a reply starts counting. Kept in the module, not
// in $.state: a drawing that reads $.state waits on the host for it and is
// drawn again on every write, which made the transcript slow to load and to
// scroll. session.start fills it again after a reload.
const numbering: Starts = { byId: {}, byText: {}, pending: 0 }

// The start each block of a reply was last drawn with, by its text's key: a
// rebuild that moves one of them asks for a redraw.
const drawnStarts = new Map<string, number>()

// What a click on a line's number puts in the prompt: the line, quoted, under
// its number, so the question that follows says which line it is about.
function quoteOf(n: number, text: string): string {
  const lines = text.split('\n')
  if (lines.length === 1) return `> ${n}번 줄: ${text}\n`
  return `> ${n}번 줄:\n${lines.map(line => `> ${line}`).join('\n')}\n`
}

const textsOf = (content: readonly ApiBlock[]) =>
  content.flatMap(b => (b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '' ? [b.text] : []))

const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g

// A user message that opens a reply: the person's words, not a tool's
// result or a reminder the engine slipped in between two model calls.
const isPrompt = (message: SessionMessage) =>
  message.role === 'user' &&
  (message.toolResults ?? []).length === 0 &&
  message.text.replace(REMINDER, '').trim() !== ''

// Every reply's text blocks, in order: the assistant messages between two of
// the person's prompts (a user message that answers no tool call).
function replies(messages: readonly SessionMessage[]): string[][] {
  const all: string[][] = [[]]
  for (const message of messages) {
    if (message.role === 'user') {
      if (isPrompt(message) && all[all.length - 1]!.length > 0) all.push([])
    } else if (message.text.trim() !== '') {
      all[all.length - 1]!.push(message.text)
    }
  }
  return all.filter(blocks => blocks.length > 0)
}

// The transcript's rows, not its API form: that one carries every tool
// result whole, more than twice the bytes over the boundary.
async function sessionMessages($: EngineInterface): Promise<readonly SessionMessage[]> {
  const found = await $.session.messages()
  return Array.isArray(found) ? found : []
}

async function rebuild($: EngineInterface): Promise<void> {
  const byText: Record<string, number> = {}
  let pending = 0
  const messages = await sessionMessages($)
  for (const blocks of replies(messages)) {
    const { starts: offsets } = numberReply(blocks)
    blocks.forEach((text, k) => (byText[textKey(text)] = offsets[k]!))
    pending = offsets.at(-1)! + lastNumber(splitUnits(blocks.at(-1)!))
  }
  const last = messages.at(-1)
  if (last !== undefined && isPrompt(last)) pending = 0
  numbering.byText = byText
  numbering.pending = pending
  // A block drawn before the transcript was read counted from 0: redraw it.
  if ([...drawnStarts].some(([key, start]) => (byText[key] ?? pending) !== start)) $.ui.invalidate('ui.render')
}

// The engine's reply bullet: ⏺ on macOS, ● elsewhere. A module has no
// `process.platform`; a macOS home lives under /Users. The first replies are
// drawn before the host answers, which it is slow to do while a session
// loads, so they draw ⏺ and are drawn again only if the answer is ●.
const GUESSED_GLYPH = '⏺'
let bulletGlyph: string | undefined
let isGlyphGuessed = false
let bulletRead: Promise<void> | undefined
function readBullet($: EngineInterface): void {
  bulletRead ??= $.env.get('HOME').then(
    home => {
      bulletGlyph = (home ?? '').startsWith('/Users/') ? '⏺' : '●'
      if (isGlyphGuessed && bulletGlyph !== GUESSED_GLYPH) $.ui.invalidate('ui.render')
    },
    () => {
      bulletGlyph = '●' // a host that answers no env reads draws the default
      if (isGlyphGuessed) $.ui.invalidate('ui.render')
    },
  )
}

// The trees last drawn, by everything a tree is drawn from: the scroll
// reports which rows are on screen, and each report draws the reply again.
const MAX_TREES = 200
const trees = new Map<string, RenderElement>()

async function describeRefs($: EngineInterface, refs: number[]): Promise<string | undefined> {
  const reply = replies(await sessionMessages($)).at(-1)
  if (reply === undefined) return undefined
  const { lines } = numberReply(reply)
  const last = Math.max(0, ...lines.keys())
  // With a few lines asked about, the lines around each come too, so a line
  // that only reads as part of its neighbours is understood with them.
  const isNear = refs.length <= 3
  const found = refs.flatMap(n => {
    const text = lines.get(n)
    if (text === undefined) return [`- line ${n}: none; the reply's lines run from 1 to ${last}`]
    const around = isNear ? [n - 1, n + 1].filter(k => lines.has(k) && !refs.includes(k)) : []
    return [
      `- line ${n}: ${JSON.stringify(text)}`,
      ...around.map(k => `  (line ${k}, beside it: ${JSON.stringify(lines.get(k))})`),
    ]
  })

  return [
    '[line-numbers mod] The user reads your replies with line numbers in a left gutter, numbered',
    'from 1 in each reply and on across its tool calls; fence markers and blank lines get none, and',
    'a table is one line. That differs from counting the raw markdown, so do not recount: the line',
    'numbers in their message point at exactly these lines of your previous reply, as the gutter',
    'showed them:',
    ...found,
  ].join('\n')
}

export const register: Register = on => {
  let isMainScreenNoted = false

  // The transcript is read in the background: nothing waits on it, and a
  // block it renumbers is drawn again when it lands.
  on('session.start', async ($, e, next) => {
    readBullet($)
    const result = await next(e)
    void rebuild($).catch(() => undefined)
    return result
  })

  // Keeps each block's start current as the conversation grows: a prompt of
  // the person's opens a reply at 0, each text block moves the count on.
  on('session.append', async ($, e, next) => {
    const result = await next(e)
    const { message } = e
    if (e.agentId !== undefined) return result
    if (e.door === 'prompt' || e.door === 'command') {
      numbering.pending = 0
    } else if (message.type === 'assistant') {
      const texts = textsOf(message.content)
      if (texts.length > 0) numbering.byId[e.uuid] = numbering.pending
      for (const text of texts) {
        numbering.byText[textKey(text)] = numbering.pending
        numbering.pending += lastNumber(splitUnits(text))
      }
    }
    return result
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isSummary) return next(e)

    // Only the fullscreen renderer can keep the gutter out of a mouse copy;
    // on the main screen the terminal copies every cell, so draw none there.
    if (e.viewport?.isFullscreen !== true) {
      if (!isMainScreenNoted && e.viewport !== undefined) {
        isMainScreenNoted = true
        $.ui.toast('line-numbers: 줄번호는 전체화면 모드에서만 보여요 (/tui fullscreen)')
      }
      return next(e)
    }

    // Where this block starts in its reply. `isFirstOfReply` is no guide: the
    // engine sets it on every block that draws a bullet, the first after each
    // tool call too, while a reply counts on across its tool calls. A block
    // not appended yet is the one streaming, next in the reply in progress.
    const { text, isFirstOfReply } = e.props
    const key = textKey(text)
    const offset = numbering.byId[e.requestId] ?? numbering.byText[key] ?? numbering.pending
    drawnStarts.set(key, offset)
    readBullet($)
    if (bulletGlyph === undefined && isFirstOfReply) isGlyphGuessed = true
    const glyph = bulletGlyph ?? GUESSED_GLYPH
    const columns = e.viewport.columns

    const treeKey = `${columns}:${offset}:${isFirstOfReply ? glyph : ''}:${key}`
    const drawn = trees.get(treeKey)
    if (drawn !== undefined) {
      trees.delete(treeKey) // most recent last, so the oldest leaves first
      trees.set(treeKey, drawn)
      return drawn
    }

    const units = splitUnits(text)
    const count = lastNumber(units)
    if (count === 0) return next(e)
    const { Box, Button, Code, Markdown, Text } = $.ui.resolve(e)

    // "● " + the number + " │ ": the gutter, `width` cells in all. Two
    // digits at least, so a block renumbered after it was drawn keeps its
    // width and wraps as it did.
    const digits = Math.max(2, String(offset + count).length)
    const width = digits + 5
    const room = columns - width
    let isBulletDue = isFirstOfReply
    let height = 0

    const label = (n: number | undefined) => `${n === undefined ? ' '.repeat(digits) : String(n).padStart(digits)} │ `

    // One row: its number beside `content`, `rows` the most it can wrap to,
    // `quote` the line a click on the number puts in the prompt. Each element
    // of a row costs every redraw, and a reply at the screen's edge is drawn
    // again at each step of a scroll, so a row holds no more than its gutter
    // and its content. The number is a Button over the mask: the mask keeps
    // it out of a copy, as it does any cell there.
    const row = (n: number, rows: number, content: RenderElement | null, quote: string) => {
      height += rows
      const press = () => $.prompt.fill({ text: quoteOf(n, quote), mode: 'insert' })
      // A list, not a Fragment: a Fragment stacks its children as a column.
      const gutter = isBulletDue
        ? [
            <Text color="text">{`${glyph} `}</Text>,
            <Button key={`n${n}`} plain dimColor label={label(n)} onPress={press} />,
          ]
        : <Button key={`n${n}`} plain dimColor label={`  ${label(n)}`} onPress={press} />
      isBulletDue = false
      return (
        <Box flexDirection="row">
          <Box flexDirection="row" width={width} flexShrink={0}>
            {gutter}
          </Box>
          {content}
        </Box>
      )
    }
    const blank = () => {
      height += 1
      return <Text dimColor>{`  ${label(undefined)}`}</Text>
    }

    // A run of a table cell, styled as the engine styles inline markdown.
    const spanOf = ({ text, bold, italic, strike, underline, dim, code }: Span): RenderElement | string => {
      if (!bold && !italic && !strike && !underline && !dim && !code) return text
      const style: TextProps = {}
      if (bold) style.weight = 'bold'
      if (italic) style.italic = true
      if (strike) style.strikethrough = true
      if (underline) style.underline = true
      if (dim) style.dimColor = true
      if (code) style.color = 'permission'
      return <Text {...style}>{text}</Text>
    }

    const rowsOf = (u: Unit): RenderElement[] => {
      switch (u.kind) {
        case 'blank':
          return [blank()]
        case 'code':
          return u.lines.map((line, k) =>
            row(
              offset + u.n + k,
              rowsAtMost(line, room),
              line === '' ? null : <Code source={line} language={u.language === '' ? undefined : u.language} />,
              line,
            ),
          )
        case 'table': {
          // The engine sizes a table to the whole terminal, past the room
          // beside the gutter, so the table is drawn here to fit that room:
          // one row per line, which makes the row exactly that tall. Like
          // the engine's (4 cells under the terminal's width, from a body 2
          // cells in), it ends 2 cells short of the edge, so a glyph the
          // terminal draws wider than counted cannot push a rule onto the
          // next row.
          const lines = layoutTable(u.text, room - 2)
          if (lines === undefined) {
            const textRows = u.text.split('\n').reduce((sum, line) => sum + rowsAtMost(line, room) + 1, 2)
            return [row(offset + u.n, textRows, <Markdown text={u.text} />, u.text)]
          }
          return [
            row(
              offset + u.n,
              lines.length,
              <Box flexDirection="column">
                {lines.map(line => (
                  <Text wrap="truncate-end">{line.length === 0 ? ' ' : line.map(spanOf)}</Text>
                ))}
              </Box>,
              u.text,
            ),
          ]
        }
        case 'text':
          return [
            row(
              offset + u.n,
              rowsAtMost(u.text, room - u.indent),
              u.indent === 0 ? (
                <Markdown text={u.text} />
              ) : (
                <Box paddingLeft={u.indent}>
                  <Markdown text={u.text} />
                </Box>
              ),
              u.text,
            ),
          ]
      }
    }
    const rows = units.flatMap(rowsOf)

    // The engine leaves a Code's line gutter, and every cell left of it, out
    // of a fullscreen copy: one Code under the whole gutter column is that
    // mask, clipped to the reply. Its gutter, " " + digits + " ", numbers
    // from 10^(width-2), so it is width+1 cells; a clip leaves its last cell
    // out, so the clip is width+1 wide and the mask exactly `width`. Its
    // numbers show wherever nothing is drawn over them: the rule runs as far
    // as the mask, both at least as tall as the reply (`height` errs high),
    // and each row's number is drawn over the rule.
    const tree = (
      <Box flexDirection="column" marginTop={1}>
        <Box position="absolute" top={0} bottom={0} left={0} width={width + 1} overflow="hidden">
          <Code source={Array(height + 1).fill(' ').join('\n')} startLine={10 ** (width - 2)} />
        </Box>
        <Box position="absolute" top={0} bottom={0} left={0} width={width} overflow="hidden">
          <Text dimColor>{Array(height + 1).fill(`${' '.repeat(width - 2)}│ `).join('\n')}</Text>
        </Box>
        {rows}
      </Box>
    )
    if (trees.size >= MAX_TREES) trees.delete(trees.keys().next().value!)
    trees.set(treeKey, tree)
    return tree
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined || e.isMeta === true) return next(e)
    const refs = findLineRefs(e.text)
    if (refs.length === 0) return next(e)

    const note = await describeRefs($, refs)
    if (note === undefined) return next(e)
    return next({ ...e, context: [...(e.context ?? []), note] })
  }).catch(($, e, next) => next(e)) // a failed lookup never blocks the prompt
}
