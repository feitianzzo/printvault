<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import type { ModelListItemDTO, ProjectDTO } from '@/api/types'
import ModelCard from '@/components/ModelCard.vue'
import UploadPanel from '@/components/UploadPanel.vue'
import ProjectModal from '@/components/ProjectModal.vue'
import AppModal from '@/components/AppModal.vue'
import { formatBytes, FORMAT_LABELS, PREVIEWABLE_FORMATS } from '@/utils/format'
import { useToastStore } from '@/stores/toast'

const route = useRoute()
const router = useRouter()
const toast = useToastStore()

const projectId = computed(() => Number(route.params.id))
const project = ref<ProjectDTO | null>(null)
const models = ref<ModelListItemDTO[]>([])
const loading = ref(true)

const searchText = ref('')
const sort = ref('updated_desc')
const formatFilter = ref('')
const tagFilter = ref('')

const showUpload = ref(false)
const showEdit = ref(false)

const allTags = computed(() => {
  const set = new Set<string>()
  for (const m of models.value) for (const t of m.tags) set.add(t)
  return [...set]
})

const formatOptions = computed(() => {
  const set = new Set<string>()
  for (const m of models.value) if (m.current) set.add(m.current.format)
  return [...set]
})

async function loadProject(): Promise<void> {
  try {
    const res = await api.get<{ project: ProjectDTO }>(`/api/projects/${projectId.value}`)
    project.value = res.project
  } catch (err) {
    toast.push('error', (err as Error).message)
  }
}

let loadSeq = 0

async function loadModels(): Promise<void> {
  const seq = ++loadSeq
  const params = new URLSearchParams()
  if (searchText.value.trim()) params.set('search', searchText.value.trim())
  if (sort.value) params.set('sort', sort.value)
  if (formatFilter.value) params.set('format', formatFilter.value)
  if (tagFilter.value) params.set('tag', tagFilter.value)
  const res = await api.get<{ models: ModelListItemDTO[] }>(
    `/api/projects/${projectId.value}/models?${params.toString()}`,
  )
  if (seq !== loadSeq || Number(route.params.id) !== projectId.value) return
  models.value = res.models
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    await Promise.all([loadProject(), loadModels()])
  } finally {
    loading.value = false
  }
}

let searchTimer: number | null = null
watch(searchText, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => void loadModels(), 300)
})
watch([sort, formatFilter, tagFilter], () => void loadModels())
watch(projectId, () => void reload())

async function deleteProject(): Promise<void> {
  const p = project.value
  if (!p) return
  if (!confirm(`确定删除项目「${p.name}」及其全部模型和版本？此操作不可恢复！`)) return
  try {
    await api.delete(`/api/projects/${p.id}`)
    toast.push('success', '项目已删除')
    void router.push('/projects')
  } catch (err) {
    toast.push('error', (err as Error).message)
  }
}

onMounted(reload)
</script>

<template>
  <div class="space-y-5">
    <!-- 项目头 -->
    <div v-if="project">
      <button class="mb-3 flex items-center gap-1 text-sm text-zinc-500 hover:text-teal-600" @click="router.push('/projects')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        返回项目列表
      </button>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 items-center gap-4">
          <div class="hidden h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-teal-400/80 to-sky-600/80 sm:block">
            <img v-if="project.coverUrl" :src="project.coverUrl" class="h-full w-full object-cover" alt="" @error="project.coverUrl = null" />
            <div v-else class="flex h-full w-full items-center justify-center text-2xl font-bold text-white/90">{{ project.name.slice(0, 1) }}</div>
          </div>
          <div class="min-w-0">
            <h1 class="flex items-center gap-2 truncate text-xl font-bold sm:text-2xl">
              {{ project.name }}
              <span v-if="project.archived" class="badge bg-zinc-500/10 text-zinc-500">已归档</span>
            </h1>
            <p class="mt-0.5 line-clamp-2 text-sm text-zinc-500">{{ project.description || '暂无描述' }}</p>
            <div class="mt-1.5 flex gap-3 text-xs text-zinc-400">
              <span>{{ project.modelCount ?? 0 }} 模型</span>
              <span>{{ project.versionCount ?? 0 }} 版本</span>
              <span>{{ formatBytes(project.storageBytes ?? 0) }}</span>
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="btn-primary" @click="showUpload = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            上传模型
          </button>
          <button class="btn-secondary" @click="showEdit = true">编辑</button>
          <button class="btn-danger hidden sm:inline-flex" @click="deleteProject">删除</button>
        </div>
      </div>
    </div>

    <!-- 工具条 -->
    <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <div class="relative flex-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"><path d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" stroke-linecap="round"/></svg>
        <input v-model="searchText" class="input !pl-9" placeholder="搜索模型名称、标签、备注…" />
      </div>
      <select v-model="sort" class="input !w-auto">
        <option value="updated_desc">最近更新</option>
        <option value="updated_asc">最早更新</option>
        <option value="name_asc">名称 A-Z</option>
        <option value="name_desc">名称 Z-A</option>
      </select>
    </div>
    <div v-if="formatOptions.length || allTags.length" class="flex flex-wrap gap-1.5">
      <button
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
        :class="!formatFilter && !tagFilter ? 'bg-teal-600 text-white' : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-400'"
        @click="formatFilter = ''; tagFilter = ''"
      >全部</button>
      <button
        v-for="f in formatOptions"
        :key="f"
        class="rounded-full px-3 py-1 text-xs font-medium uppercase transition-colors"
        :class="formatFilter === f ? 'bg-teal-600 text-white' : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-400'"
        @click="formatFilter = formatFilter === f ? '' : f"
      >{{ FORMAT_LABELS[f] || f }}</button>
      <button
        v-for="t in allTags"
        :key="t"
        class="rounded-full px-3 py-1 text-xs font-medium transition-colors"
        :class="tagFilter === t ? 'bg-teal-600 text-white' : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-400'"
        @click="tagFilter = tagFilter === t ? '' : t"
      >#{{ t }}</button>
    </div>

    <!-- 模型网格 -->
    <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <div v-for="i in 4" :key="i" class="card aspect-[4/3] animate-pulse bg-zinc-100 dark:bg-zinc-800" />
    </div>
    <div v-else-if="!models.length" class="card flex flex-col items-center gap-3 py-14 text-center">
      <div class="text-lg font-medium">{{ searchText || formatFilter || tagFilter ? '没有匹配的模型' : '项目还是空的' }}</div>
      <div class="text-sm text-zinc-500">上传 STL / 3MF / STEP / OBJ 文件开始使用</div>
      <button class="btn-primary" @click="showUpload = true">上传模型</button>
    </div>
    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <ModelCard v-for="m in models" :key="m.id" :model="m" />
    </div>

    <!-- 上传弹窗 -->
    <AppModal :open="showUpload" title="上传模型" wide @close="showUpload = false">
      <UploadPanel
        v-if="showUpload"
        :project-id="projectId"
        @uploaded="reload"
        @close="showUpload = false"
      />
    </AppModal>

    <ProjectModal :open="showEdit" :project="project" @close="showEdit = false" @saved="loadProject" />
  </div>
</template>
