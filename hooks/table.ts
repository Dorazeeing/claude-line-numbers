// How a markdown table is drawn beside the gutter. The engine lays a table
// out for the whole terminal, up to its width less 4 cells: wider than the
// room the gutter leaves, so every line of a wide table would wrap and break
// its rules. This lays it out the engine's way for the room it is given, one
// drawn line per row, so the gutter beside it also knows how tall it is.

import { clusterWidth, clusters, displayWidth } from './lines'

/** A run of a cell's text in one style, as a `Text` draws it. */
export type Span = {
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  underline?: boolean
  dim?: boolean
  /** Inline code, which the engine draws in the theme's `permission` color. */
  code?: boolean
}

type Style = Omit<Span, 'text'>
type Align = 'left' | 'center' | 'right'

/** What a cell's text is cut into to wrap: words, the gaps between them, `<br>`s. */
type Token = { kind: 'word'; spans: Span[]; width: number } | { kind: 'space'; style: Style } | { kind: 'break' }

// The engine's own limits for a table.
const MIN_COLUMN = 3
const MAX_CELL_LINES = 4
const MAX_ROWS = 200
const MAX_RULE = 40

const DELIMITER = /^:?-+:?$/
const PUNCTUATION = /[!-/:-@[-`{-~]/
// A run with nothing for the inline parser to look at, and the controls a
// `Text` refuses, which are dropped.
const PLAIN_RUN = /[^\\`<!\[*_~&\x00-\x08\x0B-\x1F\x7F-\x9F]+/y
const CONTROL = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/
const CODE = /^(`+)(?!`)([\s\S]*?[^`])\1(?!`)/
// Code spans and escapes, which no emphasis marker may pair across: masked
// out of the text emphasis is matched in, with a neutral character apiece.
const MASKED = /(`+)(?!`)[\s\S]*?[^`]\1(?!`)|\\[!-/:-@[-`{-~]/g
const NEUTRAL = '\u{E000}'
const BACKTICKS = /^`+/
const BREAK = /^<br\s*\/?>/i
const AUTOLINK = /^<((?:https?|ftp|file|mailto):[^\s<>]*)>/i
const IMAGE = /^!\[([^\]]*)\]\([^)]*\)/
const LINK = /^\[([^\]]*)\]\(\s*<?([^\s)>]*)>?(?:\s+"[^"]*")?\s*\)/
const ENTITY = /^&(#\d{1,7}|#[xX][\da-fA-F]{1,6}|[a-zA-Z]+);/
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const WORD_CHAR = /[\p{L}\p{N}]/u
const EMPHASIS: { pattern: RegExp; style: Style; isIntraword: boolean }[] = [
  { pattern: /^\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/, style: { bold: true, italic: true }, isIntraword: true },
  { pattern: /^\*\*(?=\S)([\s\S]*?\S)\*\*/, style: { bold: true }, isIntraword: true },
  { pattern: /^__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}])/u, style: { bold: true }, isIntraword: false },
  { pattern: /^~~(?=\S)([\s\S]*?\S)~~/, style: { strike: true }, isIntraword: true },
  { pattern: /^\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/, style: { italic: true }, isIntraword: true },
  { pattern: /^_(?=[^\s_])([\s\S]*?[^\s_])_(?![\p{L}\p{N}])/u, style: { italic: true }, isIntraword: false },
]

/** An entity's character; none for a control or a surrogate, which a `Text` refuses. */
function entity(name: string): string | undefined {
  if (name.startsWith('#')) {
    const point = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    const isDrawable = point >= 0x20 && !(point >= 0x7f && point < 0xa0) && !(point >= 0xd800 && point < 0xe000)
    return isDrawable && point <= 0x10ffff ? String.fromCodePoint(point) : undefined
  }
  return NAMED[name]
}

/**
 * A cell's inline markdown as styled runs, `null` where a `<br>` breaks the
 * line: code, bold, italic, strikethrough and links, as the engine draws them.
 */
