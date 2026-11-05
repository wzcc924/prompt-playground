/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // 用相对路径，保证 `vite build` 产物可以直接本地双击 / 任意静态托管打开
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173
  },
  test: {
    // 只测纯逻辑（SSE 解析 / 块切分 / token 估算），不需要 jsdom
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/db.ts', 'src/lib/mock.ts', 'src/lib/__tests__/**'],
      reporter: ['text', 'html']
    }
  }
})
