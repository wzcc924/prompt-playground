<script setup lang="ts">
import { computed, ref } from 'vue'
import { MODELS } from '@/config/models'
import { usePlayground } from '@/stores/playground'

const store = usePlayground()
const naming = ref(false)
const templateName = ref('')

const canSend = computed(() => store.prompt.trim().length > 0 && !store.isStreaming)

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    submit()
  }
}

function submit() {
  if (!canSend.value) return
  store.send()
}

async function confirmSave() {
  await store.saveTemplate(templateName.value)
  naming.value = false
  templateName.value = ''
}
</script>

<template>
  <div class="composer">
    <div class="composer-card">
      <div v-if="store.varNames.length" class="vars-row">
        <label v-for="name in store.varNames" :key="name" class="var-field">
          <span>{{ name }}</span>
          <input v-model="store.vars[name]" :placeholder="`填写 ${name}`" />
        </label>
      </div>

      <textarea
        v-model="store.prompt"
        class="composer-input"
        placeholder="写下你要测的 prompt…  支持 {{变量}} 占位符，例如：把 {{requirement}} 拆成任务清单"
        spellcheck="false"
        @keydown="onKeydown"
      />

      <div class="composer-bar">
        <div class="model-toggles">
          <button
            v-for="model in MODELS"
            :key="model.id"
            class="chip"
            :class="{ 'is-on': store.modelIds.includes(model.id) }"
            @click="store.toggleModel(model.id)"
          >
            <span class="model-dot" :style="{ background: model.color, display: 'inline-block', marginRight: '6px' }" />
            {{ model.label }}
          </button>
        </div>

        <span style="flex: 1" />

        <template v-if="naming">
          <input
            v-model="templateName"
            class="var-field"
            style="width: 150px; background: var(--panel-2)"
            placeholder="模板名称"
            @keydown.enter="confirmSave"
          />
          <button class="btn btn-sm" @click="confirmSave">保存</button>
          <button class="btn btn-sm" @click="naming = false">取消</button>
        </template>
        <template v-else>
          <button class="btn btn-sm" :disabled="!store.prompt.trim()" @click="naming = true">
            存为模板
          </button>
          <button
            v-if="store.isStreaming"
            class="btn btn-sm btn-danger"
            @click="store.stop()"
          >
            中断
          </button>
          <button v-else class="btn btn-primary" :disabled="!canSend" @click="submit">
            发送 <span class="kbd" style="color: #fff; border-color: rgba(255,255,255,.4); background: transparent">⌘↵</span>
          </button>
        </template>
      </div>
    </div>

    <div class="hint" style="margin-top: 6px; padding-left: 4px">
      <template v-if="store.isStreaming">正在接收流式输出，可随时中断</template>
      <template v-else>⌘/Ctrl + Enter 发送 · 最多同时对比 3 个模型 · 同一 prompt 可对单列重试</template>
    </div>
  </div>
</template>
