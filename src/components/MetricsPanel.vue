<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ColumnState, ModelConfig, StreamMetrics } from '@/types'
import { getModel } from '@/config/models'
import { formatCost, formatDuration, formatSpeed } from '@/lib/metrics'

type Row = ModelConfig & { metrics: StreamMetrics }

const props = defineProps<{ columns: ColumnState[] }>()
const open = ref(true)

const rows = computed<Row[]>(() =>
  props.columns.map((col) => ({ ...getModel(col.modelId), metrics: col.metrics }))
)

const valid = computed(() => rows.value.filter((r) => r.metrics.duration !== null))

/** 只在至少两路有结果时才标"最优"，否则满屏绿色反而没有信息量 */
function bestOf(pick: (r: Row) => number | null): number | null {
  const values = valid.value.map(pick).filter((v): v is number => v !== null)
  if (values.length < 2) return null
  return Math.min(...values)
}

const bestTtft = computed(() => bestOf((r) => r.metrics.ttft))
const bestDuration = computed(() => bestOf((r) => r.metrics.duration))
const bestCost = computed(() => bestOf((r) => (r.metrics.tokensOut ? r.metrics.cost : null)))
</script>

<template>
  <section v-if="columns.length && valid.length" class="metrics-panel">
    <button class="metrics-head" @click="open = !open">
      <span>{{ open ? '▾' : '▸' }}</span>
      <span>性能对比</span>
      <span class="hint">{{ columns.length }} 路并发 · 首字延迟 / 总耗时 / 输出长度 / 估算成本</span>
    </button>
    <div v-if="open" style="overflow-x: auto">
      <table class="metrics-table">
        <thead>
          <tr>
            <th>模型</th>
            <th>首字延迟</th>
            <th>总耗时</th>
            <th>输出</th>
            <th>速度</th>
            <th>成本</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <span class="row-model">
                <span class="model-dot" :style="{ background: row.color }" />
                {{ row.label }}
              </span>
            </td>
            <td :class="{ best: bestTtft !== null && row.metrics.ttft === bestTtft }">
              {{ row.metrics.ttft === null ? '—' : `${row.metrics.ttft}ms` }}
            </td>
            <td :class="{ best: bestDuration !== null && row.metrics.duration === bestDuration }">
              {{ formatDuration(row.metrics.duration) }}
            </td>
            <td>{{ row.metrics.tokensOut }} tok</td>
            <td>{{ formatSpeed(row.metrics) }}</td>
            <td :class="{ best: bestCost !== null && row.metrics.cost === bestCost }">
              {{ formatCost(row.metrics.cost) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
