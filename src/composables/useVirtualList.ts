import { computed, onBeforeUnmount, ref, watch, type ComponentPublicInstance, type Ref } from 'vue'

/**
 * 变高虚拟列表。
 *
 * 和常见的定高虚拟列表相比，这里的难点是块高度不可预知（段落、代码块、表格差很多），
 * 而且最后一块还在持续变高。做法是：
 *
 * 1. 维护一份「已测高度」缓存，没测过的块用估算值兜底；
 * 2. 用前缀和算出每块的偏移，滚动时二分查找可视区间；
 * 3. ResizeObserver 量真实高度，只有变化超过 0.5px 才写回缓存；
 * 4. 如果变高的是「视口上方」的块，同步补偿 scrollTop，否则用户会看到内容被顶下去。
 *
 * 块高度用 padding 撑开、不用 margin —— margin 不会被计入元素高度，
 * 累加前缀和时会一点点漂移。
 */

export interface VirtualListOptions<T> {
  items: Ref<T[]>
  container: Ref<HTMLElement | null>
  /** 用户是否贴着底部。贴底时直接从「底部」反推可视区间，否则会陷入
   *  「要滚到底 → 得先渲染末尾块 → 渲染末尾块又依赖已经滚到底」的死循环 */
  pinned?: Ref<boolean>
  /** 未测量块的估算高度 */
  estimateHeight?: number
  /** 视口上下各多渲染几块，减少快速滚动时的白屏 */
  overscan?: number
  /** 块数低于该阈值时直接全量渲染 —— 小文档上虚拟化的收益抵不过测量开销 */
  threshold?: number
}

export function useVirtualList<T>(options: VirtualListOptions<T>) {
  const { items, container, pinned } = options
  const estimateHeight = options.estimateHeight ?? 120
  const overscan = options.overscan ?? 3
  const threshold = options.threshold ?? 40

  const version = ref(0)
  const scrollTop = ref(0)
  const viewport = ref(0)

  /** 块只会追加，不会从头部删除，所以下标可以当稳定 key 用 */
  const heights = new Map<number, number>()

  const enabled = computed(() => items.value.length > threshold)

  let frame = 0
  function bump() {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      version.value++
    })
  }

  const offsets = computed(() => {
    void version.value
    const list = items.value
    const result = new Array<number>(list.length + 1)
    result[0] = 0
    for (let i = 0; i < list.length; i++) {
      result[i + 1] = result[i] + (heights.get(i) ?? estimateHeight)
    }
    return result
  })

  const totalHeight = computed(() => offsets.value[offsets.value.length - 1] ?? 0)

  /** 二分查找：返回 scrollTop 落在第几块 */
  function indexAt(top: number): number {
    const prefix = offsets.value
    let low = 0
    let high = prefix.length - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (prefix[mid] <= top) low = mid
      else high = mid - 1
    }
    return Math.min(low, Math.max(0, items.value.length - 1))
  }

  /** 计算可视区间的锚点：贴底时用「总高度 - 视口高度」代替真实 scrollTop */
  const anchorTop = computed(() => {
    if (pinned?.value && enabled.value) {
      return Math.max(0, totalHeight.value - Math.max(viewport.value, 1))
    }
    return scrollTop.value
  })

  const start = computed(() =>
    enabled.value && items.value.length ? Math.max(0, indexAt(anchorTop.value) - overscan) : 0
  )

  const end = computed(() => {
    if (!enabled.value) return items.value.length
    if (!items.value.length) return 0
    return Math.min(items.value.length, indexAt(anchorTop.value + viewport.value) + 1 + overscan)
  })

  const visible = computed(() =>
    items.value
      .slice(start.value, end.value)
      .map((item, i) => ({ index: start.value + i, item }))
  )

  const padTop = computed(() => (enabled.value ? (offsets.value[start.value] ?? 0) : 0))
  const padBottom = computed(() => {
    if (!enabled.value) return 0
    return Math.max(0, totalHeight.value - (offsets.value[end.value] ?? totalHeight.value))
  })

  let itemObserver: ResizeObserver | null = null
  let boxObserver: ResizeObserver | null = null

  function createItemObserver(): ResizeObserver {
    return new ResizeObserver((entries) => {
      let changed = false
      let shifted = 0

      for (const entry of entries) {
        const el = entry.target as HTMLElement
        const index = Number(el.dataset.vindex)
        if (!Number.isFinite(index)) continue

        // 两个坑都用 getBoundingClientRect 兜住：
        // 1. 元素被卸载时 Chrome 会回调一次 0 高度，不能让它覆盖已测的真实值；
        // 2. contentRect 不含 padding，而块间距是 padding 撑的，用它会系统性偏小。
        const height = el.getBoundingClientRect().height
        if (height <= 0) continue

        const previous = heights.get(index)
        if (previous !== undefined && Math.abs(previous - height) <= 0.5) continue

        heights.set(index, height)
        changed = true

        // 变高的是视口上方的块 → 内容整体下移了，补偿回去。
        // 贴底状态不用补偿：此时上方块高度不变，硬加反而会和自动贴底打架。
        if (!pinned?.value && index < start.value) {
          shifted += height - (previous ?? estimateHeight)
        }
      }

      if (!changed) return
      if (shifted !== 0 && container.value) container.value.scrollTop += shifted
      bump()
    })
  }

  /** 返回稳定的 ref 回调：内联箭头函数在每次渲染时都是新引用，会让 Vue 反复解绑/重绑 */
  const setters = new Map<number, (el: Element | ComponentPublicInstance | null) => void>()
  function setter(index: number) {
    let fn = setters.get(index)
    if (!fn) {
      fn = (el: Element | ComponentPublicInstance | null) => {
        if (!(el instanceof HTMLElement)) return
        el.dataset.vindex = String(index)
        if (!itemObserver) itemObserver = createItemObserver()
        itemObserver.observe(el)
      }
      setters.set(index, fn)
    }
    return fn
  }

  function handleScroll() {
    const el = container.value
    if (!el) return
    scrollTop.value = el.scrollTop
  }

  watch(
    container,
    (el, previous) => {
      if (previous) previous.removeEventListener('scroll', handleScroll)
      if (!el) return

      el.addEventListener('scroll', handleScroll, { passive: true })
      viewport.value = el.clientHeight

      boxObserver?.disconnect()
      boxObserver = new ResizeObserver(() => {
        viewport.value = el.clientHeight
      })
      boxObserver.observe(el)
      handleScroll()
    },
    { immediate: true }
  )

  // 块数变化时，让可视区间重新算一次（前面追加内容不会影响，但长度变了要重算 padding）
  watch(
    () => items.value.length,
    () => bump()
  )

  onBeforeUnmount(() => {
    if (frame) cancelAnimationFrame(frame)
    itemObserver?.disconnect()
    boxObserver?.disconnect()
    container.value?.removeEventListener('scroll', handleScroll)
  })

  return { enabled, visible, padTop, padBottom, totalHeight, setter }
}
