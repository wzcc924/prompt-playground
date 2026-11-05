import Dexie, { type Table } from 'dexie'
import type { PromptTemplate, SessionRecord } from '@/types'

/**
 * 为什么用 IndexedDB 而不是 localStorage：
 * 1. localStorage 只能存字符串，会话内容要反复 JSON 序列化，1MB 上限很容易撞到；
 * 2. 同步 API 会阻塞主线程，流式输出时每次落盘都可能丢帧；
 * 3. IndexedDB 支持索引和分页，历史会话可以按时间游标查询。
 */
class PlaygroundDB extends Dexie {
  templates!: Table<PromptTemplate, string>
  sessions!: Table<SessionRecord, string>

  constructor() {
    super('prompt-playground')
    this.version(1).stores({
      templates: 'id, updatedAt',
      sessions: 'id, createdAt'
    })
  }
}

export const db = new PlaygroundDB()

const RAW_SEEDS: Array<Pick<PromptTemplate, 'name' | 'tags' | 'body'>> = [
  {
    name: '代码审查',
    tags: ['coding'],
    body: [
      '你是一位资深前端工程师。请审查下面的代码，从**可读性、性能、边界情况**三个方面给出改进建议。',
      '',
      '- 用表格列出问题，标注严重程度（高 / 中 / 低）',
      '- 每条问题给出可直接替换的修改后代码',
      '',
      '```',
      '{{code}}',
      '```'
    ].join('\n')
  },
  {
    name: '需求拆解',
    tags: ['pm'],
    body: [
      '把下面的产品需求拆成可执行的前端任务清单。',
      '',
      '要求：每个任务写清楚「做什么、验收标准、依赖」，并给出工时估算（h）。',
      '',
      '需求：{{requirement}}'
    ].join('\n')
  },
  {
    name: '技术选型对比',
    tags: ['architecture'],
    body: [
      '针对场景「{{scenario}}」，对比 {{optionA}} 与 {{optionB}}。',
      '',
      '用表格输出：适用场景、学习成本、生态成熟度、性能表现、团队接受度。',
      '最后给出明确结论，不要模棱两可。'
    ].join('\n')
  },
  {
    name: '周报生成',
    tags: ['writing'],
    body: [
      '把下面的流水账整理成一份结构化周报，语气专业克制，不要形容词堆砌。',
      '',
      '结构：本周产出 / 关键决策与原因 / 风险与阻塞 / 下周计划。',
      '',
      '{{raw}}'
    ].join('\n')
  }
]

/**
 * 种子模板同时承担两个角色：
 * 1. 首次启动灌进 IndexedDB；
 * 2. 作为内存兜底 —— IndexedDB 不可用（无痕模式 / file://）时侧边栏也不至于空着。
 */
export const SEED_TEMPLATES: PromptTemplate[] = RAW_SEEDS.map((seed, index) => ({
  ...seed,
  id: `seed-${index}`,
  updatedAt: Date.now() - index * 1000
}))

export async function seedTemplates(): Promise<void> {
  const count = await db.templates.count()
  if (count > 0) return
  await db.templates.bulkPut(SEED_TEMPLATES)
}
