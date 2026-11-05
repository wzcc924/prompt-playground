import { ref, type Ref } from 'vue'

/**
 * 流式输出时的"贴底"逻辑。
 *
 * 坑在这里：如果无条件 scrollTop = scrollHeight，用户往上翻看历史时会被强行拽回底部。
 * 正确做法是维护一个 pinned 状态 —— 只有当用户本来就在底部附近时才自动跟随，
 * 一旦检测到用户上滑就解除跟随，并给出"回到底部"的入口。
 */
export function useAutoScroll(target: Ref<HTMLElement | null>) {
  const pinned = ref(true)
  const THRESHOLD = 48

  function onScroll() {
    const el = target.value
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    pinned.value = distance <= THRESHOLD
  }

  function scrollToBottom(smooth = false) {
    const el = target.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    pinned.value = true
  }

  return { pinned, onScroll, scrollToBottom }
}
