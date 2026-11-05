/**
 * 最小可用的 SSE 客户端（OpenAI 兼容协议的 /chat/completions）。
 *
 * 为什么用 SSE 而不是 WebSocket：
 * 1. 模型推理是单向的流式输出，不需要双向通道；
 * 2. 走普通 HTTP，能复用 keep-alive / HTTP 2 多路复用，一条连接可以并发多条流；
 * 3. 断线重连语义简单，不需要维护心跳。
 *
 * 解析部分被刻意抽成了纯函数（createSseParser / createTextStreamDecoder），
 * 不依赖 fetch 和 DOM —— 这样「跨 chunk 的半行」「多字节被截断」这类最难复现的
 * 边界情况才能写成单元测试，而不是靠接一个真实接口去赌。
 */

export interface StreamChatOptions {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  system?: string
  signal: AbortSignal
  onDelta: (text: string) => void
}

export interface SseParseResult {
  /** 本次喂入后新产出的文本增量 */
  deltas: string[]
  /** 收到 [DONE] 或解析结束后置为 true */
  done: boolean
}

export interface SseParser {
  feed(chunk: string): SseParseResult
  readonly done: boolean
  /** 流结束时喂一次，处理最后一行没有换行符的残留 */
  flush(): SseParseResult
}

/**
 * 增量 SSE 解析器。
 *
 * 只做三件事：按行切、挑出 `data:` 字段、把 JSON 里的 delta.content 取出来。
 * 关键在于把「没凑成完整一行的尾巴」留在 buffer 里，等下一个 chunk 拼上再解析，
 * 否则一行被 TCP 分片切开就会解析失败、内容凭空少一截。
 */
export function createSseParser(): SseParser {
  let buffer = ''
  let finished = false

  function parseLines(text: string, isFlush: boolean): SseParseResult {
    const deltas: string[] = []
    buffer += text

    // 没有换行符就不算一行：留在 buffer 里等下一个 chunk
    const lines = buffer.split('\n')
    buffer = isFlush ? '' : (lines.pop() ?? '')

    for (const raw of lines) {
      if (finished) break
      const line = raw.trim()

      // 空行是事件分隔符；以 ':' 开头的是注释/心跳（如 `: ping`），都跳过
      if (!line || line.startsWith(':')) continue
      if (!line.startsWith('data:')) continue

      const payload = line.slice(5).trim()
      if (!payload) continue

      if (payload === '[DONE]') {
        finished = true
        break
      }

      try {
        const json = JSON.parse(payload)
        const delta: unknown = json?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) deltas.push(delta)
      } catch {
        // 半帧 JSON 直接跳过：正常路径下不会走到这里（不完整的行会留在 buffer）
        // 但部分服务端会先发一行不合法的心跳，兜住它比抛异常好
      }
    }

    return { deltas, done: finished }
  }

  return {
    feed(chunk: string) {
      if (finished) return { deltas: [], done: true }
      return parseLines(chunk, false)
    },
    get done() {
      return finished
    },
    flush() {
      if (finished) return { deltas: [], done: true }
      return parseLines('\n', true)
    }
  }
}

/**
 * 把 Uint8Array 分片解码成字符串。
 * `stream: true` 让 TextDecoder 自己缓存没凑齐的多字节序列 ——
 * 中文按 UTF-8 是 3 字节，正好落在 chunk 边界上就会解出乱码，这是最典型的坑。
 */
export function createTextStreamDecoder(): (bytes: Uint8Array) => string {
  const decoder = new TextDecoder()
  return (bytes: Uint8Array) => decoder.decode(bytes, { stream: true })
}

export async function streamChat(o: StreamChatOptions): Promise<void> {
  const url = `${o.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const messages: Array<{ role: string; content: string }> = []
  if (o.system) messages.push({ role: 'system', content: o.system })
  messages.push({ role: 'user', content: o.prompt })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${o.apiKey}`
    },
    body: JSON.stringify({ model: o.model, messages, stream: true }),
    signal: o.signal
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${detail.slice(0, 200)}`)
  }

  const reader = res.body.getReader()
  const decode = createTextStreamDecoder()
  const parser = createSseParser()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    const { deltas, done: ended } = parser.feed(decode(value))
    for (const delta of deltas) o.onDelta(delta)
    if (ended) return
  }

  // 流正常关闭但没收到 [DONE]：把最后一行也解析掉
  const tail = parser.flush()
  for (const delta of tail.deltas) o.onDelta(delta)
}
