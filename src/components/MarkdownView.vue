<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown'

const props = defineProps<{ source: string }>()

/**
 * 每 100ms 提交一次内容，这里就重解析一次整段 Markdown。
 * markdown-it 是同步的，对 3 路并发、单段几千字的场景足够快；
 * 如果内容更长，下一步可以把渲染结果做增量 diff，或用 Web Worker 解析。
 */
const html = computed(() => renderMarkdown(props.source))
</script>

<template>
  <!-- markdown-it 已关闭 html: true，v-html 不会引入脚本注入面 -->
  <div class="markdown" v-html="html" />
</template>
