<script setup lang="ts">
// 上传面板：选文件 → 解析元数据 → 渲染缩略图 → 上传（带进度）
import { ref } from 'vue'
import { postFormWithProgress } from '@/api/client'
import type { UploadResult } from '@/api/types'
import { parseModelFile, buildGeometry } from '@/utils/modelFile'
import { renderThumbnail } from '@/utils/thumbnail'
import { formatBytes, PREVIEWABLE_FORMATS } from '@/utils/format'
import { useToastStore } from '@/stores/toast'

interface UploadItem {
  id: number
  file: File
  status: 'pending' | 'parsing' | 'thumbing' | 'uploading' | 'done' | 'error'
  progress: number
  message: string
}

const props = defineProps<{ projectId: number; modelId?: number }>()
const emit = defineEmits<{ uploaded: [result: UploadResult]; close: [] }>()
const toast = useToastStore()

const items = ref<UploadItem[]>([])
const name = ref('')
const versionLabel = ref('')
const dragOver = ref(false)
const busy = ref(false)
const fileInput = ref<HTMLInputElement>()

let itemId = 1

function formatOf(file: File): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.name)
  const ext = (m?.[1] || '').toLowerCase()
  return ext === 'stp' ? 'step' : ext || 'other'
}

function addFiles(list: FileList | File[] | null): void {
  if (!list) return
  const arr = Array.from(list)
  for (const file of arr) {
    items.value.push({ id: itemId++, file, status: 'pending', progress: 0, message: '' })
  }
  if (!name.value && arr.length > 0 && !props.modelId) {
    name.value = arr[0].name.replace(/\.[^.]+$/, '')
  }
}

function onFileChange(e: Event): void {
  const target = e.target as HTMLInputElement
  addFiles(target.files)
  target.value = ''
}

function onDrop(e: DragEvent): void {
  dragOver.value = false
  addFiles(e.dataTransfer?.files ?? null)
}

async function start(): Promise<void> {
  const pendingItems = items.value.filter((i) => i.status === 'pending' || i.status === 'error')
  if (!pendingItems.length) return
  if (!props.modelId && !name.value.trim()) {
    toast.push('error', '请填写模型名称')
    return
  }
  busy.value = true
  let lastResult: UploadResult | null = null
  for (const item of pendingItems) {
    try {
      const format = formatOf(item.file)
      const meta: Record<string, number> = {}
      let thumb: Blob | null = null

      if (PREVIEWABLE_FORMATS.has(format)) {
        item.status = 'parsing'
        const buffer = await item.file.arrayBuffer()
        const parsed = await parseModelFile(buffer, format)
        meta.triangles = parsed.stats.triangles
        meta.dimX = parsed.stats.max[0] - parsed.stats.min[0]
        meta.dimY = parsed.stats.max[1] - parsed.stats.min[1]
        meta.dimZ = parsed.stats.max[2] - parsed.stats.min[2]
        meta.volume = parsed.stats.volume

        item.status = 'thumbing'
        const geometry = buildGeometry(parsed)
        thumb = await renderThumbnail(geometry)
        geometry.dispose()
      }

      item.status = 'uploading'
      item.progress = 0
      const form = new FormData()
      form.append('projectId', String(props.projectId))
      if (props.modelId) form.append('modelId', String(props.modelId))
      if (!props.modelId && pendingItems.length === 1) form.append('name', name.value.trim())
      if (versionLabel.value.trim()) form.append('versionLabel', versionLabel.value.trim())
      form.append('meta', JSON.stringify(meta))
      form.append('file', item.file)
      if (thumb) form.append('thumbnail', thumb, 'thumb.webp')

      const res = await postFormWithProgress<UploadResult>('/api/models', form, (l, t) => {
        item.progress = t > 0 ? Math.round((l / t) * 100) : 0
      })
      item.status = 'done'
      item.message = res.warning || ''
      lastResult = res
    } catch (err) {
      item.status = 'error'
      item.message = (err as Error).message || '上传失败'
    }
  }
  busy.value = false
  if (lastResult) {
    emit('uploaded', lastResult)
    toast.push('success', props.modelId ? '新版本已上传' : '上传完成')
  }
  if (items.value.every((i) => i.status === 'done')) {
    setTimeout(() => emit('close'), 600)
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 拖放区 -->
    <div
      class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors"
      :class="dragOver ? 'border-teal-500 bg-teal-500/5' : 'border-zinc-300 hover:border-teal-400 dark:border-zinc-700'"
      @click="fileInput?.click()"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-9 w-9 text-teal-500">
        <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="text-sm font-medium">点击选择或拖拽模型文件到此处</div>
      <div class="text-xs text-zinc-500">支持 STL / 3MF / STEP / OBJ，可多选</div>
      <input ref="fileInput" type="file" multiple class="hidden" @click.stop @change="onFileChange" />
    </div>

    <!-- 选项 -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div v-if="!modelId">
        <label class="mb-1 block text-xs font-medium text-zinc-500">模型名称</label>
        <input v-model="name" class="input" placeholder="默认取文件名" />
      </div>
      <div :class="modelId ? '' : ''">
        <label class="mb-1 block text-xs font-medium text-zinc-500">版本标注（可选）</label>
        <input v-model="versionLabel" class="input" :placeholder="modelId ? '如：v3-加厚底板' : '如：初版'" />
      </div>
    </div>

    <!-- 队列 -->
    <div v-if="items.length" class="space-y-2">
      <div v-for="item in items" :key="item.id" class="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{{ item.file.name }}</span>
            <span class="shrink-0 text-[11px] text-zinc-400">{{ formatBytes(item.file.size) }}</span>
          </div>
          <div v-if="item.status === 'uploading'" class="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div class="h-full rounded-full bg-teal-500 transition-all" :style="{ width: item.progress + '%' }" />
          </div>
          <div v-if="item.message" class="mt-1 truncate text-xs" :class="item.status === 'error' ? 'text-red-500' : 'text-amber-500'">
            {{ item.message }}
          </div>
        </div>
        <div class="shrink-0 text-xs text-zinc-500">
          <template v-if="item.status === 'pending'">等待</template>
          <template v-else-if="item.status === 'parsing'">解析中…</template>
          <template v-else-if="item.status === 'thumbing'">生成缩略图…</template>
          <template v-else-if="item.status === 'uploading'">上传 {{ item.progress }}%</template>
          <span v-else-if="item.status === 'done'" class="text-teal-600 dark:text-teal-400">完成 ✓</span>
          <span v-else class="text-red-500">失败</span>
        </div>
        <button v-if="item.status === 'pending' || item.status === 'error'" class="text-zinc-400 hover:text-red-500" @click="items = items.filter((i) => i !== item)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>

    <div class="flex justify-end gap-2">
      <button class="btn-secondary" @click="emit('close')">关闭</button>
      <button class="btn-primary" :disabled="busy || !items.some((i) => i.status === 'pending' || i.status === 'error')" @click="start">
        <svg v-if="busy" viewBox="0 0 24 24" fill="none" class="h-4 w-4 animate-spin"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25"/><path d="M12 3a9 9 0 019 9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
        {{ busy ? '处理中…' : '开始上传' }}
      </button>
    </div>
  </div>
</template>
