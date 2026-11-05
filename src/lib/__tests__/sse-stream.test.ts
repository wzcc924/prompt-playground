import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamChat } from '@/lib/sse'

/** 用若干个 Uint8Array 分片伪造一个流式响应 */
function sseResponse(chunks: Uint8Array[], init: ResponseInit = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    }
  })
  return new Response(body, { status: 200, ...init })
}

function deltaFrame(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
}

const encoder = new TextEncoder()

function baseOptions() {
  return {
    baseUrl: 'https://api.example.com/v1/',
    apiKey: 'sk-test',
    model: 'test-model',
    prompt: '你好',
    signal: new AbortController().signal,
    onDelta: () => {}
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('streamChat（整条流式链路）', () => {
  it('把多个分片拼成完整文本，且每个分片只回调一次', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          encoder.encode(deltaFrame('并排')),
          encoder.encode(deltaFrame('对比')),
          encoder.encode('data: [DONE]\n\n')
        ])
      )
    )

    const deltas: string[] = []
    await streamChat({ ...baseOptions(), onDelta: (t) => deltas.push(t) })

    expect(deltas).toEqual(['并排', '对比'])
  })

  it('中文字节被切在两个分片中间也不会乱码', async () => {
    const bytes = encoder.encode(deltaFrame('流式渲染'))

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse([bytes.slice(0, 12), bytes.slice(12)]))
    )

    let text = ''
    await streamChat({ ...baseOptions(), onDelta: (t) => (text += t) })

    expect(text).toBe('流式渲染')
  })

  it('一行 JSON 被分片切开时也不丢内容', async () => {
    const line = deltaFrame('一整段回答')
    const cut = Math.floor(line.length / 2)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([encoder.encode(line.slice(0, cut)), encoder.encode(line.slice(cut))])
      )
    )

    let text = ''
    await streamChat({ ...baseOptions(), onDelta: (t) => (text += t) })

    expect(text).toBe('一整段回答')
  })

  it('请求体是 OpenAI 兼容的 /chat/completions 协议', async () => {
    const fetchMock = vi.fn(async () => sseResponse([encoder.encode('data: [DONE]\n\n')]))
    vi.stubGlobal('fetch', fetchMock)

    await streamChat({ ...baseOptions(), system: '你是助手' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    // baseUrl 结尾的斜杠要被规范化掉，不能出现 //chat/completions
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')

    const body = JSON.parse(init.body as string)
    expect(body.stream).toBe(true)
    expect(body.messages).toEqual([
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '你好' }
    ])
  })

  it('HTTP 非 2xx 时抛出带状态码的错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('invalid api key', { status: 401 }))
    )

    await expect(streamChat(baseOptions())).rejects.toThrow(/HTTP 401/)
  })

  it('中止信号会传递到 fetch（用于多路并发时的单列取消）', async () => {
    const controller = new AbortController()
    controller.abort()

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        // 真实 fetch 在 signal 已中止时会直接 reject
        if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
        return sseResponse([])
      })
    )

    await expect(streamChat({ ...baseOptions(), signal: controller.signal })).rejects.toThrow()
  })
})
