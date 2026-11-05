/** 单个模型的静态配置 —— 价格单位：元 / 百万 token */
export interface ModelConfig {
  id: string
  label: string
  vendor: string
  /** 品牌色，用于列头圆点与图表 */
  color: string
  priceIn: number
  priceOut: number
  /** Mock 模式下的输出速度（字 / 秒），用来模拟不同模型的响应快慢 */
  mockSpeed: number
  /** Mock 模式下的人格前缀，让不同模型的输出风格有差异 */
  tone: 'concise' | 'detailed' | 'structured'
}

export type ColumnStatus = 'idle' | 'streaming' | 'done' | 'error' | 'aborted'

export interface StreamMetrics {
  /** 首字延迟（ms），即 Time To First Token */
  ttft: number | null
  /** 总耗时（ms） */
  duration: number | null
  tokensIn: number
  tokensOut: number
  /** 估算成本（元） */
  cost: number
}

export interface ColumnState {
  modelId: string
  status: ColumnStatus
  content: string
  error: string | null
  metrics: StreamMetrics
}

export interface PromptTemplate {
  id: string
  name: string
  body: string
  tags: string[]
  updatedAt: number
}

/** 落到 IndexedDB 的一次会话快照 */
export interface SessionRecord {
  id: string
  title: string
  prompt: string
  modelIds: string[]
  createdAt: number
  columns: Array<{
    modelId: string
    content: string
    status: ColumnStatus
    metrics: StreamMetrics
  }>
}
