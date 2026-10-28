<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api/client'
import type { StatsDTO } from '@/api/types'
import ModelCard from '@/components/ModelCard.vue'
import ProjectModal from '@/components/ProjectModal.vue'
import { formatBytes, formatCount } from '@/utils/format'
import { useRouter } from 'vue-router'

const stats = ref<StatsDTO | null>(null)
const loading = ref(true)
const showCreate = ref(false)
const router = useRouter()

async function load(): Promise<void> {
  try {
    stats.value = await api.get<StatsDTO>('/api/stats')
  } finally {
    loading.value = false
  }
}

onMounted(load)

const statCards = () => [
  { label: '项目', value: String(stats.value?.totals.projects ?? 0), to: '/projects' },
  { label: '模型', value: String(stats.value?.totals.models ?? 0), to: '/projects' },
  { label: '版本', value: String(stats.value?.totals.versions ?? 0), to: '' },
  { label: '存储占用', value: formatBytes(stats.value?.totals.storage_bytes ?? 0), to: '' },
]
</script>

<template>
  <div class="space-y-7">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold sm:text-2xl">仪表盘</h1>
        <p class="mt-0.5 text-sm text-zinc-500">3D 打印模型资产总览</p>
      </div>
      <button class="btn-primary" @click="showCreate = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M12 4.5v15m7.5-7.5h-15" stroke-linecap="round"/></svg>
        新建项目
      </button>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div v-for="c in statCards()" :key="c.label" class="card p-4" @click="c.to && router.push(c.to)">
        <div class="text-xs text-zinc-500">{{ c.label }}</div>
        <div class="mt-1 text-2xl font-bold tabular-nums">{{ c.value }}</div>
      </div>
    </div>

    <!-- 最近更新 -->
    <section>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">最近更新</h2>
      </div>
      <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div v-for="i in 4" :key="i" class="card aspect-[4/3] animate-pulse bg-zinc-100 dark:bg-zinc-800" />
      </div>
      <div v-else-if="!stats?.recent.length" class="card flex flex-col items-center gap-3 py-14 text-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="h-14 w-14 text-zinc-300 dark:text-zinc-700"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div>
          <div class="font-medium">还没有模型</div>
          <div class="mt-1 text-sm text-zinc-500">先创建一个项目，然后上传你的第一个模型</div>
        </div>
        <button class="btn-primary" @click="showCreate = true">新建项目</button>
      </div>
      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <ModelCard v-for="m in stats.recent" :key="m.id" :model="m" />
      </div>
    </section>

    <ProjectModal :open="showCreate" @close="showCreate = false" @saved="(p) => router.push(`/projects/${p.id}`)" />
  </div>
</template>
