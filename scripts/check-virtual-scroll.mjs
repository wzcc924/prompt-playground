// 通过 CDP 验证虚拟滚动：滚动到中段后，检查 DOM 里是否换成了对应的块
const CDP = 'http://127.0.0.1:9222'

async function main() {
  const targets = await (await fetch(`${CDP}/json`)).json()
  const page = targets.find((t) => t.type === 'page' && t.url.includes('5173'))
  if (!page) throw new Error('没找到页面 target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  })
  await new Promise((r) => ws.addEventListener('open', r))

  const send = (method, params) =>
    new Promise((resolve) => {
      const mid = ++id
      pending.set(mid, resolve)
      ws.send(JSON.stringify({ id: mid, method, params }))
    })

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails))
    return res.result?.result?.value
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  await sleep(9000) // 等长文档流完

  const before = await evaluate(`(() => {
    const el = document.querySelector('.column-body')
    return JSON.stringify({
      blocks: document.querySelectorAll('.md-block').length,
      scrollTop: Math.round(el.scrollTop),
      scrollHeight: Math.round(el.scrollHeight),
      firstText: document.querySelector('.md-block').innerText.slice(0, 24)
    })
  })()`)
  console.log('滚到底部时：', before)

  // 滚到中间
  await evaluate(`(() => {
    const el = document.querySelector('.column-body')
    el.scrollTop = Math.round(el.scrollHeight / 2)
    el.dispatchEvent(new Event('scroll'))
  })()`)
  await sleep(700)

  const middle = await evaluate(`(() => {
    const el = document.querySelector('.column-body')
    const blocks = [...document.querySelectorAll('.md-block')]
    return JSON.stringify({
      blocks: blocks.length,
      scrollTop: Math.round(el.scrollTop),
      scrollHeight: Math.round(el.scrollHeight),
      firstText: blocks[0].innerText.slice(0, 30),
      lastText: blocks[blocks.length - 1].innerText.slice(0, 30)
    })
  })()`)
  console.log('滚到中段时：', middle)

  ws.close()
}

main().catch((e) => {
  console.error('FAILED', e.message)
  process.exit(1)
})
