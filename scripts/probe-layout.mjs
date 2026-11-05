/**
 * 诊断窄屏横向溢出的来源。
 * 用法：以 --remote-debugging-port=9223 启动浏览器并打开页面后运行本脚本。
 */
const PORT = process.env.CDP_PORT ?? '9223'
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = targets.find((t) => t.type === 'page' && t.url.includes('workbuddy.host'))
if (!page) {
  console.error('未找到目标页面')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
await new Promise((r) => ws.addEventListener('open', r))

const send = (method, params) =>
  new Promise((res) => {
    const mid = ++id
    pending.set(mid, res)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

// headless 有最小窗口宽（约 512），直接开小窗口量不准，用设备模拟覆盖视口
const WIDTH = Number(process.env.W ?? 390)
const HEIGHT = Number(process.env.H ?? 844)
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: true
})
await new Promise((r) => setTimeout(r, 400))

const expr = `(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    // 只报「右边界超出视口」或「自身宽度大于视口」的元素，且取最外层
    if (r.right > vw + 1 || r.width > vw + 1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 40),
        w: Math.round(r.width),
        right: Math.round(r.right)
      });
    }
  }
  return JSON.stringify({
    vw,
    scrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    count: offenders.length,
    top: offenders.slice(0, 14)
  }, null, 1);
})()`

const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
console.log(res.result?.result?.value ?? JSON.stringify(res))
ws.close()
