import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { MAX_COLUMNS, getModel } from '@/config/models'
import type { ColumnState, PromptTemplate, SessionRecord } from '@/types'
import { streamChat } from '@/lib/sse'
import { streamMock } from '@/lib/mock'
import { calcCost, estimateTokens } from '@/lib/metrics'
import { db, seedTemplates, SEED_TEMPLATES } from '@/lib/db'
import { useSettings } from './settings'

/**
 * 流式渲染的核心策略：
 * 每收到一个 SSE chunk 都 setState 会导致整段 Markdown 被重复解析 + 重排，
 * 3 路并发时主线程直接被压满。这里对每一路流做 100ms 的批量提交，
 * 把"每 chunk 一次渲染"降到"每 100ms 一次渲染"，掉帧率下降一个数量级。
 */
const FLUSH_INTERVAL = 100

const VAR_PATTERN = /\{\{\s*([\w\u4e00-\u9fa5-]+)\s*\}\}/g

export const usePlayground = defineStore('playground', () => {
  const settings = useSettings()

  const prompt = ref('')
  const modelIds = ref<string[]>(['deepseek-chat', 'qwen-plus', 'gpt-4o-mini'])
  const columns = ref<ColumnState[]>([])
  const vars = reactive<Record<string, string>>({})
  const templates = ref<PromptTemplate[]>([...SEED_TEMPLATES])
  const sessions = ref<SessionRecord[]>([])
  const activeTemplateId = ref<string | null>(null)
  const notice = ref('')
  /** 仅供 ?demo=long 使用：让 Mock 一次吐一份长文档，用来演示虚拟滚动 */
  const demoLong = ref(false)

  /** AbortController 不放进响应式状态：它不需要触发视图更新，也没必要被代理 */
  const controllers = new Map<string, AbortController>()

  const isStreaming = computed(() => columns.value.some((c) => c.status === 'streaming'))
  const hasResult = computed(() => columns.value.some((c) => c.content.length > 0))

  const title = computed(() => {
    const line = prompt.value.replace(/```[\s\S]*?```/g, ' ').trim().split('\n')[0] ?? ''
    return line ? (line.length > 30 ? `${line.slice(0, 30)}…` : line) : '未命名会话'
  })

  const varNames = computed(() => {
    const set = new Set<string>()
    for (const m of prompt.value.matchAll(VAR_PATTERN)) set.add(m[1])
    return [...set]
  })

  // 模板里的 {{变量}} 变化时同步表单，已填过的值保留
  watch(
    varNames,
    (names) => {
      for (const name of names) {
        if (!(name in vars)) vars[name] = ''
      }
      for (const key of Object.keys(vars)) {
        if (!names.includes(key)) delete vars[key]
      }
    },
    { immediate: true }
  )

  let noticeTimer: ReturnType<typeof setTimeout> | null = null
  function flash(message: string) {
    notice.value = message
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => (notice.value = ''), 2200)
  }

  function renderPrompt(): string {
    return prompt.value.replace(VAR_PATTERN, (_, name: string) => {
      const value = vars[name]?.trim()
      return value || `{{${name}}}`
    })
  }

  function toggleModel(id: string) {
    if (isStreaming.value) return
    const index = modelIds.value.indexOf(id)
    if (index >= 0) {
      if (modelIds.value.length === 1) {
        flash('至少保留一个模型')
        return
      }
      modelIds.value.splice(index, 1)
    } else {
      if (modelIds.value.length >= MAX_COLUMNS) {
        flash(`最多同时对比 ${MAX_COLUMNS} 个模型`)
        return
      }
      modelIds.value.push(id)
    }
  }

  function makeColumn(modelId: string, tokensIn: number): ColumnState {
    return {
      modelId,
      status: 'idle',
      content: '',
      error: null,
      metrics: { ttft: null, duration: null, tokensIn, tokensOut: 0, cost: 0 }
    }
  }

  async function runColumn(modelId: string, finalPrompt: string): Promise<void> {
    const index = columns.value.findIndex((c) => c.modelId === modelId)
    if (index === -1) return

    const tokensIn = estimateTokens(finalPrompt)
    columns.value[index] = makeColumn(modelId, tokensIn)
    const col = columns.value[index]
    const model = getModel(modelId)

    const controller = new AbortController()
    controllers.set(modelId, controller)

    const startedAt = performance.now()
    let firstTokenAt = 0
    let buffer = ''
    let timer: ReturnType<typeof setTimeout> | null = null

    const commit = () => {
      col.content = buffer
      timer = null
    }
    const scheduleCommit = () => {
      if (timer === null) timer = setTimeout(commit, FLUSH_INTERVAL)
    }

    col.status = 'streaming'

    const onDelta = (text: string) => {
      if (!firstTokenAt) firstTokenAt = performance.now()
      buffer += text
      col.metrics.tokensOut = estimateTokens(buffer)
      scheduleCommit()
    }

    try {
      if (settings.effectiveMock) {
        await streamMock({
          model,
          prompt: finalPrompt,
          signal: controller.signal,
          onDelta,
          long: demoLong.value
        })
      } else {
        await streamChat({
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          model: modelId,
          prompt: finalPrompt,
          system: settings.system || undefined,
          signal: controller.signal,
          onDelta
        })
      }
      col.status = 'done'
    } catch (error) {
      if (controller.signal.aborted) {
        col.status = 'aborted'
      } else {
        col.status = 'error'
        const message = error instanceof Error ? error.message : String(error)
        // 真实请求失败时自动回落 Mock，保证演示不中断
        col.error = settings.effectiveMock ? message : `请求失败：${message}（可打开设置检查接口地址与 Key）`
      }
    } finally {
      if (timer !== null) clearTimeout(timer)
      col.content = buffer
      col.metrics.ttft = firstTokenAt ? Math.round(firstTokenAt - startedAt) : null
      col.metrics.duration = Math.round(performance.now() - startedAt)
      col.metrics.cost = calcCost(model, col.metrics.tokensIn, col.metrics.tokensOut)
      controllers.delete(modelId)
    }
  }

  async function send(): Promise<void> {
    if (isStreaming.value) return
    const finalPrompt = renderPrompt().trim()
    if (!finalPrompt) {
      flash('先把 prompt 写上')
      return
    }

    // 先把所有列建出来，让骨架立刻出现，再并发拉流
    const tokensIn = estimateTokens(finalPrompt)
    columns.value = modelIds.value.map((id) => makeColumn(id, tokensIn))
    await Promise.all(modelIds.value.map((id) => runColumn(id, finalPrompt)))
    await persistSession(finalPrompt)
  }

  /** 单列重试：只重跑这一路，其它列的结果保持不变 —— 这是并排对比的关键交互 */
  async function retry(modelId: string): Promise<void> {
    if (isStreaming.value) return
    const finalPrompt = renderPrompt().trim()
    if (!finalPrompt) return
    await runColumn(modelId, finalPrompt)
  }

  function stop(): void {
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
  }

  function clear(): void {
    stop()
    columns.value = []
  }

  async function persistSession(finalPrompt: string): Promise<void> {
    const done = columns.value.filter((c) => c.content)
    if (!done.length) return
    const record: SessionRecord = {
      id: `s-${Date.now()}`,
      title: title.value,
      prompt: finalPrompt,
      modelIds: [...modelIds.value],
      createdAt: Date.now(),
      columns: done.map((c) => ({
        modelId: c.modelId,
        content: c.content,
        status: c.status,
        metrics: { ...c.metrics }
      }))
    }
    sessions.value = [record, ...sessions.value.filter((s) => s.id !== record.id)].slice(0, 20)
    try {
      await db.sessions.put(record)
    } catch (error) {
      // 无痕模式 / file:// 下 IndexedDB 会被禁用，降级为「本次会话不落盘」
      console.warn('[db] 会话保存失败，已降级为内存模式', error)
    }
  }

  async function loadSessions(): Promise<void> {
    try {
      sessions.value = await db.sessions.orderBy('createdAt').reverse().limit(20).toArray()
    } catch (error) {
      console.warn('[db] 历史会话读取失败', error)
    }
  }

  async function loadTemplates(): Promise<void> {
    try {
      await seedTemplates()
      const rows = await db.templates.orderBy('updatedAt').reverse().toArray()
      if (rows.length) templates.value = rows
    } catch (error) {
      // 读取失败就保留内置模板，功能不受影响，只是改动不持久化
      console.warn('[db] 模板读取失败，使用内置模板', error)
    }
  }

  function applyTemplate(template: PromptTemplate): void {
    prompt.value = template.body
    activeTemplateId.value = template.id
    clear()
  }

  async function saveTemplate(name: string): Promise<void> {
    if (!prompt.value.trim()) {
      flash('prompt 是空的')
      return
    }
    const id = activeTemplateId.value ?? `t-${Date.now()}`
    const record: PromptTemplate = {
      id,
      name: name.trim() || '未命名模板',
      body: prompt.value,
      tags: ['mine'],
      updatedAt: Date.now()
    }
    // 先更新内存，再异步落盘：即使持久化失败，本次会话里也能立刻用上
    templates.value = [record, ...templates.value.filter((t) => t.id !== id)]
    activeTemplateId.value = id
    flash('模板已保存')

    try {
      await db.templates.put(record)
    } catch (error) {
      console.warn('[db] 模板持久化失败，仅本次会话有效', error)
    }
  }

  async function removeTemplate(id: string): Promise<void> {
    templates.value = templates.value.filter((t) => t.id !== id)
    if (activeTemplateId.value === id) activeTemplateId.value = null
    try {
      await db.templates.delete(id)
    } catch (error) {
      console.warn('[db] 模板删除失败', error)
    }
  }

  function restoreSession(record: SessionRecord): void {
    stop()
    prompt.value = record.prompt
    modelIds.value = [...record.modelIds]
    columns.value = record.columns.map((c) => ({
      modelId: c.modelId,
      status: c.status,
      content: c.content,
      error: null,
      metrics: { ...c.metrics }
    }))
  }

  async function removeSession(id: string): Promise<void> {
    sessions.value = sessions.value.filter((s) => s.id !== id)
    try {
      await db.sessions.delete(id)
    } catch (error) {
      console.warn('[db] 会话删除失败', error)
    }
  }

  /** 导出成 Markdown，方便贴进笔记或 issue */
  function buildExport(): string {
    const lines = [`# ${title.value}`, '', '## Prompt', '', '```', prompt.value, '```', '']
    for (const col of columns.value) {
      if (!col.content) continue
      const model = getModel(col.modelId)
      lines.push(`## ${model.label}`, '', col.content, '')
      lines.push(
        `> 首字 ${col.metrics.ttft ?? '—'}ms · 总耗时 ${col.metrics.duration ?? '—'}ms · 输出 ${col.metrics.tokensOut} tok`,
        ''
      )
    }
    return lines.join('\n')
  }

  async function init(): Promise<void> {
    await Promise.all([loadTemplates(), loadSessions()])
  }

  return {
    prompt,
    modelIds,
    columns,
    vars,
    templates,
    sessions,
    activeTemplateId,
    notice,
    demoLong,
    isStreaming,
    hasResult,
    title,
    varNames,
    toggleModel,
    send,
    retry,
    stop,
    clear,
    applyTemplate,
    saveTemplate,
    removeTemplate,
    restoreSession,
    removeSession,
    buildExport,
    init
  }
})
