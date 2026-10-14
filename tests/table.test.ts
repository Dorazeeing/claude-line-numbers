import { describe, expect, test } from 'claude-code/testing'

import { displayWidth } from '../hooks/lines'
import { layoutTable } from '../hooks/table'
import type { Span } from '../hooks/table'

// The table from the report: wide enough that the engine draws it across the
// whole terminal, past the room the gutter leaves.
const WIDE = [
  '| 이유 | 설명 |',
  '|---|---|',
  '| **글자 인코딩이 제각각이었어요** | 예전엔 컴퓨터마다 한글을 EUC-KR(CP949), UTF-8 등 다른 방식으로 저장했어요. 바이트를 그대로 터미널에 출력하면 **깨진 글자**가 나올 수 있었어요 |',
  '| **스크립트가 읽기 쉬워요** | git 출력은 사람뿐 아니라 **프로그램이 읽기도** 해요. 기본값 `true`는 어떤 환경에서도 **순수 ASCII**로만 출력돼서 예측 가능해요 |',
  '| **터미널에 이상한 글자를 못 보내요** | 파일 이름에 터미널 제어 코드가 들어 있으면 터미널이 오작동할 수 있어요 |',
].join('\n')

const textOf = (line: readonly Span[]) => line.map(s => s.text).join('')
const widthOf = (line: readonly Span[]) => displayWidth(textOf(line))
const rule = (left: string, cross: string, right: string, widths: number[]) =>
  left + widths.map(w => '─'.repeat(w + 2)).join(cross) + right

describe('displayWidth', () => {
  test('counts cells as the terminal draws them', async () => {
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('한글')).toBe(4)
    expect(displayWidth('✅ ok')).toBe(5)
    expect(displayWidth('⚠\u{FE0F}')).toBe(2) // drawn as emoji by the selector
    expect(displayWidth('👨\u{200D}👩\u{200D}👧')).toBe(2) // one glyph, joined
    expect(displayWidth('e\u{301}')).toBe(1) // a combining accent takes no cell
    expect(displayWidth('·→…')).toBe(3) // ambiguous width draws narrow
    expect(displayWidth('a\u{200D} b')).toBe(3) // a joiner joins emoji only
    expect(displayWidth('\u{1F3FB}')).toBe(2) // a skin tone alone is drawn alone
  })
})

