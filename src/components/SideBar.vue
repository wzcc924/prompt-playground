<script setup lang="ts">
import { usePlayground } from '@/stores/playground'

const store = usePlayground()

function relative(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const date = new Date(ts)
  return `${date.getMonth() + 1}-${date.getDate()}`
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">P</div>
      <div>
        <div class="brand-title">Prompt Playground</div>
        <div class="brand-sub">多模型对比调试台</div>
      </div>
    </div>

    <div class="side-scroll">
      <div class="side-section">
        <div class="side-head">
          <span>Prompt 模板</span>
          <span>{{ store.templates.length }}</span>
        </div>
        <button
          v-for="tpl in store.templates"
          :key="tpl.id"
          class="side-item"
          :class="{ 'is-active': store.activeTemplateId === tpl.id }"
          @click="store.applyTemplate(tpl)"
        >
          <div class="side-item-text">
            <div class="side-item-title">{{ tpl.name }}</div>
            <div class="side-item-meta">{{ tpl.body.replace(/\s+/g, ' ').slice(0, 34) }}</div>
          </div>
          <span class="icon-btn" title="删除" @click.stop="store.removeTemplate(tpl.id)">✕</span>
        </button>
        <div v-if="!store.templates.length" class="empty-hint">还没有模板，写完 prompt 后点「存为模板」</div>
      </div>

      <div class="side-section">
        <div class="side-head">
          <span>历史会话</span>
          <span>{{ store.sessions.length }}</span>
        </div>
        <button
          v-for="session in store.sessions"
          :key="session.id"
          class="side-item"
          @click="store.restoreSession(session)"
        >
          <div class="side-item-text">
            <div class="side-item-title">{{ session.title }}</div>
            <div class="side-item-meta">
              {{ relative(session.createdAt) }} · {{ session.modelIds.length }} 路对比
            </div>
          </div>
          <span class="icon-btn" title="删除" @click.stop="store.removeSession(session.id)">✕</span>
        </button>
        <div v-if="!store.sessions.length" class="empty-hint">发一次请求，这里会自动留档</div>
      </div>
    </div>
  </aside>
</template>
