import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Starts } from '../types'
import { findLineRefs, lastNumber, numberReply, rowsAtMost, splitUnits, textKey } from './lines'
import type { Unit } from './lines'

type ApiBlock = { type: string; text?: unknown }
type ApiMessage = { role: 'user' | 'assistant'; content: readonly ApiBlock[] }

const starts = atom({ plugin: 'line-numbers', key: 'starts' } as const, { byText: {}, pending: 0 } as Starts)

const textsOf = (content: readonly ApiBlock[]) =>
  content.flatMap(b => (b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '' ? [b.text] : []))

// A user message that opens a reply: the person's words, not a tool's
// result or a reminder the engine slipped in between two model calls.
const isPrompt = (content: readonly ApiBlock[]) =>
  !content.some(b => b.type === 'tool_result') &&
  textsOf(content).some(text => !text.trimStart().startsWith('<system-reminder>'))

// Every reply's text blocks, in order: the assistant messages between two of
// the person's prompts (a user message that answers no tool call).
function replies(messages: readonly ApiMessage[]): string[][] {
  const all: string[][] = [[]]
  for (const message of messages) {
    if (message.role === 'user') {
      if (isPrompt(message.content) && all[all.length - 1]!.length > 0) all.push([])
      continue
    }
    all[all.length - 1]!.push(...textsOf(message.content))
  }
  return all.filter(blocks => blocks.length > 0)
}

async function apiMessages($: EngineInterface): Promise<readonly ApiMessage[]> {
  const found = await $.session.messages({ as: 'api' })
  return Array.isArray(found) ? (found as readonly ApiMessage[]) : []
}

async function rebuild($: EngineInterface): Promise<void> {
  const byText: Record<string, number> = {}
  let pending = 0
  const messages = await apiMessages($)
  for (const blocks of replies(messages)) {
    const { starts: offsets } = numberReply(blocks)
    blocks.forEach((text, k) => (byText[textKey(text)] = offsets[k]!))
    pending = offsets.at(-1)! + lastNumber(splitUnits(blocks.at(-1)!))
  }
  const last = messages.at(-1)
  if (last?.role === 'user' && isPrompt(last.content)) pending = 0
  await update($, starts, () => ({ byText, pending }))
}

// The engine's reply bullet: ⏺ on macOS, ● elsewhere. A module has no
// `process.platform`; a macOS home lives under /Users.
let bulletGlyph: string | undefined
async function bulletOf($: EngineInterface): Promise<string> {
  if (bulletGlyph === undefined) {
    let home = ''
    try {
      home = (await $.env.get('HOME')) ?? ''
    } catch {
      // a host that answers no env reads draws the default
    }
    bulletGlyph = home.startsWith('/Users/') ? '⏺' : '●'
  }
  return bulletGlyph
}

async function describeRefs($: EngineInterface, refs: number[]): Promise<string | undefined> {
  const reply = replies(await apiMessages($)).at(-1)
  if (reply === undefined) return undefined
  const { lines } = numberReply(reply)
  const found = refs.flatMap(n => {
    const text = lines.get(n)
    return text === undefined ? [] : [`- line ${n}: ${JSON.stringify(text)}`]
  })
  if (found.length === 0) return undefined

  return [
    '[line-numbers mod] The user reads your replies with line numbers in a left gutter, numbered',
    'from 1 in each reply; fence markers and blank lines get none, and a table is one line. That',
    'differs from counting the raw markdown, so do not recount: the line numbers in their message',
    'point at exactly these lines of your previous reply, as the gutter showed them:',
    ...found,
  ].join('\n')
}

export const register: Register = on => {
  let isMainScreenNoted = false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await rebuild($)
    return result
  })

  // Keeps each block's start current as the conversation grows: a prompt of
  // the person's opens a reply at 0, each text block moves the count on.
  on('session.append', async ($, e, next) => {
    const result = await next(e)
    const { message } = e
    if (e.agentId !== undefined) return result
    if (e.door === 'prompt' || e.door === 'command') {
      await update($, starts, s => (s.pending === 0 ? s : { ...s, pending: 0 }))
    } else if (message.type === 'assistant') {
      const texts = textsOf(message.content)
      if (texts.length > 0) {
        await update($, starts, s => {
          const byText = { ...s.byText }
          let pending = s.pending
          for (const text of texts) {
            byText[textKey(text)] = pending
            pending += lastNumber(splitUnits(text))
          }
          return { byText, pending }
        })
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

    const units = splitUnits(e.props.text)
    const count = lastNumber(units)
    if (count === 0) return next(e)

    const known = await read($, starts)
    const offset = e.props.isFirstOfReply ? 0 : (known.byText[textKey(e.props.text)] ?? known.pending)
    const columns = e.viewport.columns
    const glyph = await bulletOf($)
    const { Box, Code, Markdown, Text } = $.ui.resolve(e)

    // "● " + the number + " │ ": the gutter, `width` cells in all.
    const digits = String(offset + count).length
    const width = digits + 5
    let isBulletDue = e.props.isFirstOfReply

    // One row: the gutter beside `content`. The engine leaves a Code's line
    // gutter, and every cell left of it, out of a fullscreen copy: this Code
    // lies under the drawn gutter as that mask, clipped to the row. Its
    // gutter, " " + digits + " ", numbers from 10^(width-2), so it is
    // width+1 cells; a clip leaves its last cell out of the mask, so the
    // clip is width+1 wide and the mask exactly `width`.
    const row = (n: number | undefined, rows: number, content: RenderElement | null) => {
      const bullet = isBulletDue ? glyph : ' '
      isBulletDue = false
      const label = n === undefined ? ' '.repeat(digits) : String(n).padStart(digits)
      return (
        <Box flexDirection="row">
          <Box width={width} flexShrink={0}>
            <Box position="absolute" top={0} bottom={0} left={0} width={width + 1} overflow="hidden">
              <Code source={Array(rows + 1).fill(' ').join('\n')} startLine={10 ** (width - 2)} />
            </Box>
            <Text>
              <Text color="text">{bullet}</Text> <Text dimColor>{label} │ </Text>
            </Text>
            {rows > 1 ? (
              <Box position="absolute" top={1} bottom={0} left={0} width={width} overflow="hidden">
                <Text dimColor>{Array(rows - 1).fill(`${' '.repeat(width - 2)}│ `).join('\n')}</Text>
              </Box>
            ) : null}
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            {content}
          </Box>
        </Box>
      )
    }

    const room = columns - width
    const rowsOf = (u: Unit): RenderElement[] => {
      switch (u.kind) {
        case 'blank':
          return [row(undefined, 1, null)]
        case 'code':
          return u.lines.map((line, k) =>
            row(
              offset + u.n + k,
              rowsAtMost(line, room),
              line === '' ? null : <Code source={line} language={u.language === '' ? undefined : u.language} />,
            ),
          )
        case 'table': {
          const tableRows = u.text.split('\n').reduce((sum, line) => sum + rowsAtMost(line, room) + 1, 2)
          return [row(offset + u.n, tableRows, <Markdown text={u.text} />)]
        }
        case 'text':
          return [
            row(
              offset + u.n,
              rowsAtMost(u.text, room - u.indent),
              <Box paddingLeft={u.indent}>
                <Markdown text={u.text} />
              </Box>,
            ),
          ]
      }
    }

    return (
      <Box flexDirection="column" marginTop={1}>
        {units.flatMap(rowsOf)}
      </Box>
    )
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
