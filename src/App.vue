<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import SideBar from './components/SideBar.vue'
import TopBar from './components/TopBar.vue'
import OutputColumn from './components/OutputColumn.vue'
import MetricsPanel from './components/MetricsPanel.vue'
import PromptComposer from './components/PromptComposer.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import { usePlayground } from './stores/playground'
import { useSettings } from './stores/settings'

const store = usePlayground()
const settings = useSettings()
const showSettings = ref(false)

const columnsStyle = computed<Record<string, string>>(() => ({
  '--cols': String(Math.max(1, store.columns.length))
}))

const examples = [
  {
    label: '技术选型对比',
    text: '针对场景「{{scenario}}」，对比 Vue 3 与 React 18。用表格输出适用场景、学习成本、生态、性能，最后给出明确结论。'
  },
  {
    label: '代码审查',
    text: '审查下面这段代码，从可读性、性能、边界情况三方面给出改进建议，每个问题标注严重程度：\n\n```\nfetch("/api/list").then(r => r.json()).then(d => setData(d.items))\n```'
  },
  {
    label: '需求拆解',
    text: '把「给后台管理系统加一个可拖拽排序的表格」拆成前端任务清单，每个任务写清验收标准和依赖关系。'
  },
  {
    label: '解释概念',
    text: '用一段话解释 SSE 和 WebSocket 的区别，并说明什么场景该选哪个。'
  }
]

function useExample(text: string) {
  store.prompt = text
}

function exportMd() {
  const content = store.buildExport()
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${store.title}.md`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  // 不 await：模板有内置兜底，界面不该等数据库
  void store.init()

  // 直接分享一个「立刻能看到效果」的链接：?demo=1
  const params = new URLSearchParams(location.search)
  if (params.get('theme') === 'light' || params.get('theme') === 'dark') {
    settings.theme = params.get('theme') as 'light' | 'dark'
  }
  const preset = params.get('q')
  if (preset) store.prompt = preset
  if (params.get('demo') === '1' && !store.columns.length) {
    store.prompt = examples[0].text
    void store.send()
  }
})
</script>

<template>
  <div class="app">
    <SideBar />

    <main class="main">
      <TopBar @settings="showSettings = true" @export="exportMd" />

      <section class="stage">
        <div v-if="!store.columns.length" class="hero">
          <div class="hero-title">同一个 prompt，并排看三个模型怎么答</div>
          <p class="hero-desc">
            写一次 prompt，同时发给多个模型，实时对比输出质量、首字延迟和成本。
            预置了 Prompt 模板与变量占位符，也可以把好的 prompt 存下来反复用。
          </p>
          <div class="hero-chips">
            <button v-for="ex in examples" :key="ex.label" class="chip" @click="useExample(ex.text)">
              {{ ex.label }}
            </button>
          </div>
          <div class="hint">当前为演示模式，无需 API Key 即可完整体验流式输出</div>
        </div>

        <div v-else class="columns" :style="columnsStyle">
          <OutputColumn
            v-for="col in store.columns"
            :key="col.modelId"
            :column="col"
            @retry="store.retry"
          />
        </div>
      </section>

      <MetricsPanel :columns="store.columns" />
      <PromptComposer />
    </main>

    <SettingsDialog v-if="showSettings" @close="showSettings = false" />
    <div v-if="store.notice" class="toast">{{ store.notice }}</div>
  </div>
</template>
