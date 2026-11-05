<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ColumnState } from '@/types'
import { getModel } from '@/config/models'
import { formatCost } from '@/lib/metrics'
import { useAutoScroll } from '@/composables/useAutoScroll'
import MarkdownBlocks from './MarkdownBlocks.vue'

const props = defineProps<{ column: ColumnState }>()
const emit = defineEmits<{ retry: [modelId: string] }>()

const model = computed(() => getModel(props.column.modelId))
const bodyEl = ref<HTMLElement | null>(null)
const { pinned, onScroll, scrollToBottom } = useAutoScroll(bodyEl)

// 内容更新时，只有用户本来就贴着底部才跟随滚动
watch(
  () => props.column.content,
  () => {
    if (pinned.value) nextTick(() => scrollToBottom())
  }
)

const STATUS_TEXT: Record<ColumnState['status'], string> = {
  idle: '待命',
  streaming: '生成中',
  done: '完成',
  error: '失败',
  aborted: '已中断'
}

const statusText = computed(() => STATUS_TEXT[props.column.status])
const showEmpty = computed(() => !props.column.content && !props.column.error)

async function copy() {
  if (!props.column.content) return
  try {
    await navigator.clipboard.writeText(props.column.content)
  } catch {
    /* 剪贴板在没有安全上下文的页面不可用，静默失败即可 */
  }
}
</script>

<template>
  <article class="column" :class="{ 'is-streaming': column.status === 'streaming' }">
    <header class="column-head">
      <span class="model-dot" :style="{ background: model.color }" />
      <span class="model-name">{{ model.label }}</span>
      <span class="model-vendor">{{ model.vendor }}</span>
      <span style="flex: 1" />
      <span class="status-pill" :class="`is-${column.status}`">
        <i v-if="column.status === 'streaming'" class="pulse" />
        {{ statusText }}
      </span>
    </header>

    <div ref="bodyEl" class="column-body" @scroll="onScroll">
      <div v-if="showEmpty && column.status === 'idle'" class="placeholder">
        <span>等待发送</span>
      </div>
      <div v-else-if="showEmpty" class="placeholder">
        <span class="pulse" />
        <span>思考中…</span>
      </div>
      <template v-else>
        <div v-if="column.error" class="error-box">{{ column.error }}</div>
        <MarkdownBlocks
          v-if="column.content"
          :source="column.content"
          :scroller="bodyEl"
          :pinned="pinned"
        />
      </template>
    </div>

    <footer class="column-foot">
      <span class="foot-metric">首字 <b>{{ column.metrics.ttft ?? '—' }}</b>ms</span>
      <span class="foot-metric"><b>{{ column.metrics.tokensOut }}</b>tok</span>
      <span class="foot-metric"><b>{{ formatCost(column.metrics.cost) }}</b></span>
      <span style="flex: 1" />
      <button
        v-if="column.content"
        class="btn btn-sm"
        @click="copy"
      >
        复制
      </button>
      <button
        v-if="column.status === 'done' || column.status === 'error' || column.status === 'aborted'"
        class="btn btn-sm"
        @click="emit('retry', column.modelId)"
      >
        重试
      </button>
    </footer>
  </article>
</template>
