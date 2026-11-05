import type { ModelConfig } from '@/types'

/**
 * token 估算。
 * 真实项目应该用 tiktoken / 各家 tokenizer，这里用启发式采样：
 * 中日韩字符约 1 token / 字，英文约 3.6 字符 / token。
 * 误差 ±10% 左右，对"对比"这个场景足够。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  let cjk = 0
  let other = 0
  for (const ch of text) {
    if (/[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(ch)) cjk++
    else other++
  }
  return Math.max(1, Math.round(cjk * 1.1 + other / 3.6))
}

export function calcCost(model: ModelConfig, tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * model.priceIn + (tokensOut / 1_000_000) * model.priceOut
}

export function formatCost(v: number): string {
  if (!v) return '¥0'
  return v < 0.01 ? `¥${v.toFixed(5)}` : `¥${v.toFixed(4)}`
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}

/** 输出速度：token / 秒 */
export function formatSpeed(metrics: { tokensOut: number; duration: number | null }): string {
  if (!metrics.duration) return '—'
  return `${(metrics.tokensOut / (metrics.duration / 1000)).toFixed(1)} tok/s`
}
