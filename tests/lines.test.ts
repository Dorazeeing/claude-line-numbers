import { describe, expect, test } from 'claude-code/testing'

import { findLineRefs, lastNumber, lineTexts, splitUnits } from '../hooks/lines'

const REPLY = [
  '',
  '## 제목',
  '',
  '첫 문단입니다.',
  '- 항목 하나',
  '  - 하위 항목',
  '',
  '```ts',
  'const a = 1',
  'const b = 2',
  '```',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '마지막 줄',
  '',
].join('\n')

describe('splitUnits', () => {
  test('numbers text lines, each code line and each table, skipping blanks and fences', async () => {
    const units = splitUnits(REPLY)
    const texts = lineTexts(units)
    expect([...texts.entries()]).toEqual([
      [1, '## 제목'],
      [2, '첫 문단입니다.'],
      [3, '- 항목 하나'],
      [4, '- 하위 항목'],
      [5, 'const a = 1'],
      [6, 'const b = 2'],
      [7, '| a | b |\n|---|---|\n| 1 | 2 |'],
      [8, '마지막 줄'],
    ])
    expect(lastNumber(units)).toBe(8)
  })

  test('keeps the indent of a nested item to draw it', async () => {
    const nested = splitUnits('- a\n  - b').find(u => u.kind === 'text' && u.n === 2)
    expect(nested).toEqual({ kind: 'text', n: 2, text: '- b', indent: 2 })
  })

  test('an unclosed fence runs to the end', async () => {
    expect([...lineTexts(splitUnits('x\n```\ny\nz')).values()]).toEqual(['x', 'y', 'z'])
  })

  test('nothing to number', async () => {
    expect(lastNumber(splitUnits('\n\n'))).toBe(0)
  })
})

describe('findLineRefs', () => {
  test('Korean forms', async () => {
    expect(findLineRefs('어 나 14번 줄이 이해가 안돼!')).toEqual([14])
    expect(findLineRefs('14번째 줄이랑 3줄')).toEqual([3, 14])
    expect(findLineRefs('5~7번 줄 다시 설명해줘')).toEqual([5, 6, 7])
    expect(findLineRefs('2번부터 4번 줄까지')).toEqual([2, 3, 4])
    expect(findLineRefs('3, 9번 줄')).toEqual([3, 9])
    expect(findLineRefs('12행은 왜 그래?')).toEqual([12])
    expect(findLineRefs('31째 줄이 이해가 안 돼')).toEqual([31])
    expect(findLineRefs('라인 31이 뭐야')).toEqual([31])
    expect(findLineRefs('줄 3~5 다시')).toEqual([3, 4, 5])
    expect(findLineRefs('31번 라인이 이해가 안돼')).toEqual([31])
  })

  test('English forms', async () => {
    expect(findLineRefs('what does line 14 mean')).toEqual([14])
    expect(findLineRefs('lines 3-5 and L9')).toEqual([3, 4, 5, 9])
  })

  test('no reference', async () => {
    expect(findLineRefs('리액트 훅이 뭐야? 2025년 기준으로')).toEqual([])
    expect(findLineRefs('URL 14개')).toEqual([])
    expect(findLineRefs('라인 3개 더 넣어줘')).toEqual([])
    expect(findLineRefs('31번 줄 2번째 단어')).toEqual([31])
    // a quoted line carries its own text; only the question is read
    expect(findLineRefs('> 3번 줄: Beta one\n이 줄이 무슨 뜻이야?')).toEqual([])
    expect(findLineRefs('> 3번 줄: Beta one\n5번 줄이랑 비교해줘')).toEqual([5])
  })

  test('a huge range is capped', async () => {
    expect(findLineRefs('1~9999번 줄').length).toBe(40)
  })
})
