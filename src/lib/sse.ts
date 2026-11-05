/**
 * 最小可用的 SSE 客户端（OpenAI 兼容协议的 /chat/completions）。
 *
 * 为什么用 SSE 而不是 WebSocket：
 * 1. 模型推理是单向的流式输出，不需要双向通道；
 * 2. 走普通 HTTP，能复用 keep-alive / HTTP 2 多路复用，一条连接可以并发多条流；
 * 3. 断线重连语义简单，不需要维护心跳。
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
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    // stream: true 保证多字节的中文字符不会被从中间截断
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      if (payload === '[DONE]') return

      try {
        const json = JSON.parse(payload)
        const delta: string | undefined = json?.choices?.[0]?.delta?.content
        if (delta) o.onDelta(delta)
      } catch {
        // 半帧数据（JSON 还没收全）直接跳过，下一轮会补上
      }
    }
  }
}