function inline(source: string, style: Style, out: (Span | null)[]): void {
  let plain = ''
  const flush = () => {
    if (plain !== '') out.push({ ...style, text: plain })
    plain = ''
  }
  const shadow = source.replace(MASKED, masked => NEUTRAL.repeat(masked.length))
  let k = 0
  while (k < source.length) {
    PLAIN_RUN.lastIndex = k
    const run = PLAIN_RUN.exec(source)
    if (run) {
      plain += run[0]
      k += run[0].length
      continue
    }
    if (CONTROL.test(source[k]!)) {
      k += 1
      continue
    }
    const rest = source.slice(k)
    const next = rest[1]
    if (rest[0] === '\\' && next !== undefined && PUNCTUATION.test(next)) {
      plain += next
      k += 2
      continue
    }
    let m = CODE.exec(rest)
    if (m) {
      flush()
      const body = m[2]!
      const isPadded = body.length > 1 && body.startsWith(' ') && body.endsWith(' ') && body.trim() !== ''
      out.push({ ...style, code: true, text: isPadded ? body.slice(1, -1) : body })
      k += m[0].length
      continue
    }
    if (rest[0] === '`') {
      const run = BACKTICKS.exec(rest)![0]
      plain += run
      k += run.length
      continue
    }
    if ((m = BREAK.exec(rest))) {
      flush()
      out.push(null)
      k += m[0].length
      continue
    }
    if ((m = AUTOLINK.exec(rest))) {
      flush()
      out.push({ ...style, underline: true, text: m[1]! })
      k += m[0].length
      continue
    }
    if ((m = IMAGE.exec(rest))) {
      plain += m[1]!
      k += m[0].length
      continue
    }
    if ((m = LINK.exec(rest))) {
      flush()
      const label = m[1]!
      const href = m[2]!
      inline(label, { ...style, underline: true }, out)
      if (href !== '' && href !== label) out.push({ ...style, dim: true, text: ` (${href})` })
      k += m[0].length
      continue
    }
    const isAfterWord = WORD_CHAR.test(source[k - 1] ?? ' ')
    const masked = shadow.slice(k)
    const emphasis = EMPHASIS.find(e => (e.isIntraword || !isAfterWord) && e.pattern.test(masked))
    if (emphasis) {
      m = emphasis.pattern.exec(masked)!
      const marker = (m[0].length - m[1]!.length) / 2
      flush()
      inline(source.slice(k + marker, k + marker + m[1]!.length), { ...style, ...emphasis.style }, out)
      k += m[0].length
      continue
    }
    if ((m = ENTITY.exec(rest))) {
      const decoded = entity(m[1]!)
      if (decoded !== undefined) {
        plain += decoded
        k += m[0].length
        continue
      }
    }
    plain += rest[0]
    k += 1
  }
  flush()
}

const widthOf = (spans: readonly Span[]) => spans.reduce((sum, s) => sum + displayWidth(s.text), 0)

/** A cell's runs cut into words, the single gaps between them and its breaks. */
function tokensOf(runs: readonly (Span | null)[]): Token[] {
  const tokens: Token[] = []
  let word: Span[] = []
  const endWord = () => {
    if (word.length > 0) tokens.push({ kind: 'word', spans: word, width: widthOf(word) })
    word = []
  }
  for (const run of runs) {
    if (run === null) {
      endWord()
      tokens.push({ kind: 'break' })
      continue
    }
    const { text, ...style } = run
    for (const part of text.split(/(\s+)/)) {
      if (part === '') continue
      if (/^\s+$/.test(part)) {
        endWord()
        if (tokens.at(-1)?.kind !== 'space') tokens.push({ kind: 'space', style })
      } else {
        word.push({ ...style, text: part })
      }
    }
  }
  endWord()
  return tokens
}

/** A word too wide for a line, cut into pieces that each fit one. */
function cut(spans: readonly Span[], width: number): { spans: Span[]; width: number }[] {
  const pieces: { spans: Span[]; width: number }[] = []
  let piece: { spans: Span[]; width: number } = { spans: [], width: 0 }
  for (const { text, ...style } of spans) {
    let run = ''
    for (const cluster of clusters(text)) {
      const cells = clusterWidth(cluster)
      if (piece.width > 0 && piece.width + cells > width) {
        if (run !== '') piece.spans.push({ ...style, text: run })
        pieces.push(piece)
        piece = { spans: [], width: 0 }
        run = ''
      }
      run += cluster
      piece.width += cells
    }
    if (run !== '') piece.spans.push({ ...style, text: run })
  }
  if (piece.spans.length > 0) pieces.push(piece)
  return pieces
}

/**
 * Words filled into lines of at most `width` cells, a word wider than a line
 * cut where it ends. Empty lines are dropped, as the engine drops them; a
 * cell with no text is one empty line.
 */
