# Prompt Playground

> 同一个 prompt，并排看多个模型怎么答。实时对比输出质量、首字延迟与成本。

一个纯前端的多模型 Prompt 调试台：写一次 prompt 同时发给 1~3 个模型，逐字流式并排对比，
并把每次对比的首字延迟（TTFT）、总耗时、输出 token 与估算成本记录成表格。
内置 Prompt 模板库、`{{变量}}` 占位符、会话本地持久化，以及一个**不需要 API Key 的 Mock 引擎**——
任何人点开链接就能在 3 秒内看到完整的流式效果。

<!-- TODO: 换成 6~8 秒的 GIF 放这里：写 prompt → 三栏同时逐字输出 → 指标表出现差异 -->
![screenshot](./docs/screenshot.png)

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
```

## 功能

- **多栏并发流式对比**：1~3 个模型共享同一个 prompt，同时拉流，互不阻塞
- **实时指标**：每栏底部实时显示首字延迟、输出 token、估算成本；底部表格横向对比并标出最优项
- **单列重试**：某一路失败或想再看看，只重跑这一列，其它列结果保留
- **Prompt 模板 + 变量**：`{{requirement}}` 这类占位符会渲染成输入框，改一次变量三栏同时生效
- **模板库 / 历史会话**：Dexie + IndexedDB 持久化，刷新不丢
- **中断 / 导出**：随时中断接收，一键导出 Markdown 对比报告
- **Mock 引擎**：模拟首字延迟与逐字输出，无 Key 可完整演示
- **明暗主题**：全部走 CSS 设计令牌，切换只改一层变量

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

### 其他工程细节

- **AbortController 按列隔离**：每路流一个控制器，组件卸载 / 用户点中断时全部 abort，不会留下野流
- **markdown-it 关闭 `html: true`**：`v-html` 渲染前就已经过滤掉原生 HTML，不留注入面
- **highlight.js 按需注册语言**：只注册 8 种常用语言，避开完整版 1MB+ 的体积
- **Mock 失败自动回落**：真实接口报错时不影响演示

## 目录结构

```
src/
├── config/models.ts        模型清单（价格、速度、品牌色）
├── lib/
│   ├── sse.ts              SSE 流式请求 + 增量解析
│   ├── mock.ts             Mock 流引擎
│   ├── markdown.ts         markdown-it + 按需高亮
│   ├── metrics.ts          token 估算与成本计算
│   └── db.ts               Dexie schema + 种子模板
├── stores/
│   ├── playground.ts       并发流编排、100ms 批量提交、会话持久化
│   └── settings.ts         接口配置与主题
├── composables/
│   └── useAutoScroll.ts    贴底跟随 + 用户上滑解除跟随
└── components/             侧边栏 / 多栏输出 / 指标表 / 输入区 / 设置
```

## 已知限制 / TODO

- [ ] 长会话还没上虚拟滚动（现在靠 100ms 节流扛住，万条消息会卡）
- [ ] Markdown 增量渲染：目前每次全量重解析最后一个块之前的所有内容
- [ ] 模板的版本历史与回滚
- [ ] 并发数超过 3 时的列宽自适应
- [ ] 单元测试（SSE 解析器与 token 估算是纯函数，优先补这两个）

## License

MIT
