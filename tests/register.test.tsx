import { expect, mock, test } from 'claude-code/testing'

const TEXT = '첫 줄\n\n```js\nlet x = 1\n```\n셋째 줄'
const message = (isFullscreen: boolean, isFirstOfReply = true, text = TEXT) =>
  ({
    plugin: 'line-numbers',
    surface: 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: 120, rows: 40, isFullscreen },
    props: { text, isFirstOfReply },
  }) as const

// The first row of each numbered line's gutter, as drawn.
const labels = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => /^[●⏺ ] +\d+ │ $/.test(t))

test('fullscreen: a bullet, numbers and a rule in the gutter, a mask under each row', async $ => {
  const ui = await $.ui.mount(message(true))
  await ui.drawn() // rejects if the terminal's table refuses the tree
  expect(await labels(ui)).toEqual(['● 1 │ ', '  2 │ ', '  3 │ '])
  const codes = await ui.findAll({ type: 'Code' })
  // gutter "● 3 │ " is 6 cells: the mask numbers from 10^4, a 5-digit gutter
  expect(codes.filter(c => c.props.startLine === 10000)).toHaveLength(4)
  expect(codes.find(c => c.props.source === 'let x = 1')?.props.language).toBe('js')
  const texts = (await ui.findAll({ type: 'Markdown' })).map(m => m.props.text)
  expect(texts).toEqual(['첫 줄', '셋째 줄'])
  await ui.unmount()
})

test('macOS draws the bullet as the engine does there', async ($, on) => {
  mock.env(on, { HOME: '/Users/me' })
  const ui = await $.ui.mount(message(true))
  expect((await labels(ui))[0]).toBe('⏺ 1 │ ')
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
  expect(await labels(ui)).toEqual(['  4 │ ', '  5 │ ', '  6 │ '])
  await ui.unmount()

  await append('response', 'assistant', TEXT)
  await append('response', 'assistant', '라')
  ui = await $.ui.mount(message(true, false))
  expect(await labels(ui)).toEqual(['  4 │ ', '  5 │ ', '  6 │ '])
  await ui.unmount()

  await append('prompt', 'user', '다음 질문')
  ui = await $.ui.mount(message(true, false, '새 답의\n둘째 블록'))
  expect(await labels(ui)).toEqual(['  1 │ ', '  2 │ '])
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

test('a line reference reaches the model as context, numbered across the reply', async ($, on) => {
  on('session.messages', () => ({
    value: [
      { role: 'user', content: [{ type: 'text', text: '예전 질문' }] },
      { role: 'assistant', content: [{ type: 'text', text: '예전 답\n예전 둘째' }] },
      { role: 'user', content: [{ type: 'text', text: '질문' }] },
      {
        role: 'assistant',
        content: [{ type: 'text', text: '확인할게요.' }, { type: 'tool_use', id: 't', name: 'Bash', input: {} }],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] },
      { role: 'assistant', content: [{ type: 'text', text: '하나\n둘\n```py\nprint(3)\n```' }] },
    ],
  }))
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
