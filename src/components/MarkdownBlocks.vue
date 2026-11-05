<script setup lang="ts">
import { computed } from 'vue'
import { splitMarkdownBlocks } from '@/lib/blocks'
import { useVirtualList } from '@/composables/useVirtualList'
import MarkdownView from './MarkdownView.vue'

const props = defineProps<{ source: string; scroller: HTMLElement | null; pinned: boolean }>()

const blocks = computed(() => splitMarkdownBlocks(props.source))

const { enabled, visible, padTop, padBottom, setter } = useVirtualList({
  items: blocks,
  container: computed(() => props.scroller),
  pinned: computed(() => props.pinned),
  estimateHeight: 100,
  threshold: 40
})

function isHeading(block: string): boolean {
  return block.trimStart().startsWith('#')
}
</script>

<template>
  <div class="md-blocks">
    <!-- 顶部占位：视口之前的块不渲染，用高度撑住滚动条 -->
    <div v-if="enabled && padTop" :style="{ height: `${padTop}px` }" />

    <div
      v-for="entry in visible"
      :key="entry.index"
      :ref="setter(entry.index)"
      class="md-block"
      :class="{ 'is-heading': isHeading(entry.item) }"
    >
      <MarkdownView :source="entry.item" />
    </div>

    <!-- 底部占位 -->
    <div v-if="enabled && padBottom" :style="{ height: `${padBottom}px` }" />
  </div>
</template>
