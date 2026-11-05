import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'pp:settings'

interface Persisted {
  baseUrl: string
  apiKey: string
  system: string
  useMock: boolean
  theme: Theme
}

const DEFAULTS: Persisted = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  system: '',
  useMock: true,
  theme: 'dark'
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export const useSettings = defineStore('settings', () => {
  const initial = load()

  const baseUrl = ref(initial.baseUrl)
  const apiKey = ref(initial.apiKey)
  const system = ref(initial.system)
  const useMock = ref(initial.useMock)
  const theme = ref<Theme>(initial.theme)

  /** 有 key 才走真实请求，否则自动回落 Mock —— 保证任何环境都能演示 */
  const hasCredentials = computed(() => Boolean(baseUrl.value.trim() && apiKey.value.trim()))
  const effectiveMock = computed(() => useMock.value || !hasCredentials.value)

  watch(
    [baseUrl, apiKey, system, useMock, theme],
    () => {
      const data: Persisted = {
        baseUrl: baseUrl.value,
        apiKey: apiKey.value,
        system: system.value,
        useMock: useMock.value,
        theme: theme.value
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    },
    { deep: true }
  )

  watch(
    theme,
    (t) => {
      document.documentElement.dataset.theme = t
    },
    { immediate: true }
  )

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  return {
    baseUrl,
    apiKey,
    system,
    useMock,
    theme,
    hasCredentials,
    effectiveMock,
    toggleTheme
  }
})
