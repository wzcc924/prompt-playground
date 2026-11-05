<script setup lang="ts">
import { computed } from 'vue'
import { usePlayground } from '@/stores/playground'
import { useSettings } from '@/stores/settings'

const store = usePlayground()
const settings = useSettings()

defineEmits<{ settings: []; export: [] }>()

const modeLabel = computed(() => (settings.effectiveMock ? 'Mock 引擎' : '真实接口'))
</script>

<template>
  <header class="topbar">
    <span class="model-name" style="font-size: 13px">{{ store.title }}</span>

    <span style="flex: 1" />

    <span class="badge" :class="{ 'is-live': !settings.effectiveMock }">
      <i class="badge-dot" />
      {{ modeLabel }}
    </span>

    <button class="btn btn-export" :disabled="!store.hasResult" @click="$emit('export')">导出 MD</button>
    <button class="btn" title="切换明暗主题" @click="settings.toggleTheme()">
      {{ settings.theme === 'dark' ? '浅色' : '深色' }}
    </button>
    <button class="btn" @click="$emit('settings')">设置</button>
    <button class="btn" @click="store.clear()">新建</button>
  </header>
</template>
