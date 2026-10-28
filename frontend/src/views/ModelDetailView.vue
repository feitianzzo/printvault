<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import type { ModelDetailDTO, VersionDTO } from '@/api/types'
import ModelViewer from '@/components/ModelViewer.vue'
import VersionTimeline from '@/components/VersionTimeline.vue'
import NotesPanel from '@/components/NotesPanel.vue'
import UploadPanel from '@/components/UploadPanel.vue'
import SlicerSendModal from '@/components/SlicerSendModal.vue'
import AppModal from '@/components/AppModal.vue'
import { formatBadgeClass, formatBytes, formatDate, formatDims, formatVolume, formatCount, FORMAT_LABELS } from '@/utils/format'
import { useToastStore } from '@/stores/toast'

const route = useRoute()
const router = useRouter()
const toast = useToastStore()

const modelId = computed(() => Number(route.params.id))
const model = ref<ModelDetailDTO | null>(null)
const loading = ref(true)
const previewVersion = ref<VersionDTO | null>(null)
const tab = ref<'versions' | 'notes'>('versions')

const showUpload = ref(false)
const showEdit = ref(false)
const noteVersion = ref<VersionDTO | null>(null)
const slicerVersion = ref<VersionDTO | null>(null)

const editName = ref('')
const editDesc = ref('')
const editTags = ref('')

/** 挂在模型本身（不含各版本）上的备注数 */
const modelNoteCount = computed(() => model.value?.notes.filter((n) => n.targetType === 'model').length ?? 0)

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await api.get<{ model: ModelDetailDTO }>(`/api/models/${modelId.value}`)
    model.value = res.model
    const target = previewVersion.value
    const stillExists = target && res.model.versions.some((v) => v.id === target.id)
    previewVersion.value = stillExists ? res.model.versions.find((v) => v.id === target!.id)! : res.model.current
  } catch (err) {
    toast.push('error', (err as Error).message)
  } finally {
    loading.value = false
  }
}

watch(modelId, () => {
  previewVersion.value = null
  void load()
})

function openEdit(): void {
  if (!model.value) return
  editName.value = model.value.name
  editDesc.value = model.value.description
  editTags.value = model.value.tags.join(', ')
  showEdit.value = true
}

async function saveEdit(): Promise<void> {
  if (!model.value) return
  try {
    await api.patch(`/api/models/${model.value.id}`, {
      name: editName.value.trim(),
      description: editDesc.value,
      tags: editTags.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
    })
    toast.push('success', '已保存')
    showEdit.value = false
    await load()
  } catch (err) {
    toast.push('error', (err as Error).message)
  }
}

