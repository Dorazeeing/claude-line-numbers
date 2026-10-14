import type { SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { displayWidth } from '../hooks/lines'

const TEXT = '첫 줄\n\n```js\nlet x = 1\n```\n셋째 줄'
const message = (isFullscreen: boolean, isFirstOfReply = true, text = TEXT) =>
  ({
    plugin: 'line-numbers',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 120, rows: 40, isFullscreen },
    props: { text, isFirstOfReply },
  }) as const

// The first row of each numbered line's gutter, as drawn: whole gutters
// only, not the dim part of the one that holds the bullet.
const labels = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) => {
  const found = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => /^[●⏺ ] +\d+ │ $/.test(t))
  const width = Math.max(0, ...found.map(t => t.length))
  return found.filter(t => t.length === width)
}

// The reply's mask (a Code numbered from 10^(width-2)) and the rule over it.
const maskOf = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string; props: Record<string, unknown> }[]> }) => {
  const masks = (await ui.findAll({ type: 'Code' })).filter(c => c.props.startLine === 100000)
  const rules = (await ui.findAll({ type: 'Text' })).filter(t => /^ +│ \n/.test(t.text))
  return { masks, rules, lines: masks.map(c => String(c.props.source).split('\n').length) }
}

test('fullscreen: a bullet, numbers and a rule in the gutter, one mask under the reply', async $ => {
  const ui = await $.ui.mount(message(true))
  await ui.drawn() // rejects if the terminal's table refuses the tree
  expect(await labels(ui)).toEqual(['●  1 │ ', '   2 │ ', '   3 │ '])
  // gutter "●  3 │ " is 7 cells (two digits at least): the mask numbers from
  // 10^5, a 6-digit gutter; one for the reply, the rule as long, both past
  // the 4 rows the reply takes
  const { masks, rules, lines } = await maskOf(ui)
  expect(masks).toHaveLength(1)
  expect(rules.map(t => t.text.split('\n').length)).toEqual(lines)
  expect(lines[0]).toBeGreaterThan(4)
  const codes = await ui.findAll({ type: 'Code' })
  expect(codes.find(c => c.props.source === 'let x = 1')?.props.language).toBe('js')
  const texts = (await ui.findAll({ type: 'Markdown' })).map(m => m.props.text)
  expect(texts).toEqual(['첫 줄', '셋째 줄'])
  await ui.unmount()
})

test('a wide table is drawn within the room beside the gutter, its mask as tall as it', async $ => {
  const table = [
    '| 질문 | 답 |',
    '|---|---|',
    '| 설정했나 | ✅ `core.quotePath=false` (전역, 백업해둠) |',
    '| 원래 상태 | "꺼짐"이 아니라 **켜짐** (`true`가 기본값) |',
    '| 왜 기본이 `true`인가 | git 공식 문서: 0x80 이상 바이트는 따옴표로 감싸고 8진수로 이스케이프해요. 설명은 영어 기준으로 만들어진 시절의 안전장치로 추정한 것이에요 |',
  ].join('\n')
  const ui = await $.ui.mount(message(true, true, `정리\n\n${table}\n끝`))
  await ui.drawn()
  // "●  3 │ " leaves 120 - 7 cells, and the table stops 2 short of the edge
  const lines = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => /^[┌├│└]/.test(t))
  expect(lines.length).toBeGreaterThan(5)
  for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(111)
  expect(new Set(lines.map(displayWidth)).size).toBe(1)
  // the mask runs past the table and the two lines around it, the rule as far
  const mask = await maskOf(ui)
  expect(mask.masks).toHaveLength(1)
  expect(mask.lines[0]).toBeGreaterThan(lines.length + 2)
  expect(mask.rules.map(t => t.text.split('\n').length)).toEqual(mask.lines)
  await ui.unmount()
})

test('macOS draws the bullet as the engine does there', async ($, on) => {
  mock.env(on, { HOME: '/Users/me' })
  const ui = await $.ui.mount(message(true))
  expect((await labels(ui))[0]).toBe('⏺  1 │ ')
  await ui.unmount()
})

