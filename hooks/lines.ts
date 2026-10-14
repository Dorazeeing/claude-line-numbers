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

// East Asian wide and fullwidth characters, and the emoji drawn as emoji by
// default: two cells each, as the engine's Bun.stringWidth counts them.
const WIDE =
  /[\u{1100}-\u{115F}\u{231A}\u{231B}\u{2329}\u{232A}\u{23E9}-\u{23EC}\u{23F0}\u{23F3}\u{25FD}\u{25FE}\u{2614}\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}\u{26AB}\u{26BD}\u{26BE}\u{26C4}\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2705}\u{270A}\u{270B}\u{2728}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2795}-\u{2797}\u{27B0}\u{27BF}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{2E80}-\u{303E}\u{3041}-\u{33FF}\u{3400}-\u{4DBF}\u{4E00}-\u{A4CF}\u{A960}-\u{A97F}\u{AC00}-\u{D7A3}\u{F900}-\u{FAFF}\u{FE10}-\u{FE19}\u{FE30}-\u{FE6F}\u{FF00}-\u{FF60}\u{FFE0}-\u{FFE6}\u{16FE0}-\u{16FE4}\u{16FF0}\u{16FF1}\u{17000}-\u{18D08}\u{1AFF0}-\u{1B2FF}\u{1F004}\u{1F0CF}\u{1F18E}\u{1F191}-\u{1F19A}\u{1F200}-\u{1F320}\u{1F32D}-\u{1F335}\u{1F337}-\u{1F37C}\u{1F37E}-\u{1F393}\u{1F3A0}-\u{1F3CA}\u{1F3CF}-\u{1F3D3}\u{1F3E0}-\u{1F3F0}\u{1F3F4}\u{1F3F8}-\u{1F43E}\u{1F440}\u{1F442}-\u{1F4FC}\u{1F4FF}-\u{1F53D}\u{1F54B}-\u{1F54E}\u{1F550}-\u{1F567}\u{1F57A}\u{1F595}\u{1F596}\u{1F5A4}\u{1F5FB}-\u{1F64F}\u{1F680}-\u{1F6C5}\u{1F6CC}\u{1F6D0}-\u{1F6D2}\u{1F6D5}-\u{1F6D7}\u{1F6DC}-\u{1F6DF}\u{1F6EB}\u{1F6EC}\u{1F6F4}-\u{1F6FC}\u{1F7E0}-\u{1F7EB}\u{1F7F0}\u{1F90C}-\u{1F93A}\u{1F93C}-\u{1F945}\u{1F947}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

// What rides on the character before it and takes no cell of its own:
// combining marks, joiners, variation selectors, a syllable's later jamo,
// skin tones.
const RIDER = /[\p{Mn}\p{Me}\p{Cf}\u{1160}-\u{11FF}\u{D7B0}-\u{D7FF}\u{1F3FB}-\u{1F3FF}]/u
const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/u
const PICTOGRAPH = /\p{Extended_Pictographic}/u
const JOINER = '\u{200D}'
const EMOJI_STYLE = '\u{FE0F}'
const PRINTABLE_ASCII = /^[ -~]*$/

/**
 * The text cut where a terminal draws one character: a base, with the marks
 * and selectors that ride on it and the emoji a zero-width joiner joins.
 */
export function clusters(text: string): string[] {
  const out: string[] = []
  let isJoined = false
  for (const ch of text) {
    // nothing below U+00AD rides, so plain text skips the patterns
    const rides = (isJoined && PICTOGRAPH.test(ch)) || (ch >= '\u{AD}' && RIDER.test(ch))
    if (out.length > 0 && rides) out[out.length - 1] += ch
    else out.push(ch)
    isJoined = ch === JOINER
  }
  return out
}

/** Cells one cluster takes: two when wide, or drawn as emoji (U+FE0F). */
export function clusterWidth(cluster: string): number {
  const code = cluster.codePointAt(0) ?? 32
  if (cluster.length === 1) {
    // the common cases first, with no pattern to run: Latin, then Hangul
    if (code < 0x300 && code !== 0xad) return 1
    if (code >= 0xac00 && code <= 0xd7a3) return 2
  }
  const base = String.fromCodePoint(code)
  if (SKIN_TONE.test(base)) return 2 // a skin tone with nothing to ride on draws alone
  if (RIDER.test(base)) return 0
  return WIDE.test(base) || cluster.includes(EMOJI_STYLE) ? 2 : 1
}

/** Terminal cells a text takes: two for a wide (CJK, Hangul, emoji) character. */
export function displayWidth(text: string): number {
  if (PRINTABLE_ASCII.test(text)) return text.length
  let width = 0
  for (const cluster of clusters(text)) width += clusterWidth(cluster)
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
