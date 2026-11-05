import { describe, expect, it } from 'vitest'
import { createSseParser, createTextStreamDecoder } from '@/lib/sse'

/** 造一个 OpenAI 兼容格式的增量帧 */
function frame(content: string | null, extra = ''): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-test',
    choices: [{ index: 0, delta: { content }, finish_reason: null }]
  })}${extra}\n\n`
}

describe('createSseParser', () => {
  it('解析单帧并取回 delta', () => {
    const parser = createSseParser()
    expect(parser.feed(frame('你好'))).toEqual({ deltas: ['你好'], done: false })
  })

  it('一行被 TCP 分片切开时，只在凑齐后产出一次且不丢字', () => {
    const parser = createSseParser()
    const line = frame('hello world')

    // 把这一行从中间劈开，模拟 chunk 边界落在 JSON 内部
    const cut = Math.floor(line.length / 2)
    const first = parser.feed(line.slice(0, cut))
    const second = parser.feed(line.slice(cut))

    expect(first.deltas).toEqual([])
    expect(second.deltas).toEqual(['hello world'])
  })

  it('一个 chunk 里有多帧时按顺序全部产出', () => {
    const parser = createSseParser()
    const { deltas } = parser.feed(frame('A') + frame('B') + frame('C'))
    expect(deltas).toEqual(['A', 'B', 'C'])
  })

  it('收到 [DONE] 后不再解析后续数据', () => {
    const parser = createSseParser()
    const { deltas, done } = parser.feed(frame('尾帧') + 'data: [DONE]\n\n' + frame('不该出现'))
    expect(done).toBe(true)
    expect(deltas).toEqual(['尾帧'])
    expect(parser.done).toBe(true)

    // 结束之后再喂，应该什么都没发生
    expect(parser.feed(frame('之后'))).toEqual({ deltas: [], done: true })
  })

  it('忽略注释行/心跳与空行', () => {
    const parser = createSseParser()
    const input = ': ping\n\n' + frame('有效') + '\n: keep-alive\n\n'
    expect(parser.feed(input).deltas).toEqual(['有效'])
  })

  it('非法 JSON 不抛异常，后续帧照常解析', () => {
    const parser = createSseParser()
    const input = 'data: {"choices":[{"delta"\n\n' + frame('正常')
    expect(() => parser.feed(input)).not.toThrow()
    expect(parser.feed('').deltas).toEqual([])
  })

  it('delta.content 为 null 或缺失时跳过（首帧常常只有 role）', () => {
    const parser = createSseParser()
    expect(parser.feed(frame(null)).deltas).toEqual([])
    expect(parser.feed('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n').deltas).toEqual([])
    expect(parser.feed('data: {"choices":[]}\n\n').deltas).toEqual([])
  })

  it('flush 能把没有结尾换行的最后一行解析出来', () => {
    const parser = createSseParser()
    const noTrailingNewline = `data: ${JSON.stringify({ choices: [{ delta: { content: '末行' } }] })}`
    expect(parser.feed(noTrailingNewline).deltas).toEqual([])
    expect(parser.flush()).toEqual({ deltas: ['末行'], done: false })
  })

  it('多个空行的脏数据不会产出空字符串', () => {
    const parser = createSseParser()
    const { deltas } = parser.feed(frame('') + 'data: \n\n\n' + frame('ok'))
    expect(deltas).toEqual(['ok'])
  })
})

describe('createTextStreamDecoder', () => {
  it('中文字符被切成两半在两个 chunk 里也能还原', () => {
    const bytes = new TextEncoder().encode('并排对比')
    const decode = createTextStreamDecoder()

    // 逐字节喂入：UTF-8 中文是 3 字节，必然跨越 chunk 边界
    let text = ''
    for (const byte of bytes) text += decode(new Uint8Array([byte]))

    expect(text).toBe('并排对比')
  })

  it('按任意位置切分都不产生乱码', () => {
    const source = '流式输出 test 🚀 混合内容'
    const bytes = new TextEncoder().encode(source)

    for (const cut of [1, 5, 13, bytes.length - 1]) {
      const decode = createTextStreamDecoder()
      const text = decode(bytes.slice(0, cut)) + decode(bytes.slice(cut))
      expect(text).toBe(source)
    }
  })
})