test('elsewhere the bullet drawn before HOME is read is drawn again as the engine draws it', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  const ui = await $.ui.mount(message(true))
  expect((await labels(ui))[0]).toBe('●  1 │ ')
  await ui.unmount()
})

test('a later block of a reply carries the numbering on; a prompt starts it over', async $ => {
  const append = (door: 'prompt' | 'response', type: 'user' | 'assistant', text: string) =>
    $.session.append({
      door,
      uuid: `row-${text}`,
      origin: door === 'prompt' ? { kind: 'composer' } : { kind: 'model', model: 'test' },
      message: { type, content: [{ type: 'text', text }] },
    })

  await append('prompt', 'user', '질문')
  await append('response', 'assistant', '가\n나\n다')
  // streaming: not appended yet, so it starts where the reply stands (3)
  let ui = await $.ui.mount(message(true, false))
  expect(await labels(ui)).toEqual(['   4 │ ', '   5 │ ', '   6 │ '])
  await ui.unmount()

  await append('response', 'assistant', TEXT)
  await append('response', 'assistant', '라')
  ui = await $.ui.mount(message(true, false))
  expect(await labels(ui)).toEqual(['   4 │ ', '   5 │ ', '   6 │ '])
  await ui.unmount()

  await append('prompt', 'user', '다음 질문')
  ui = await $.ui.mount(message(true, false, '새 답의\n둘째 블록'))
  expect(await labels(ui)).toEqual(['   1 │ ', '   2 │ '])
  await ui.unmount()
})

test('main screen: no gutter is drawn, so a copy never carries numbers', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['the engine draws its own'] }))
  let toasts = 0
  on('ui.toast', () => {
    toasts += 1
    return { value: undefined }
  })
  const ui = await $.ui.mount(message(false))
  expect(await ui.findAll({ type: 'Code' })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  expect(toasts).toBe(1)
  await ui.unmount()
})

// A reply of two text blocks around a tool call, after an older reply.
const TRANSCRIPT: SessionMessage[] = [
  { role: 'user', text: '예전 질문', toolUses: [] },
  { role: 'assistant', text: '예전 답\n예전 둘째', toolUses: [] },
  { role: 'user', text: '<system-reminder>note</system-reminder>', toolUses: [] },
  { role: 'user', text: '질문', toolUses: [] },
  { role: 'assistant', text: '확인할게요.', toolUses: [{ tool_use_id: 't', tool: 'Bash', input: {} }] },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't', text: 'ok', isError: false }] },
  { role: 'assistant', text: '하나\n둘\n```py\nprint(3)\n```', toolUses: [] },
]

test('a later block drawn before the transcript is read is drawn again, renumbered', async ($, on) => {
  on('session.messages', () => ({ value: TRANSCRIPT }))
  on('session.start', () => ({ cwd: '/tmp' }))
  const ui = await $.ui.mount(message(true, false, '하나\n둘\n```py\nprint(3)\n```'))
  expect(await labels(ui)).toEqual(['   1 │ ', '   2 │ ', '   3 │ '])
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(await labels(ui)).toEqual(['   2 │ ', '   3 │ ', '   4 │ '])
  await ui.unmount()
})

test('a line reference reaches the model as context, numbered across the reply', async ($, on) => {
  on('session.messages', () => ({ value: TRANSCRIPT }))
  let context: readonly string[] | undefined
  on('prompt.submit', ($, e) => {
    context = e.context
    return { text: e.text }
  })
  const submit = (text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

  await submit('4번 줄이 뭐야?')
  expect(context).toHaveLength(1)
  expect(context?.[0]).toContain('- line 4: "print(3)"')

  await submit('1~2번 줄은?')
  expect(context?.[0]).toContain('- line 1: "확인할게요."')
  expect(context?.[0]).toContain('- line 2: "하나"')

  context = undefined
  await submit('그냥 질문')
  expect(context).toBeUndefined()
})