describe('layoutTable', () => {
  test('every line of a wide table fits the room it is given', async () => {
    for (const room of [136, 100, 74, 50, 30, 20]) {
      for (const line of layoutTable(WIDE, room)!) expect(widthOf(line)).toBeLessThanOrEqual(room)
    }
  })

  test('as a grid its rules stay whole: every line one width, corners at the ends', async () => {
    for (const room of [136, 100]) {
      const lines = layoutTable(WIDE, room)!.map(textOf)
      expect(lines.every(line => /^[┌├│└].*[┐┤│┘]$/.test(line))).toBe(true)
      expect(new Set(lines.map(displayWidth)).size).toBe(1)
      expect(lines[0]).toMatch(/^┌─+┬─+┐$/)
      expect(lines.at(-1)).toMatch(/^└─+┴─+┘$/)
    }
  })

  test('a table that fits draws at its natural width, as the engine draws it', async () => {
    const lines = layoutTable('| a | b |\n|---|---|\n| 1 | 2 |', 100)!
    expect(lines.map(textOf)).toEqual([
      '┌─────┬─────┐',
      '│  a  │  b  │',
      '├─────┼─────┤',
      '│ 1   │ 2   │',
      '└─────┴─────┘',
    ])
  })

  test('a long cell wraps within its column, the shorter cells set at the top line', async () => {
    // columns grow from their longest word (4, 4) toward their widest cell
    // with the 23 cells the room spares: 4 and 19
    const lines = layoutTable('| k | v |\n|---|---|\n| 짧음 | 하나 둘 셋 넷 다섯 여섯 일곱 여덟 |', 30)!
    expect(lines.map(textOf)).toEqual([
      rule('┌', '┬', '┐', [4, 19]),
      `│  k   │${' '.repeat(10)}v${' '.repeat(10)}│`,
      rule('├', '┼', '┤', [4, 19]),
      '│ 짧음 │ 하나 둘 셋 넷 다섯  │',
      `│      │ 여섯 일곱 여덟${' '.repeat(6)}│`,
      rule('└', '┴', '┘', [4, 19]),
    ])
  })

  test('cells keep their inline styles', async () => {
    const lines = layoutTable('| a | b |\n|---|---|\n| **굵게** | `코드` *기울임* ~~취소~~ |', 100)!
    const spans = lines[3]!
    expect(spans).toContainEqual({ text: '굵게', bold: true })
    expect(spans).toContainEqual({ text: '코드', code: true })
    expect(spans).toContainEqual({ text: '기울임', italic: true })
    expect(spans).toContainEqual({ text: '취소', strike: true })
    expect(textOf(spans)).toBe('│ 굵게 │ 코드 기울임 취소 │')
  })

  test('alignment, escaped pipes and <br>', async () => {
    const lines = layoutTable('| 왼 | 가운데 | 오른 |\n|:--|:-:|--:|\n| a \\| b | x<br>yy | 1 |', 100)!
    expect(lines.map(textOf)).toEqual([
      rule('┌', '┬', '┐', [5, 6, 4]),
      '│  왼   │ 가운데 │ 오른 │',
      rule('├', '┼', '┤', [5, 6, 4]),
      '│ a | b │   x    │    1 │',
      '│       │   yy   │      │',
      rule('└', '┴', '┘', [5, 6, 4]),
    ])
  })

  test('too narrow for a grid: the engine stacked form, still within the room', async () => {
    const lines = layoutTable(WIDE, 30)!
    expect(textOf(lines[0]!)).toBe('이유: 글자 인코딩이')
    expect(lines[0]![0]).toEqual({ text: '이유:', bold: true })
    expect(textOf(lines[1]!)).toBe('제각각이었어요')
    expect(lines.filter(line => /^─+$/.test(textOf(line)))).toHaveLength(2)
  })

  test('in the stacked form a <br> reads as a space', async () => {
    const lines = layoutTable(`| k | v |\n|---|---|\n| ${'a'.repeat(20)} | one<br>two |`, 20)!
    expect(lines.map(textOf)).toEqual(['k:', 'a'.repeat(19), 'a', 'v: one two'])
  })

  test('emphasis never pairs across a code span or an escape', async () => {
    const [, , , codeRow] = layoutTable('| a |\n|---|\n| 5*2 vs `5*2` |', 80)!
    expect(textOf(codeRow!)).toBe('│ 5*2 vs 5*2 │')
    expect(codeRow).toContainEqual({ text: '5*2', code: true })
    const [, , , escapeRow] = layoutTable('| a |\n|---|\n| *a \\* b* |', 80)!
    expect(textOf(escapeRow!)).toBe('│ a * b │')
    expect(escapeRow).toContainEqual({ text: 'a * b', italic: true })
  })

  test('an entity for a control character stays as written', async () => {
    const lines = layoutTable('| a | b |\n|---|---|\n| x&#27;[2J &#7; | &amp;&#x41; |', 80)!
    expect(textOf(lines[3]!)).toBe('│ x&#27;[2J &#7; │ &A  │')
  })

  test('a pipe after an escaped backslash still ends the cell', async () => {
    const lines = layoutTable('| x | y |\n|---|---|\n| a \\\\| b |', 80)!
    expect(textOf(lines[3]!)).toBe('│ a \\ │ b   │')
  })

  test('a table of a header alone keeps the rule under it', async () => {
    expect(layoutTable('| a | b |\n|---|---|', 80)!.map(textOf)).toEqual([
      '┌─────┬─────┐',
      '│  a  │  b  │',
      '├─────┼─────┤',
      '└─────┴─────┘',
    ])
  })

  test('rows past 200 are counted, not drawn', async () => {
    const body = Array.from({ length: 203 }, (_, k) => `| ${k} |`)
    const lines = layoutTable(['| n |', '|---|', ...body].join('\n'), 80)!
    expect(textOf(lines.at(-1)!)).toBe('… 3 more rows not shown')
  })

  test('pipe rows with no delimiter row are no table', async () => {
    expect(layoutTable('| a | b |\n| 1 | 2 |', 80)).toBeUndefined()
    expect(layoutTable('| a |', 80)).toBeUndefined()
  })
})
