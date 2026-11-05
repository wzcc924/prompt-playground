/**
 * 把一段流式增长的 Markdown 切成「顶层块」。
 *
 * 为什么要切：
 * 1. 虚拟滚动必须以块为单位 —— 一整段 HTML 没法局部渲染；
 * 2. 流式输出时只有最后一块在变，前面的块可以完全不重新解析（增量渲染）。
 *
 * 切分规则是「空行分块」，但必须跳过代码围栏，否则代码块会被从中间切开。
 * 另外补了一个合并步骤：被空行拆散的列表 / 引用块要拼回去，
 * 不然 `1. a\n\n2. b` 会渲染成两个都从 1 开始的列表。
 */

const FENCE = /^\s*(`{3,}|~{3,})/
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/
const QUOTE = /^\s*>/

export function splitMarkdownBlocks(source: string): string[] {
  if (!source.trim()) return []

  const raw: string[] = []
  let buffer: string[] = []
  let fence: string | null = null

  const flush = () => {
    if (buffer.length) {
      raw.push(buffer.join('\n'))
      buffer = []
    }
  }

  for (const line of source.split('\n')) {
    if (fence) {
      buffer.push(line)
      if (FENCE_CLOSE.test(line)) fence = null
      continue
    }

    const opening = line.match(FENCE)
    if (opening) {
      fence = opening[1]
      buffer.push(line)
      continue
    }

    if (!line.trim()) {
      flush()
      continue
    }

    buffer.push(line)
  }
  flush()

  // 合并被空行拆散的列表与引用块，保住原有的 Markdown 语义
  const merged: string[] = []
  for (const block of raw) {
    const previous = merged[merged.length - 1]
    if (previous !== undefined && shouldMerge(previous, block)) {
      merged[merged.length - 1] = `${previous}\n\n${block}`
    } else {
      merged.push(block)
    }
  }
  return merged
}

function shouldMerge(previous: string, next: string): boolean {
  const prevTrimmed = previous.trimStart()
  const nextTrimmed = next.trimStart()
  if (LIST_ITEM.test(prevTrimmed) && LIST_ITEM.test(nextTrimmed)) return true
  return QUOTE.test(prevTrimmed) && QUOTE.test(nextTrimmed)
}
