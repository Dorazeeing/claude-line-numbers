// How a reply's markdown is cut into numbered lines. The gutter and the
// prompt-side lookup both go through splitUnits, so "line 14" means the same
// thing on screen and to the model.

export type Unit =
  | { kind: 'text'; n: number; text: string; indent: number }
  | { kind: 'table'; n: number; text: string }
  | { kind: 'code'; n: number; language: string; lines: string[] }
  | { kind: 'blank' }

const FENCE = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/
const TABLE_ROW = /^\s*\|/

function indentWidth(line: string): number {
  let width = 0
  for (const ch of line) {
    if (ch === ' ') width += 1
    else if (ch === '\t') width += 4
    else break
  }
  return width
}

/**
 * Cuts markdown into the rows the gutter numbers, from 1: each non-blank
 * line, each line inside a fence, and each table as a whole. Fence markers
 * and blank lines get no number.
 */
export function splitUnits(markdown: string): Unit[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 0 && lines[0]!.trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop()

  const units: Unit[] = []
  let n = 0
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1]!
      const closing = new RegExp(`^\\s*${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`)
      const body: string[] = []
      i += 1
      while (i < lines.length && !closing.test(lines[i]!)) {
        body.push(lines[i]!)
        i += 1
      }
      i += 1
      if (body.length === 0) body.push('')
      units.push({ kind: 'code', n: n + 1, language: fence[2] ?? '', lines: body })
      n += body.length
      continue
    }
    if (TABLE_ROW.test(line)) {
      const rows: string[] = []
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) {
        rows.push(lines[i]!.trim())
        i += 1
      }
      n += 1
      units.push({ kind: 'table', n, text: rows.join('\n') })
      continue
    }
    if (line.trim() === '') {
      units.push({ kind: 'blank' })
      i += 1
      continue
    }
    n += 1
    units.push({ kind: 'text', n, text: line.trim(), indent: indentWidth(line) })
    i += 1
  }
  return units
}

/** The last number splitUnits gives out; 0 when it numbers nothing. */
export function lastNumber(units: readonly Unit[]): number {
  for (let k = units.length - 1; k >= 0; k -= 1) {
    const u = units[k]!
    if (u.kind === 'code') return u.n + u.lines.length - 1
    if (u.kind !== 'blank') return u.n
  }
  return 0
}

/** Each numbered line's text, by its number, the block's own from 1. */
export function lineTexts(units: readonly Unit[]): Map<number, string> {
  const byNumber = new Map<number, string>()
  for (const u of units) {
    if (u.kind === 'code') u.lines.forEach((text, k) => byNumber.set(u.n + k, text))
    else if (u.kind !== 'blank') byNumber.set(u.n, u.text)
  }
  return byNumber
}

/** A short key for a block's text: its length and an FNV-1a hash of it. */
export function textKey(text: string): string {
  const trimmed = text.trim()
  let hash = 0x811c9dc5
  for (let k = 0; k < trimmed.length; k += 1) {
    hash ^= trimmed.charCodeAt(k)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${trimmed.length}:${(hash >>> 0).toString(36)}`
}

/**
 * A reply's lines numbered from 1 across all its text blocks: where each
 * block starts, and every line's text by its number in the reply.
 */
export function numberReply(blocks: readonly string[]): { starts: number[]; lines: Map<number, string> } {
  const starts: number[] = []
  const lines = new Map<number, string>()
  let offset = 0
  for (const block of blocks) {
    starts.push(offset)
    const units = splitUnits(block)
    for (const [n, text] of lineTexts(units)) lines.set(offset + n, text)
    offset += lastNumber(units)
  }
  return { starts, lines }
}

const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹏＀-｠￠-￦]/

/** Terminal cells a text takes: two for a wide (CJK, Hangul) character. */
export function displayWidth(text: string): number {
  let width = 0
  for (const ch of text) width += WIDE.test(ch) ? 2 : 1
  return width
}

/**
 * At least as many rows as a line of `text` can wrap to in `columns` cells.
 * Too many costs nothing (the gutter is clipped to its row); too few would
 * leave rows of a long line without a gutter, so it errs high.
 */
export function rowsAtMost(text: string, columns: number): number {
  const room = Math.max(8, columns - 4)
  return Math.min(400, Math.ceil((displayWidth(text) * 1.25) / room) + 1)
}

const MAX_REFS = 40
const RANGE_SEP = /^(?:~|-|–|—|부터|에서|to|through)$/i
const KO_REF =
  /((?:\d{1,4}\s*(?:번째|번)?\s*(?:,|~|-|–|—|부터|에서|와|과|이랑|랑|하고|및|그리고)\s*)*\d{1,4})\s*(?:번째|번)?\s*(?:줄|라인|행)/g
const EN_REF = /\blines?\s*((?:\d{1,4}\s*(?:,|-|–|~|and|&|to|through)\s*)*\d{1,4})\b/gi
const SHORT_REF = /\bL(\d{1,4}(?:\s*[-–~]\s*L?\d{1,4})?)\b/g

function expand(group: string, into: Set<number>): void {
  const tokens = group.match(/\d{1,4}|~|-|–|—|부터|에서|to|through/gi) ?? []
  let previous: number | undefined
  let isRange = false
  for (const token of tokens) {
    if (RANGE_SEP.test(token)) {
      isRange = previous !== undefined
      continue
    }
    const value = Number(token)
    if (isRange && previous !== undefined) {
      const [from, to] = previous <= value ? [previous, value] : [value, previous]
      for (let k = from; k <= to && into.size < MAX_REFS; k += 1) into.add(k)
    } else if (into.size < MAX_REFS) {
      into.add(value)
    }
    previous = value
    isRange = false
  }
}

/**
 * The line numbers a prompt points at: "14번 줄", "14~16번 줄", "3, 5번째 줄",
 * "14행", "line 14", "lines 3-5", "L14". Sorted, at most 40.
 */
export function findLineRefs(prompt: string): number[] {
  const found = new Set<number>()
  for (const pattern of [KO_REF, EN_REF, SHORT_REF]) {
    for (const match of prompt.matchAll(pattern)) expand(match[1]!, found)
  }
  return [...found].filter(n => n > 0).sort((a, b) => a - b)
}