function wrap(tokens: readonly Token[], width: number): Span[][] {
  const lines: Span[][] = []
  let line: Span[] = []
  let used = 0
  let gap: Style | undefined
  const endLine = () => {
    if (line.length > 0) lines.push(line)
    line = []
    used = 0
    gap = undefined
  }
  for (const token of tokens) {
    if (token.kind === 'break') {
      endLine()
    } else if (token.kind === 'space') {
      if (line.length > 0) gap = token.style
    } else {
      const spacing = gap === undefined ? 0 : 1
      if (used + spacing + token.width <= width) {
        if (gap !== undefined) line.push({ ...gap, text: ' ' })
        line.push(...token.spans)
        used += spacing + token.width
        gap = undefined
        continue
      }
      endLine()
      const pieces = cut(token.spans, width)
      for (const piece of pieces.slice(0, -1)) lines.push(piece.spans)
      line = pieces.at(-1)?.spans ?? []
      used = pieces.at(-1)?.width ?? 0
    }
  }
  endLine()
  return lines.length > 0 ? lines : [[]]
}

/** Adjacent runs of one style joined, so a line draws as few `Text`s as it can. */
function merge(spans: readonly Span[]): Span[] {
  const out: Span[] = []
  const isSameStyle = (a: Span, b: Span) =>
    !a.bold === !b.bold &&
    !a.italic === !b.italic &&
    !a.strike === !b.strike &&
    !a.underline === !b.underline &&
    !a.dim === !b.dim &&
    !a.code === !b.code
  for (const span of spans) {
    if (span.text === '') continue
    const last = out.at(-1)
    if (last !== undefined && isSameStyle(last, span)) out[out.length - 1] = { ...last, text: last.text + span.text }
    else out.push(span)
  }
  return out
}

/** Whether the pipe at `index` is escaped: an odd run of backslashes before it. */
function isEscaped(line: string, index: number): boolean {
  let isOdd = false
  for (let k = index - 1; k >= 0 && line[k] === '\\'; k -= 1) isOdd = !isOdd
  return isOdd
}

/** A row's cells: split at each pipe no backslash escapes, the outer pipes dropped. */
function cellsOf(row: string): string[] {
  let line = row.trim()
  if (line.startsWith('|')) line = line.slice(1)
  if (line.endsWith('|') && !isEscaped(line, line.length - 1)) line = line.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let k = 0; k < line.length; k += 1) {
    if (line[k] === '\\' && (line[k + 1] === '\\' || line[k + 1] === '|')) {
      // an escaped backslash stays for the inline parser; an escaped pipe is text
      cell += line[k + 1] === '|' ? '|' : '\\\\'
      k += 1
    } else if (line[k] === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += line[k]
    }
  }
  cells.push(cell.trim())
  return cells
}

function alignOf(delimiter: string): Align {
  const isLeft = delimiter.startsWith(':')
  const isRight = delimiter.endsWith(':')
  return isLeft && isRight ? 'center' : isRight ? 'right' : 'left'
}

const MAX_LAYOUTS = 64
const layouts = new Map<string, Span[][] | undefined>()

const notShown = (count: number) => `… ${count.toLocaleString()} more ${count === 1 ? 'row' : 'rows'} not shown`
const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0)

/**
 * The engine's form for a table too narrow to draw as a grid: each row's
 * cells as `header: value` lines, a short rule between rows.
 */
function stacked(headers: readonly string[], rows: readonly Token[][][], hidden: number, room: number): Span[][] {
  const width = Math.max(1, room - 1)
  const rule: Span[] = [{ text: '─'.repeat(Math.min(width, MAX_RULE)) }]
  const out: Span[][] = []
  for (const row of rows) {
    const lines: Span[][] = []
    row.forEach((tokens, k) => {
      const label = headers[k] ?? ''
      // one line per cell: a <br> reads as a space, as the engine joins it
      const words = tokens.map((t): Token => (t.kind === 'break' ? { kind: 'space', style: {} } : t))
      if (label === '' && !words.some(t => t.kind === 'word')) return
      const head: Token[] = label === '' ? [] : [...tokensOf([{ text: `${label}:`, bold: true }]), { kind: 'space', style: {} }]
      lines.push(...wrap([...head, ...words], width).filter(line => line.length > 0))
    })
    if (lines.length === 0) continue
    if (out.length > 0) out.push(rule)
    out.push(...lines)
  }
  if (hidden > 0) {
    if (out.length > 0) out.push(rule)
    out.push([{ text: notShown(hidden) }])
  }
  return out.length > 0 ? out : [[{ text: ' ' }]]
}

/**
 * A markdown table laid out to fit `room` cells, as the engine lays one out
 * for its own width: natural column widths when they fit, else each column
 * grown from its longest word toward its widest cell, else every word cut;
 * the stacked form when a cell would need more than 4 lines or the grid would
 * still not fit. Each line it returns is at most `room` cells wide.
 *
 * Undefined when `markdown` is no table (no delimiter row under the header):
 * the engine draws that as text.
 *
 * A reply is drawn again as it streams and scrolls, so the last layouts are
 * kept, by room and text; what it returns is shared and never changed.
 */
