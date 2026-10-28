<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api/client'
import type { ProjectDTO } from '@/api/types'
import ProjectModal from '@/components/ProjectModal.vue'
import { formatBytes, formatDate } from '@/utils/format'
import { useToastStore } from '@/stores/toast'

const projects = ref<ProjectDTO[]>([])
const loading = ref(true)
const showCreate = ref(false)
const editTarget = ref<ProjectDTO | null>(null)
const router = useRouter()
const toast = useToastStore()

async function load(): Promise<void> {
  try {
    const res = await api.get<{ projects: ProjectDTO[] }>('/api/projects')
    projects.value = res.projects
  } finally {
    loading.value = false
  }
}

async function toggleArchive(p: ProjectDTO): Promise<void> {
  try {
    await api.patch(`/api/projects/${p.id}`, { archived: !p.archived })
    await load()
  } catch (err) {
    toast.push('error', (err as Error).message)
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold sm:text-2xl">项目</h1>
        <p class="mt-0.5 text-sm text-zinc-500">按项目组织你的模型</p>
      </div>
      <button class="btn-primary" @click="showCreate = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M12 4.5v15m7.5-7.5h-15" stroke-linecap="round"/></svg>
        新建项目
      </button>
    </div>

    <div v-if="loading" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 3" :key="i" class="card h-36 animate-pulse bg-zinc-100 dark:bg-zinc-800" />
    </div>
    <div v-else-if="!projects.length" class="card flex flex-col items-center gap-3 py-14 text-center">
      <div class="text-lg font-medium">还没有项目</div>
      <div class="text-sm text-zinc-500">创建项目来归类管理你的 3D 模型</div>
      <button class="btn-primary" @click="showCreate = true">新建第一个项目</button>
    </div>

    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="p in projects"
        :key="p.id"
        class="card group cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg"
        @click="router.push(`/projects/${p.id}`)"
      >
        <div class="flex gap-3 p-4">
          <div class="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-teal-400/80 to-sky-600/80">
            <img v-if="p.coverUrl" :src="p.coverUrl" class="h-full w-full object-cover" alt="" @error="p.coverUrl = null" />
            <div v-else class="flex h-full w-full items-center justify-center text-xl font-bold text-white/90">
              {{ p.name.slice(0, 1) }}
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <div class="truncate font-semibold">{{ p.name }}</div>
              <span v-if="p.archived" class="badge shrink-0 bg-zinc-500/10 text-zinc-500">已归档</span>
            </div>
            <div class="mt-0.5 line-clamp-2 min-h-8 text-xs text-zinc-500 dark:text-zinc-400">{{ p.description || '暂无描述' }}</div>
            <div class="mt-1.5 flex gap-3 text-[11px] text-zinc-400">
              <span>{{ p.modelCount ?? 0 }} 模型</span>
              <span>{{ p.versionCount ?? 0 }} 版本</span>
              <span>{{ formatBytes(p.storageBytes ?? 0) }}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-between border-t border-zinc-100 px-4 py-2 dark:border-zinc-800/60">
          <span class="text-[11px] text-zinc-400">更新于 {{ formatDate(p.updatedAt) }}</span>
          <div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button class="btn-secondary !px-2 !py-1 text-xs" @click.stop="editTarget = p">编辑</button>
            <button class="btn-secondary !px-2 !py-1 text-xs" @click.stop="toggleArchive(p)">{{ p.archived ? '取消归档' : '归档' }}</button>
          </div>
        </div>
      </div>
    </div>

    <ProjectModal :open="showCreate" @close="showCreate = false" @saved="load" />
    <ProjectModal :open="!!editTarget" :project="editTarget" @close="editTarget = null" @saved="load" />
  </div>
</template>
