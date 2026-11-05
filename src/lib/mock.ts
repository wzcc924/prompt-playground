import type { ModelConfig } from '@/types'

/**
 * Mock 流引擎。
 *
 * 存在的意义：面试官点开链接时没有 API Key，也必须能在 3 秒内看到"流式输出"这件事。
 * 它会按模型配置的速度逐字吐字，并模拟首字延迟（TTFT），指标表因此依然有真实数字。
 */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface StreamMockOptions {
  model: ModelConfig
  prompt: string
  signal: AbortSignal
  onDelta: (text: string) => void
}

export async function streamMock(o: StreamMockOptions): Promise<void> {
  const { model, prompt, signal, onDelta } = o

  // 模拟网络 + 首 token 延迟
  await sleep(160 + Math.random() * 320)
  throwIfAborted(signal)

  const text = buildReply(model, prompt)
  const perChar = 1000 / model.mockSpeed
  let i = 0

  while (i < text.length) {
    throwIfAborted(signal)
    const step = 1 + Math.floor(Math.random() * 3)
    onDelta(text.slice(i, i + step))
    i += step
    // 轻微的节奏抖动，比匀速更像真实模型
    await sleep(perChar * (0.6 + Math.random() * 0.9))
  }
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('aborted', 'AbortError')
}

function topicOf(prompt: string): string {
  const cleaned = prompt
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return '这个问题'
  return cleaned.length > 26 ? `${cleaned.slice(0, 26)}…` : cleaned
}

function buildReply(model: ModelConfig, prompt: string): string {
  const topic = topicOf(prompt)

  if (model.tone === 'concise') {
    return [
      `针对「${topic}」，我的结论是：**先跑通最小闭环，再谈优化**。`,
      '',
      '三条要点：',
      '',
      '1. **明确边界** —— 先确定输入、输出和失败时的降级行为；',
      '2. **先测量再优化** —— 没有数据支撑的优化大概率是伪优化；',
      '3. **保留退路** —— 新方案的开关要能一秒回滚。',
      '',
      '如果你需要，我可以按这个思路给出具体的实现步骤。'
    ].join('\n')
  }

  if (model.tone === 'structured') {
    return [
      `## ${topic}`,
      '',
      '### 1. 问题拆解',
      '',
      '- **输入**：用户意图 + 上下文约束',
      '- **输出**：可验证的结论，而不是泛泛而谈',
      '- **风险**：边界情况与降级路径',
      '',
      '### 2. 实现建议',
      '',
      '| 方案 | 成本 | 收益 | 建议 |',
      '| --- | --- | --- | --- |',
      '| 直接实现 | 低 | 快 | 先做 |',
      '| 抽象一层 | 中 | 可复用 | 出现第二次重复时再做 |',
      '| 全量重构 | 高 | 长期 | 暂缓 |',
      '',
      '### 3. 关键代码',
      '',
      '```ts',
      'export async function run(input: string) {',
      "  if (!input.trim()) throw new Error('input is required')",
      '  const chunks: string[] = []',
      '  for await (const chunk of stream(input)) {',
      '    chunks.push(chunk)',
      '  }',
      "  return chunks.join('')",
      '}',
      '```',
      '',
      '### 4. 下一步',
      '',
      '建议先用最小实现验证收益，再决定是否引入抽象层。'
    ].join('\n')
  }

  // detailed
  return [
    `关于「${topic}」，我分三层来说。`,
    '',
    '## 一、先判断这件事值不值得做',
    '',
    '大多数需求真正的问题不在"怎么做"，而在"要不要做"。判断标准通常是两个：**它是否频繁发生**，以及**它出错时代价有多大**。两者都低的场景，简单方案就够了。',
    '',
    '## 二、怎么做',
    '',
    '1. **收敛范围** —— 先把 20% 的核心路径做到可用，剩下的功能等真实反馈；',
    '2. **建立度量** —— 至少要有一个数字能说明改动前后谁更好，否则讨论会变成观点之争；',
    '3. **控制爆炸半径** —— 用开关、灰度、降级三条腿兜住风险。',
    '',
    '```bash',
    '# 一个典型的验证流程',
    'git checkout -b feat/xxx',
    'npm run build && npm run preview',
    '```',
    '',
    '## 三、容易踩的坑',
    '',
    '- 过早抽象：只出现过一次的模式不需要抽成通用能力；',
    '- 忽略边界：空输入、超长输入、并发请求是最常见的三个事故源；',
    '- 只做加法：新增能力时没考虑它和旧逻辑的冲突点。',
    '',
    '如果需要，我可以针对你们的实际代码给出更具体的改法。'
  ].join('\n')
}