export function layoutTable(markdown: string, room: number): Span[][] | undefined {
  const key = `${room}\n${markdown}`
  if (layouts.has(key)) return layouts.get(key)
  const lines = layOut(markdown, room)
  if (layouts.size >= MAX_LAYOUTS) layouts.delete(layouts.keys().next().value!)
  layouts.set(key, lines)
  return lines
}

function layOut(markdown: string, room: number): Span[][] | undefined {
  const rows = markdown.split('\n').map(cellsOf)
  const header = rows[0]
  const delimiter = rows[1]
  if (header === undefined || delimiter === undefined) return undefined
  if (delimiter.length !== header.length || !delimiter.every(cell => DELIMITER.test(cell))) return undefined

  const count = header.length
  const aligns = delimiter.map(alignOf)
  const body = rows.slice(2)
  const hidden = Math.max(0, body.length - MAX_ROWS)
  const all = [header, ...body.slice(0, MAX_ROWS)].map(row =>
    Array.from({ length: count }, (_, k) => {
      const runs: (Span | null)[] = []
      inline(row[k] ?? '', {}, runs)
      return tokensOf(runs)
    }),
  )

  const lineWidths = (tokens: readonly Token[]) => {
    const widths = [0]
    for (const t of tokens) {
      if (t.kind === 'break') widths.push(0)
      else widths[widths.length - 1]! += t.kind === 'word' ? t.width : 1
    }
    return widths
  }
  const longestWord = (tokens: readonly Token[]) => Math.max(0, ...tokens.map(t => (t.kind === 'word' ? t.width : 0)))
  const mins = Array.from({ length: count }, (_, k) => Math.max(MIN_COLUMN, ...all.map(row => longestWord(row[k]!))))
  const naturals = Array.from({ length: count }, (_, k) =>
    Math.max(MIN_COLUMN, ...all.map(row => Math.max(...lineWidths(row[k]!)))),
  )

  const fit = Math.max(room, 8)
  const available = Math.max(fit - (1 + 3 * count), count * MIN_COLUMN)
  let widths: number[]
  if (sum(naturals) <= available) {
    widths = naturals
  } else if (sum(mins) <= available) {
    const extra = available - sum(mins)
    const growth = naturals.map((natural, k) => natural - mins[k]!)
    const total = sum(growth)
    widths = mins.map((min, k) => (total === 0 ? min : min + Math.floor((growth[k]! / total) * extra)))
  } else {
    const ratio = available / sum(mins)
    widths = mins.map(min => Math.max(Math.floor(min * ratio), MIN_COLUMN))
  }

  const wrapped = all.map(row => row.map((tokens, k) => wrap(tokens, widths[k]!)))
  const tallest = Math.max(...wrapped.flatMap(row => row.map(cell => cell.length)))
  const gridWidth = 1 + sum(widths.map(w => w + 3))
  if (tallest > MAX_CELL_LINES || gridWidth > fit) {
    const headers = all[0]!.map(tokens =>
      tokens.flatMap(t => (t.kind === 'word' ? [t.spans.map(s => s.text).join('')] : [])).join(' '),
    )
    return stacked(headers, all.slice(1), hidden, fit)
  }

  const rule = (left: string, cross: string, right: string): Span[] => [
    { text: left + widths.map(w => '─'.repeat(w + 2)).join(cross) + right },
  ]
  const lines: Span[][] = [rule('┌', '┬', '┐')]
  const drawRow = (cells: readonly Span[][][], isHeader: boolean) => {
    const height = Math.max(1, ...cells.map(cell => cell.length))
    for (let y = 0; y < height; y += 1) {
      const line: Span[] = [{ text: '│' }]
      cells.forEach((cell, k) => {
        const content = cell[y - Math.floor((height - cell.length) / 2)] ?? []
        const free = Math.max(0, widths[k]! - widthOf(content))
        const align = isHeader ? 'center' : aligns[k]!
        const before = align === 'right' ? free : align === 'center' ? Math.floor(free / 2) : 0
        line.push({ text: ' '.repeat(1 + before) }, ...content, { text: `${' '.repeat(free - before + 1)}│` })
      })
      lines.push(merge(line))
    }
  }
  // a rule under the header, even with no row under it, and between rows
  wrapped.forEach((cells, k) => {
    if (k > 1) lines.push(rule('├', '┼', '┤'))
    drawRow(cells, k === 0)
    if (k === 0) lines.push(rule('├', '┼', '┤'))
  })
  lines.push(rule('└', '┴', '┘'))
  if (hidden > 0) lines.push([{ text: notShown(hidden) }])
  return lines
}
