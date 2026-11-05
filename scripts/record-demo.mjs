/**
 * 录制 README 演示 GIF：写 prompt → 三栏同时流式输出 → 指标表出现差异。
 *
 * 为什么不用 ffmpeg：本机没有，且 CDP 的 screencast 已经把「帧 + 时间戳」推过来了，
 * 只需要一个纯 JS 编码器（gifenc）和一个纯 JS 的 PNG 解码器（pngjs），零原生依赖。
 *
 * 用法：
 *   1. npm run dev（5173 端口）
 *   2. 另开终端启动带调试端口的浏览器：
 *      chrome --headless=new --remote-debugging-port=9224 --window-size=960,600
 *   3. node scripts/record-demo.mjs [输出路径]
 */
import { writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
// gifenc 只提供 CJS 产物，命名导入在 ESM 下解析不到，走 default 再解构
import gifenc from 'gifenc'

const { GIFEncoder, quantize, applyPalette } = gifenc

const CDP_PORT = process.env.CDP_PORT ?? '9224'
const OUT = process.argv[2] ?? 'docs/demo.gif'
const PAGE_URL = process.env.PAGE_URL ?? 'http://localhost:5173/'
const W = Number(process.env.W ?? 960)
const H = Number(process.env.H ?? 600)
const FPS = Number(process.env.FPS ?? 10)

const PROMPT = '帮我写一个 Vue3 的防抖指令，说明它和节流的取舍'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('找不到页面，检查浏览器调试端口')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const frames = []

ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Page.screencastFrame') {
    const { data, metadata, sessionId } = m.params
    frames.push({ t: metadata.timestamp, data })
    // 必须逐个 ack，否则浏览器不再推新帧
    send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    return
  }
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
await new Promise((r) => ws.addEventListener('open', r))

function send(method, params = {}) {
  return new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

await send('Page.enable')
await send('Runtime.enable')
// 注意：不要用 Emulation.setDeviceMetricsOverride 放大视口。headless 的渲染面受物理窗口限制，
// 模拟一个比窗口大的视口时，截出来的图会在右侧被裁掉（页面布局按 1160 排，图只有 1080 宽）。
// 正确做法是启动浏览器时把 --window-size 设成目标尺寸，让布局视口和渲染面天然一致。
if (process.env.EMULATE === '1') {
  await send('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false
  })
}

// 每次录制都从干净状态开始：否则反复录制会往 IndexedDB 里堆一串同名历史会话，
// 侧边栏看起来像用了很久的脏数据。用 clearDataForOrigin 而不是 deleteDatabase，
// 免得和 Dexie 已经建立的连接打架。
if (process.env.KEEP_STATE !== '1') {
  const origin = new URL(PAGE_URL).origin
  await send('Storage.clearDataForOrigin', {
    origin,
    storageTypes: 'indexeddb,localstorage,cache_storage'
  })
}

await send('Page.navigate', { url: PAGE_URL })

// 等 Vue 挂载完成（挂载前截图是空白的）
for (let i = 0; i < 60; i++) {
  const r = await send('Runtime.evaluate', {
    expression: `!!document.querySelector('.composer-input')`,
    returnByValue: true
  })
  if (r.result?.result?.value) break
  await sleep(250)
}

// 清空默认内容，聚焦输入框
await send('Runtime.evaluate', {
  expression: `(() => {
    const el = document.querySelector('.composer-input');
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`
})
await sleep(300)

// 开始推流：从打字那一刻开始录，才会包含「写 prompt」这一段
await send('Page.startScreencast', { format: 'png', maxWidth: W, maxHeight: H, everyNthFrame: 1 })

// 分段输入，模拟真实打字节奏（一次 insertText 塞整段会很假）
const chunks = PROMPT.match(/.{1,6}/g) ?? [PROMPT]
for (const chunk of chunks) {
  await send('Input.insertText', { text: chunk })
  await sleep(45)
}
await sleep(400)

// 点发送
await send('Runtime.evaluate', {
  expression: `document.querySelector('.btn-primary')?.click()`
})

