<script setup lang="ts">
// 版本时间线：备注 / 回滚 / 删除 / 相邻版本差异
import type { NoteDTO, VersionDTO } from '@/api/types'
import { api } from '@/api/client'
import { formatBytes, formatDate, formatDims, formatVolume, formatCount } from '@/utils/format'
import { useToastStore } from '@/stores/toast'
import ThumbCanvas from './ThumbCanvas.vue'

const props = defineProps<{
  versions: VersionDTO[]
  currentVersionId: number | null
  notes?: NoteDTO[]
}>()
const emit = defineEmits<{
  preview: [version: VersionDTO]
  note: [version: VersionDTO]
  slice: [version: VersionDTO]
  changed: []
}>()
const toast = useToastStore()

function noteCount(v: VersionDTO): number {
  return (props.notes ?? []).filter((n) => n.targetType === 'version' && n.targetId === v.id).length
}

function diff(v: VersionDTO, older: VersionDTO | undefined): string[] {
  if (!older) return []
  const out: string[] = []
  if (v.dims && older.dims) {
    const d = (a: number, b: number) => a - b
    out.push(
      `Δ尺寸 ${d(v.dims.x, older.dims.x) >= 0 ? '+' : ''}${d(v.dims.x, older.dims.x).toFixed(1)}/${d(v.dims.y, older.dims.y) >= 0 ? '+' : ''}${d(v.dims.y, older.dims.y).toFixed(1)}/${d(v.dims.z, older.dims.z) >= 0 ? '+' : ''}${d(v.dims.z, older.dims.z).toFixed(1)}mm`,
    )
  }
  if (v.volumeMm3 != null && older.volumeMm3 != null) {
    const dv = v.volumeMm3 - older.volumeMm3
    out.push(`Δ体积 ${dv >= 0 ? '+' : ''}${(dv / 1e3).toFixed(1)}cm³`)
  }
  if (v.triangleCount != null && older.triangleCount != null) {
    out.push(`Δ面数 ${v.triangleCount - older.triangleCount >= 0 ? '+' : ''}${v.triangleCount - older.triangleCount}`)
  }
  return out
}

async function rollback(v: VersionDTO): Promise<void> {
  try {
    await api.post(`/api/models/${v.modelId}/versions/${v.id}/rollback`)
    toast.push('success', `已回滚到 v${v.versionNo}`)
    emit('changed')
  } catch (err) {
    toast.push('error', (err as Error).message)
  }
}

async function removeVersion(v: VersionDTO): Promise<void> {
  if (!confirm(`确定删除 v${v.versionNo}（${v.originalFilename}）？此操作不可恢复。`)) return
  try {
    await api.delete(`/api/models/${v.modelId}/versions/${v.id}`)
    toast.push('success', `v${v.versionNo} 已删除`)
    emit('changed')
  } catch (err) {
    toast.push('error', (err as Error).message)
  }
}
</script>

<template>
  <ol class="relative space-y-0">
    <li v-for="(v, i) in versions" :key="v.id" class="relative flex gap-3 pb-5 last:pb-0">
      <!-- 时间线 -->
      <div class="flex flex-col items-center">
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          :class="v.id === currentVersionId
            ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
            : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'"
        >v{{ v.versionNo }}</div>
        <div v-if="i < versions.length - 1" class="w-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="card overflow-hidden">
          <div class="flex gap-3 p-3">
            <div class="h-16 w-16 shrink-0 overflow-hidden rounded-lg">
              <ThumbCanvas :version="v" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span class="text-sm font-medium">{{ v.versionLabel || `第 ${v.versionNo} 版` }}</span>
                <span v-if="v.id === currentVersionId" class="badge bg-teal-600/10 text-teal-600 dark:text-teal-400">当前版本</span>
              </div>
              <div class="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{{ v.originalFilename }}</div>
              <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-400">
                <span>{{ formatBytes(v.sizeBytes) }}</span>
                <span>{{ formatDims(v.dims) }}</span>
                <span v-if="v.triangleCount != null">{{ formatCount(v.triangleCount) }} 面</span>
                <span v-if="v.volumeMm3 != null">{{ formatVolume(v.volumeMm3) }}</span>
              </div>
              <div class="mt-1 text-[11px] text-zinc-400">{{ formatDate(v.createdAt) }}</div>
            </div>
          </div>

          <!-- 与上一版本差异 -->
          <div v-if="diff(v, versions[i + 1]).length" class="flex flex-wrap gap-1.5 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800/60">
            <span
              v-for="d in diff(v, versions[i + 1])"
              :key="d"
              class="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
            >{{ d }}</span>
          </div>

          <!-- 操作 -->
          <div class="flex flex-wrap gap-1.5 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800/60">
            <button class="btn-secondary !px-2.5 !py-1 text-xs" @click="emit('preview', v)">预览</button>
            <button
              class="btn-secondary !px-2.5 !py-1 text-xs"
              :class="{ '!bg-teal-600/10 !text-teal-600 dark:!text-teal-400': noteCount(v) > 0 }"
              :title="noteCount(v) > 0 ? `已有 ${noteCount(v)} 条备注` : '为这个版本添加备注'"
              @click="emit('note', v)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-3.5 w-3.5">
                <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              备注<template v-if="noteCount(v) > 0">&nbsp;{{ noteCount(v) }}</template>
            </button>
            <button
              class="btn-secondary !px-2.5 !py-1 text-xs"
              title="发送到本机切片软件（OrcaSlicer / Cura 等）"
              @click="emit('slice', v)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-3.5 w-3.5">
                <path d="M6 9a2.25 2.25 0 100-4.5A2.25 2.25 0 006 9zM6 19.5a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM18.375 5.625l-7.5 7.5m0 0l-3.375 3.375m8.25-4.5l3.375 3.375" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              切片
            </button>
            <a class="btn-secondary !px-2.5 !py-1 text-xs" :href="v.downloadUrl">下载</a>
            <button v-if="v.id !== currentVersionId" class="btn-secondary !px-2.5 !py-1 text-xs" @click="rollback(v)">设为当前版本</button>
            <button v-if="v.id !== currentVersionId" class="btn-danger !px-2.5 !py-1 text-xs" @click="removeVersion(v)">删除</button>
          </div>
        </div>
      </div>
    </li>
  </ol>
</template>
