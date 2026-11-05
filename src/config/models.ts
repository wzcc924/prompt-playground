import type { ModelConfig } from '@/types'

/**
 * 模型清单。
 * 价格按各家公开报价粗算（元 / 百万 token），Mock 模式下只用于估算展示；
 * 接真实接口时，只要服务端是 OpenAI 兼容协议，改 id 即可。
 */
export const MODELS: ModelConfig[] = [
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat',
    vendor: 'DeepSeek',
    color: '#7c5cff',
    priceIn: 2,
    priceOut: 8,
    mockSpeed: 34,
    tone: 'detailed'
  },
  {
    id: 'qwen-plus',
    label: 'Qwen Plus',
    vendor: 'Alibaba',
    color: '#3ddc97',
    priceIn: 0.8,
    priceOut: 2,
    mockSpeed: 52,
    tone: 'concise'
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    vendor: 'OpenAI',
    color: '#4d9fff',
    priceIn: 1.1,
    priceOut: 4.4,
    mockSpeed: 44,
    tone: 'structured'
  },
  {
    id: 'glm-4-flash',
    label: 'GLM-4 Flash',
    vendor: 'Zhipu',
    color: '#ffb84d',
    priceIn: 0.2,
    priceOut: 1,
    mockSpeed: 64,
    tone: 'concise'
  }
]

export const MAX_COLUMNS = 3

export function getModel(id: string): ModelConfig {
  return MODELS.find((m) => m.id === id) ?? MODELS[0]
}
