# Prompt Playground

<p>
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3.5-42b883?logo=vuedotjs&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-3da639" />
  <a href="https://github.com/wzcc924/prompt-playground/actions/workflows/test.yml">
    <img alt="test" src="https://github.com/wzcc924/prompt-playground/actions/workflows/test.yml/badge.svg" />
  </a>
</p>

> 同一个 prompt，并排看多个模型怎么答。实时对比输出质量、首字延迟与成本。

**[▶ 在线体验](https://prompt-playground.app.workbuddy.host/?sharecode=N5OFMQNTIY)** ·
**[三栏直接看效果](https://prompt-playground.app.workbuddy.host/?sharecode=N5OFMQNTIY&demo=1)** ·
**[源码](https://github.com/wzcc924/prompt-playground)** ——
不用 API Key，打开就是流式输出。

一个纯前端的多模型 Prompt 调试台：写一次 prompt 同时发给 1~3 个模型，逐字流式并排对比，
并把每次对比的首字延迟（TTFT）、总耗时、输出 token 与估算成本记录成表格。
内置 Prompt 模板库、`{{变量}}` 占位符、会话本地持久化，以及一个**不需要 API Key 的 Mock 引擎**——
任何人点开链接就能在 3 秒内看到完整的流式效果。

![演示：写 prompt → 三栏同时逐字输出 → 指标表出现差异](./docs/demo.gif)

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
```

默认进入 Mock 模式，直接可用。想立刻看到对比效果，打开
`http://localhost:5173/?demo=1`（自动填入示例 prompt 并开跑）。

要连真实模型：右上角「设置」→ 关掉 Mock → 填接口地址与 API Key
（需兼容 OpenAI 的 `/chat/completions` 协议）。

```bash
npm run build      # 产物在 dist/，相对路径，可直接静态托管
npm run preview
npm test           # 61 个单元测试
```

## 部署

纯静态产物，`dist/` 直接丢到任意静态托管即可（Vercel / Netlify / Nginx / OSS）。
没有后端、没有环境变量、没有运行时依赖——这也是当初刻意只做纯前端的原因：
**任何一次部署都是一次 `vite build`，不存在"线上挂了因为是接口方的问题"**。

```bash
npm run build && npx serve dist   # 本地验证生产构建
```

线上版本：<https://prompt-playground.app.workbuddy.host/?sharecode=N5OFMQNTIY>

## 功能

- **多栏并发流式对比**：1~3 个模型共享同一个 prompt，同时拉流，互不阻塞
- **实时指标**：每栏底部实时显示首字延迟、输出 token、估算成本；底部表格横向对比并标出最优项
- **单列重试**：某一路失败或想再看看，只重跑这一列，其它列结果保留
- **Prompt 模板 + 变量**：`{{requirement}}` 这类占位符会渲染成输入框，改一次变量三栏同时生效
- **模板库 / 历史会话**：Dexie + IndexedDB 持久化，刷新不丢
- **中断 / 导出**：随时中断接收，一键导出 Markdown 对比报告
- **Mock 引擎**：模拟首字延迟与逐字输出，无 Key 可完整演示
- **明暗主题**：全部走 CSS 设计令牌，切换只改一层变量
- **响应式**：手机端自动切单列（招聘方大概率是拿手机点链接的）

<p align="center">
  <img src="./docs/screenshot-mobile.png" width="300" alt="手机端" />
</p>

## 技术要点

### 为什么用 SSE 而不是 WebSocket

模型推理是**单向**的流式输出，不需要双向通道。SSE 走普通 HTTP，能复用 keep-alive 与 HTTP/2 多路复用，
一条连接可以并发多条流；断线重连的语义也比 WebSocket 简单，不用自己维护心跳。代价是只能服务端→客户端，
但这件事上正好够用。

实现见 `src/lib/sse.ts`：手写 SSE 解析，处理了**跨 chunk 的多字节字符截断**（`TextDecoder` 需要
`{ stream: true }`）和**半帧 JSON**（JSON 还没收全时跳过，下一轮补齐）。

### 流式渲染为什么要做 100ms 批量提交

最直觉的写法是每收到一个 chunk 就 `setState`。但 markdown-it 是同步全量解析，
一段 3000 字的回答会产生几百次完整的「解析 → diff → 重排」，三路并发时主线程直接被打满，界面会明显掉帧。

`src/stores/playground.ts` 里对每一路流做了缓冲：chunk 先累加到 buffer，**每 100ms 才提交一次**到响应式状态。
渲染次数从「每 chunk 一次」降到「每 100ms 一次」，观感上仍然是逐字输出，但主线程占用下降一个数量级。

> 下一步可以做的：把 Markdown 解析放进 Web Worker，或者做增量渲染（只重解析最后一个未闭合的块）。

### 为什么用 IndexedDB 而不是 localStorage

- localStorage 只能存字符串，每次读写都要 JSON 序列化，且 1MB 上限很容易撞到
- localStorage 是同步 API，流式输出期间落盘会阻塞主线程
- IndexedDB 支持索引与游标，历史会话可以按时间倒序分页取

### 滚动锁定

流式输出时如果无脑 `scrollTop = scrollHeight`，用户往上翻历史会被强行拽回底部。
`src/composables/useAutoScroll.ts` 维护一个 `pinned` 状态：只有用户本来就在底部 48px 内才自动跟随，
一旦检测到上滑就解除跟随。

### 长文档：块级虚拟滚动

一份 12 段的长回答有 170+ 个 Markdown 块，全量渲染时每 100ms 一次的提交会让主线程持续重排。
做法（`src/lib/blocks.ts` + `src/composables/useVirtualList.ts`）：

- 按空行把文档切成「顶层块」，切分时跳过代码围栏，并把被空行拆散的列表 / 引用块合并回去
  （否则 `1. a\n\n2. b` 会渲染成两个都从 1 开始的列表）
- 块数超过 40 才启用虚拟滚动，小文档全量渲染 —— 短文档上虚拟化的测量开销大于收益
- 未测量的块用估算高度，前缀和 + 二分查找定位可视区间，上下各留 3 块 overscan

流式场景特有的三个坑，都在代码注释里标了：

1. **元素卸载时 `ResizeObserver` 会回调一次 0 高度**，直接把已测的真实值覆盖成 0，前缀和瞬间崩塌；
2. **`contentRect.height` 不含 padding**，而块间距是用 padding 撑的（margin 不计入元素高度，
   累加前缀和会一点点漂移）—— 所以测量统一走 `getBoundingClientRect()`；
3. **贴底时不能只依赖 scrollTop**：要滚到底就得先渲染末尾的块，渲染末尾的块又依赖「已经滚到底」，
   是个死循环。贴底时改成从「总高度 − 视口高度」反推可视区间。

另外，视口上方的块变高时会同步补偿 `scrollTop`，否则用户会看到正在读的内容被顶下去。

效果：170 块的文档，DOM 里只留 8~10 块；滚动过程中 `scrollHeight` 稳定在 9220px 不漂移。

![long document](./docs/screenshot-long.png)

用 CDP 做过真实交互验证（`npm run check:scroll`，需要先以 `--remote-debugging-port=9222` 启动浏览器）：

```
滚到底部时： {"blocks":23,"scrollTop":8925,"scrollHeight":9220}
滚到中段时： {"blocks":29,"scrollTop":4610,"scrollHeight":9220}
```

滚动前后渲染的块数都维持在 20 多，`scrollHeight` 不变 —— 说明视口外的块确实被摘掉、偏移量也没有累积漂移。

### 增量渲染

顺带解决了另一个问题：块切分之后，流式增长只会影响**最后一块**，
前面的块内容不变，`computed` 直接命中缓存，不会重新解析。
真正的解析量从「整篇 × 每秒 10 次」降到「最后一块 × 每秒 10 次」。

### 其他工程细节

- **AbortController 按列隔离**：每路流一个控制器，组件卸载 / 用户点中断时全部 abort，不会留下野流
- **markdown-it 关闭 `html: true`**：`v-html` 渲染前就已经过滤掉原生 HTML，不留注入面
- **highlight.js 按需注册语言**：只注册 8 种常用语言，避开完整版 1MB+ 的体积
- **Mock 失败自动回落**：真实接口报错时不影响演示

## 测试

**纯函数优先。** SSE 的解析逻辑原本和 `fetch` 写在一起，没法单测，所以拆出了
`createSseParser()`（纯增量解析）和 `createTextStreamDecoder()`（多字节解码）。
这样「一行 JSON 被 TCP 分片切开」「中文 3 字节正好落在 chunk 边界」这类最难手工复现的边界，
才能写成断言而不是靠接一个真实接口去赌。

```bash
npm test               # 61 个用例，约 0.6s
npm run test:coverage  # 覆盖率报告，HTML 在 coverage/
```

| 测试文件 | 用例 | 覆盖的关键行为 |
|---|---|---|
| `sse.test.ts` | 11 | 分片行拼接、`[DONE]` 终止、心跳/空行、非法 JSON 不抛、flush 末行、逐字节中文解码 |
| `sse-stream.test.ts` | 6 | 假 fetch + ReadableStream 跑通 `streamChat` 全链路、请求体协议、HTTP 错误、abort 传递 |
| `blocks.test.ts` | 14 | 空行分块、围栏保护、未闭合围栏、列表/引用合并、拼回去不丢行 |
| `markdown.test.ts` | 11 | XSS 转义、高亮与语言别名、未闭合围栏、代码块嵌套结构 |
| `metrics.test.ts` | 19 | token 估算分段、成本换算、毫秒/秒切换、除零保护 |

`src/lib` 纯逻辑模块的覆盖率：

```
All files    |  95.77 % Stmts |  91.66 % Branch |  94.73 % Funcs |  100 % Lines
```

**测试有没有用，得看它能不能抓到 bug。** 做了一轮变异测试：往源码注入 3 处真实写代码时可能犯的错
（去掉「半行留在 buffer」的逻辑、不再识别代码围栏、CJK 系数 1.1 改成 1.0），**7 个用例立刻变红**。

写测试时还顺手抓到一个线上一直在犯的错：`markdown-it` 的 `highlight` 返回值只有以 `<pre` 开头才会被原样输出，
否则会被塞进 `<pre><code>`，于是代码块实际渲染成 `<pre><code><div class="code-wrap"><pre>` 这种非法嵌套
（`div` 不能出现在 `code` 里，浏览器会自行纠错，样式随之偏移）。改成接管 `fence` 渲染规则后输出干净，
`markdown.test.ts` 里留了一条断言防回归。

GitHub Actions 会在每次 push 时跑 `npm ci` → 测试 → 覆盖率 → 类型检查与构建。

## 目录结构

```
src/
├── config/models.ts        模型清单（价格、速度、品牌色）
├── lib/
│   ├── sse.ts              SSE 流式请求 + 增量解析
│   ├── mock.ts             Mock 流引擎
│   ├── markdown.ts         markdown-it + 按需高亮
│   ├── blocks.ts           Markdown 顶层块切分
│   ├── metrics.ts          token 估算与成本计算
│   ├── db.ts               Dexie schema + 种子模板
│   └── __tests__/          5 个测试文件，61 个用例
├── stores/
│   ├── playground.ts       并发流编排、100ms 批量提交、会话持久化
│   └── settings.ts         接口配置与主题
├── composables/
│   ├── useAutoScroll.ts    贴底跟随 + 用户上滑解除跟随
│   └── useVirtualList.ts   变高虚拟列表（二分查找 + 测高 + 偏移补偿）
└── components/
    ├── OutputColumn.vue    单栏：列头状态 / 滚动容器 / 指标脚注
    ├── MarkdownBlocks.vue  块级渲染 + 虚拟滚动接入
    └── ...                 侧边栏 / 指标表 / 输入区 / 设置
scripts/
├── check-virtual-scroll.mjs  CDP 真实滚动验证（虚拟列表是否真的换块、scrollHeight 是否漂移）
├── probe-layout.mjs          CDP 设备模拟 + 遍历元素找横向溢出（窄屏回归用）
└── record-demo.mjs           录 README 演示 GIF：screencast 抓帧 → pngjs 解码 → gifenc 编码
.github/workflows/test.yml    CI：测试 + 覆盖率 + 类型检查
```

### 自己重录演示 GIF

不需要 ffmpeg：

```bash
npm run dev                                          # 5173
chrome --headless=new --remote-debugging-port=9224 \
       --window-size=1200,740                        # 另开一个终端
node scripts/record-demo.mjs docs/demo.gif
```

`record-demo.mjs` 会清空站点存储（避免历史会话在侧边栏堆积）、模拟逐字输入、
点发送，然后一直录到三栏都结束才停，最后按目标播放时长折算帧间隔。
录之前别用 `Emulation.setDeviceMetricsOverride` 放大视口——headless 的渲染面受物理窗口限制，
放大视口只会让右侧被裁掉，必须让 `--window-size` 和布局视口一致。

## 已知限制 / TODO

- [x] ~~长会话虚拟滚动~~ —— 块级虚拟列表已接入，见上文
- [x] ~~Markdown 增量渲染~~ —— 块切分后只重解析最后一块
- [x] ~~单元测试~~ —— 5 个文件 61 个用例，纯逻辑模块行覆盖 100%
- [ ] 把 Markdown 解析搬进 Web Worker：块切分已经把范围缩小到最后一块，但长代码块仍是同步解析
- [ ] 模板的版本历史与回滚
- [ ] 块切分还没覆盖的场景：HTML 块（`<details>`）、脚注、表格与列表混排
- [ ] 只测了 `src/lib` 的纯函数；`stores/playground.ts` 的并发编排（中断/重试/多路隔离）还没测，需要引入 jsdom
- [ ] 并发数超过 3 时的列宽自适应

## License

MIT
