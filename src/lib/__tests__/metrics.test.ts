import { describe, expect, it } from 'vitest'
import { calcCost, estimateTokens, formatCost, formatDuration, formatSpeed } from '@/lib/metrics'
import { getModel } from '@/config/models'

describe('estimateTokens', () => {
  it('空字符串是 0 token', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('纯中文约 1 token / 字', () => {
    // 2 个汉字 → 2 * 1.1 = 2.2 → 四舍五入 2
    expect(estimateTokens('你好')).toBe(2)
    // 12 个汉字 → 13.2 → 13
    expect(estimateTokens('流式渲染并排对比多个模型')).toBe(13)
  })

  it('英文约 3.6 字符 / token', () => {
    // 10 字符 / 3.6 = 2.78 → 3
    expect(estimateTokens('abcdefghij')).toBe(3)
    // 36 字符 ≈ 10 token
    expect(estimateTokens('a'.repeat(36))).toBe(10)
  })

  it('中英混合时分别按各自的比率累加', () => {
    // 4 个汉字 = 4.4，8 个英文字符 = 2.22，合计 6.62 → 7
    expect(estimateTokens('并排对比abcdefgh')).toBe(7)
  })

  it('极短输入至少返回 1（避免出现 0 tok/s 的分母）', () => {
    expect(estimateTokens('a')).toBe(1)
    expect(estimateTokens('。')).toBe(1)
  })

  it('文本变长时估算单调不减', () => {
    const samples = ['', 'a', 'ab', 'abc', 'abcd', '你好', '你好世界']
    const values = samples.map(estimateTokens)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
  })
})

describe('calcCost', () => {
  const deepseek = getModel('deepseek-chat')

  it('按「元 / 百万 token」分别计价输入与输出', () => {
    // DeepSeek: 输入 2 元/M，输出 8 元/M
    // 100 万输入 + 100 万输出 = 2 + 8 = 10 元
    expect(calcCost(deepseek, 1_000_000, 1_000_000)).toBe(10)
  })

  it('小额 token 换算成数量级正确的小数', () => {
    // 1000 输入 + 500 输出 = 0.002 + 0.004 = 0.006
    expect(calcCost(deepseek, 1000, 500)).toBeCloseTo(0.006, 10)
  })

  it('没有输入也没有输出就是 0', () => {
    expect(calcCost(deepseek, 0, 0)).toBe(0)
  })

  it('输出比输入贵时，同样的 token 数成本更高', () => {
    const sameTokensIn = calcCost(deepseek, 10_000, 0)
    const sameTokensOut = calcCost(deepseek, 0, 10_000)
    expect(sameTokensOut).toBeGreaterThan(sameTokensIn)
  })
})

describe('formatCost', () => {
  it('0 显示为 ¥0', () => {
    expect(formatCost(0)).toBe('¥0')
  })

  it('小于一分钱时保留 5 位小数（否则会显示成 ¥0.0000）', () => {
    expect(formatCost(0.003)).toBe('¥0.00300')
    expect(formatCost(0.0001)).toBe('¥0.00010')
  })

  it('大于等于一分钱时保留 4 位小数', () => {
    expect(formatCost(0.01)).toBe('¥0.0100')
    expect(formatCost(1.23456)).toBe('¥1.2346')
  })
})

describe('formatDuration', () => {
  it('null 显示占位符', () => {
    expect(formatDuration(null)).toBe('—')
  })

  it('小于 1 秒用毫秒', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(178)).toBe('178ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('大于等于 1 秒换成秒并保留两位', () => {
    expect(formatDuration(1000)).toBe('1.00s')
    expect(formatDuration(2500)).toBe('2.50s')
    expect(formatDuration(12_345)).toBe('12.35s')
  })
})

describe('formatSpeed', () => {
  it('正常换算成 tok/s', () => {
    // 100 token / 2s
    expect(formatSpeed({ tokensOut: 100, duration: 2000 })).toBe('50.0 tok/s')
  })

  it('时长为 null 或 0 时显示占位符（避免除零得到 Infinity）', () => {
    expect(formatSpeed({ tokensOut: 100, duration: null })).toBe('—')
    expect(formatSpeed({ tokensOut: 100, duration: 0 })).toBe('—')
  })

  it('速度保留一位小数', () => {
    expect(formatSpeed({ tokensOut: 364, duration: 7960 })).toBe('45.7 tok/s')
  })
})