async function deleteModel(): Promise<void> {
  const m = model.value
  if (!m) return
  if (!confirm(`确定删除模型「${m.name}」及其全部版本与备注？此操作不可恢复！`)) return
  try {
    await api.delete(`/api/models/${m.id}`)
    toast.push('success', '模型已删除')
    void router.push(`/projects/${m.projectId}`)
  } catch (err) {
    toast.push('error', (err as Error).message)
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-5">
    <div v-if="model">
      <button class="mb-3 flex items-center gap-1 text-sm text-zinc-500 hover:text-teal-600" @click="router.push(`/projects/${model.projectId}`)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        返回项目
      </button>

      <!-- 头部 -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="truncate text-xl font-bold sm:text-2xl">{{ model.name }}</h1>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span>{{ model.versionCount }} 个版本</span>
            <span>·</span>
            <span>创建于 {{ formatDate(model.createdAt) }}</span>
            <template v-if="model.tags.length">
              <span>·</span>
              <span v-for="t in model.tags" :key="t" class="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">#{{ t }}</span>
            </template>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <a v-if="model.current" class="btn-secondary" :href="model.current.downloadUrl">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            下载
          </a>
          <button class="btn-primary" @click="showUpload = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4"><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            上传新版本
          </button>
          <button class="btn-secondary" @click="openEdit">编辑</button>
          <button class="btn-danger" @click="deleteModel">删除</button>
        </div>
      </div>

      <!-- 查看器 + 信息 -->
      <div class="grid gap-4 lg:grid-cols-3">
        <div class="h-72 sm:h-96 lg:col-span-2 lg:h-[560px]">
          <ModelViewer v-if="previewVersion" :version="previewVersion" />
        </div>

        <div class="space-y-4">
          <!-- 预览版本信息 -->
          <div v-if="previewVersion" class="card p-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-lg font-bold">v{{ previewVersion.versionNo }}</span>
                <span v-if="model.current && previewVersion.id !== model.current.id" class="badge bg-amber-500/10 text-amber-600 dark:text-amber-400">历史版本预览</span>
                <span v-else class="badge bg-teal-600/10 text-teal-600 dark:text-teal-400">当前版本</span>
              </div>
              <span class="badge" :class="formatBadgeClass(previewVersion.format)">{{ FORMAT_LABELS[previewVersion.format] || previewVersion.format }}</span>
            </div>
            <div v-if="previewVersion.versionLabel" class="mt-0.5 text-sm text-zinc-500">{{ previewVersion.versionLabel }}</div>
            <dl class="mt-3 space-y-1.5 text-sm">
              <div class="flex justify-between gap-2"><dt class="shrink-0 text-zinc-500">尺寸</dt><dd class="text-right tabular-nums">{{ formatDims(previewVersion.dims) }}</dd></div>
              <div class="flex justify-between gap-2"><dt class="shrink-0 text-zinc-500">三角形</dt><dd class="text-right tabular-nums">{{ previewVersion.triangleCount != null ? formatCount(previewVersion.triangleCount) : '-' }}</dd></div>
              <div class="flex justify-between gap-2"><dt class="shrink-0 text-zinc-500">体积</dt><dd class="text-right tabular-nums">{{ formatVolume(previewVersion.volumeMm3) }}</dd></div>
              <div class="flex justify-between gap-2"><dt class="shrink-0 text-zinc-500">文件大小</dt><dd class="text-right tabular-nums">{{ formatBytes(previewVersion.sizeBytes) }}</dd></div>
              <div class="flex justify-between gap-2"><dt class="shrink-0 text-zinc-500">上传时间</dt><dd class="text-right">{{ formatDate(previewVersion.createdAt) }}</dd></div>
            </dl>
            <div class="mt-2 truncate text-[11px] text-zinc-400" :title="previewVersion.originalFilename">{{ previewVersion.originalFilename }}</div>
            <button class="btn-secondary mt-3 w-full !py-1.5 text-xs" @click="noteVersion = previewVersion">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-3.5 w-3.5">
                <path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              这个版本的备注（支持语音）
            </button>
            <button class="btn-primary mt-1.5 w-full !py-1.5 text-xs" @click="slicerVersion = previewVersion">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-3.5 w-3.5">
                <path d="M6 9a2.25 2.25 0 100-4.5A2.25 2.25 0 006 9zM6 19.5a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM18.375 5.625l-7.5 7.5m0 0l-3.375 3.375m8.25-4.5l3.375 3.375" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              发送到切片软件
            </button>
          </div>

          <!-- 描述 -->
          <div class="card p-4">
            <div class="text-xs font-medium uppercase tracking-wide text-zinc-400">模型描述</div>
            <p class="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{{ model.description || '暂无描述，点击编辑补充' }}</p>
          </div>
        </div>
      </div>

      <!-- 标签页 -->
      <div class="border-b border-zinc-200 dark:border-zinc-800">
        <div class="flex gap-1">
          <button
            v-for="t in [['versions', `版本时间线 (${model.versions.length})`], ['notes', `备注 (${modelNoteCount})`]] as const"
            :key="t[0]"
            class="-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors"
            :class="tab === t[0]
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'"
            @click="tab = t[0]"
          >{{ t[1] }}</button>
        </div>
      </div>

      <div v-if="tab === 'versions'">
        <VersionTimeline
          :versions="model.versions"
          :current-version-id="model.current?.id ?? null"
          :notes="model.notes"
          @preview="previewVersion = $event"
          @note="noteVersion = $event"
          @slice="slicerVersion = $event"
          @changed="load"
        />
      </div>
      <div v-else>
        <NotesPanel target-type="model" :target-id="model.id" @changed="load" />
      </div>
    </div>

    <div v-else-if="loading" class="card h-72 animate-pulse bg-zinc-100 dark:bg-zinc-800" />

    <!-- 上传新版本 -->
    <AppModal :open="showUpload" title="上传新版本" wide @close="showUpload = false">
      <UploadPanel
        v-if="showUpload && model"
        :project-id="model.projectId"
        :model-id="model.id"
        @uploaded="load"
        @close="showUpload = false"
      />
    </AppModal>

    <!-- 编辑模型 -->
    <AppModal :open="showEdit" title="编辑模型信息" @close="showEdit = false">
      <form class="space-y-4" @submit.prevent="saveEdit">
        <div>
          <label class="mb-1 block text-xs font-medium text-zinc-500">模型名称 *</label>
          <input v-model="editName" class="input" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-zinc-500">描述</label>
          <textarea v-model="editDesc" class="input min-h-20 resize-y" rows="3" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-zinc-500">标签（逗号分隔）</label>
          <input v-model="editTags" class="input" placeholder="外壳, PETG, v2" />
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="showEdit = false">取消</button>
          <button type="submit" class="btn-primary">保存</button>
        </div>
      </form>
    </AppModal>

    <!-- 发送到切片软件 -->
    <SlicerSendModal
      :open="!!slicerVersion"
      :version="slicerVersion"
      @close="slicerVersion = null"
    />

    <!-- 版本备注 -->
    <AppModal :open="!!noteVersion" :title="`v${noteVersion?.versionNo ?? ''} 的备注`" wide @close="noteVersion = null">
      <NotesPanel
        v-if="noteVersion"
        target-type="version"
        :target-id="noteVersion.id"
        @changed="load"
        @vue:unmounted="noteVersion = null"
      />
    </AppModal>
  </div>
</template>