// 录到三栏全部结束为止：不同模型回复长度不同，写死时长要么录一半、要么拖一大段静止帧
const MAX_WAIT = Number(process.env.MAX_WAIT ?? 25000)
const deadline = Date.now() + MAX_WAIT
let done = false
while (Date.now() < deadline) {
  await sleep(300)
  const r = await send('Runtime.evaluate', {
    expression: `document.querySelectorAll('.column.is-streaming').length`,
    returnByValue: true
  })
  if (r.result?.result?.value === 0) {
    done = true
    break
  }
}
if (!done) console.warn('等待超时，按当前状态收尾')
// 留一点时间让指标表最后一次刷新落定
await sleep(1400)
await send('Page.stopScreencast')

ws.close()

if (!frames.length) {
  console.error('没抓到任何帧')
  process.exit(1)
}

// 按目标帧率重采样：screencast 的帧率不稳定，直接等间隔会忽快忽慢
const t0 = frames[0].t
const tEnd = frames[frames.length - 1].t
const duration = tEnd - t0
const want = Math.max(1, Math.round(duration * FPS))
const picked = []
for (let i = 0; i < want; i++) {
  const target = t0 + (i / FPS)
  // frames 按时间递增，取「不晚于目标时间」的最近一帧
  let best = frames[0]
  for (const f of frames) {
    if (f.t <= target) best = f
    else break
  }
  picked.push(best)
}
// 去重后补一帧末尾，保证不丢结尾状态
picked.push(frames[frames.length - 1])
const unique = []
for (const f of picked) if (!unique.length || unique[unique.length - 1] !== f) unique.push(f)

console.log(`抓帧 ${frames.length} 帧，覆盖 ${duration.toFixed(1)}s，重采样 ${unique.length} 帧 @ ${FPS}fps`)

const gif = GIFEncoder()
// 帧间隔按「目标播放时长」折算：录得长（模型回复慢）就略微快放，
// 比固定 1x 播 16 秒更适合丢在 README 里
const TARGET_PLAY = Number(process.env.PLAY ?? 10)
const naturalDelay = Math.round(1000 / FPS)
const fittedDelay = Math.round((TARGET_PLAY * 1000) / unique.length)
const delay = Math.min(naturalDelay, Math.max(50, fittedDelay))
console.log(`播放时长约 ${((delay * unique.length) / 1000).toFixed(1)}s（帧间隔 ${delay}ms）`)
for (let i = 0; i < unique.length; i++) {
  const png = PNG.sync.read(Buffer.from(unique[i].data, 'base64'))
  if (i === 0 && (png.width !== W || png.height !== H)) {
    console.warn(
      `警告：抓到的帧是 ${png.width}x${png.height}，与目标 ${W}x${H} 不一致。` +
        `渲染面比布局视口小，右侧内容会被裁掉——请把浏览器的 --window-size 调到 ${W},${H} 再录。`
    )
  }
  const rgba = new Uint8ClampedArray(png.data)
  // 抽样导出，方便人工检查中间帧（打字是否生效、流式是否真的在动）
  if (process.env.DUMP) {
    const marks = [0.35, 0.7, 0.97]
    const idx = Math.round((unique.length - 1) * marks[Number(process.env.DUMP) - 1])
    if (i === idx) {
      // Windows 下 Node 会把 /tmp 解析成 C:\tmp（可能不存在），落到当前目录避免踩坑
      writeFileSync(`.frame-${i}.png`, Buffer.from(unique[i].data, 'base64'))
      console.log(`抽样帧 ${i} → .frame-${i}.png`)
    }
  }
  const palette = quantize(rgba, 256, { format: 'rgb565' })
  const index = applyPalette(rgba, palette, 'rgb565')
  gif.writeFrame(index, png.width, png.height, {
    palette,
    delay,
    // 每帧都是整屏替换，dispose=1 才不会叠影
    dispose: 1,
    first: i === 0
  })
}
gif.finish()

const bytes = gif.bytes()
writeFileSync(OUT, bytes)
console.log(`已写出 ${OUT}（${(bytes.length / 1024 / 1024).toFixed(2)} MB，${W}x${H}）`)
