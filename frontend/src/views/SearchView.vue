<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { api } from '@/api/client'
import type { ModelListItemDTO } from '@/api/types'
import ModelCard from '@/components/ModelCard.vue'

const q = ref('')
const results = ref<ModelListItemDTO[]>([])
const searched = ref(false)
const loading = ref(false)
let requestSeq = 0

async function search(): Promise<void> {
  const text = q.value.trim()
  if (!text) {
    results.value = []
    searched.value = false
    return
  }
  const seq = ++requestSeq
  loading.value = true
  try {
    const res = await api.get<{ models: ModelListItemDTO[] }>(`/api/search?q=${encodeURIComponent(text)}`)
    if (seq !== requestSeq) return // 已有更新的搜索完成，丢弃过期结果
    results.value = res.models
    searched.value = true
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

let timer: number | null = null
watch(q, () => {
  if (timer) clearTimeout(timer)
  timer = window.setTimeout(search, 300)
})

onMounted(() => {
  // 支持从其他页面带 ?q= 跳转进来
  const params = new URLSearchParams(location.search)
  const initial = params.get('q')
  if (initial) {
    q.value = initial
    void search()
  }
})
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-xl font-bold sm:text-2xl">全局搜索</h1>
      <p class="mt-0.5 text-sm text-zinc-500">跨项目搜索模型名称、描述、标签与备注内容</p>
    </div>

    <div class="relative">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"><path d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" stroke-linecap="round"/></svg>
      <input
        v-model="q"
        class="input !py-3 !pl-11 text-base"
        placeholder="输入关键词，如：底座、外壳、齿轮…"
        autofocus
      />
    </div>

    <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <div v-for="i in 4" :key="i" class="card aspect-[4/3] animate-pulse bg-zinc-100 dark:bg-zinc-800" />
    </div>
    <template v-else-if="searched">
      <div v-if="!results.length" class="card py-14 text-center text-sm text-zinc-500">
        没有找到与「{{ q }}」相关的模型
      </div>
      <template v-else>
        <div class="text-sm text-zinc-500">找到 {{ results.length }} 个模型</div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div v-for="m in results" :key="m.id" class="relative">
            <span class="absolute left-2 top-2 z-10 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
              {{ m.projectName }}
            </span>
            <ModelCard :model="m" />
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
