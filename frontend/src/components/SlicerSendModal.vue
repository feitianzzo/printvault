<script setup lang="ts">
// 发送到切片软件：把版本文件的下载链接通过 URL 协议传给本机切片软件
import { computed, ref, watch } from 'vue'
import type { VersionDTO } from '@/api/types'
import { buildSlicerUrl, getLastSlicerId, setLastSlicerId, SLICERS, type Slicer } from '@/utils/slicer'
import { useToastStore } from '@/stores/toast'
import AppModal from './AppModal.vue'
import { formatBadgeClass, FORMAT_LABELS } from '@/utils/format'

const props = defineProps<{ open: boolean; version: VersionDTO | null }>()
const emit = defineEmits<{ close: [] }>()
const toast = useToastStore()

const fileUrl = computed(() =>
  props.version ? `${location.origin}${props.version.downloadUrl}` : '',
)

const lastUsed = ref<Slicer | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) lastUsed.value = SLICERS.find((s) => s.id === getLastSlicerId()) ?? null
  },
)

function send(slicer: Slicer): void {
  if (!props.version) return
  setLastSlicerId(slicer.id)
  lastUsed.value = slicer
  // 触发自定义协议：浏览器弹出"打开 XX？"系统询问，确认后由切片软件下载并打开文件
  location.href = buildSlicerUrl(slicer.scheme, fileUrl.value)
  toast.push('info', `已调用 ${slicer.name}，请在浏览器弹窗中允许打开`)
}

async function copyLink(): Promise<void> {
  const url = fileUrl.value
  // navigator.clipboard 仅在 secure context（HTTPS/localhost）可用；
  // 局域网 HTTP 访问是本应用的主场景，需回退到 execCommand
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(url)
      toast.push('success', '下载链接已复制')
      return
    } catch {
      // 落入 execCommand 回退
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (ok) toast.push('success', '下载链接已复制')
    else toast.push('error', '复制失败，请手动复制')
  } catch {
    toast.push('error', '复制失败，请手动复制')
  }
}
</script>

<template>
  <AppModal :open="open" title="发送到切片软件" @close="emit('close')">
    <div class="space-y-4">
      <p class="text-xs leading-relaxed text-zinc-500">
        将把文件下载链接传给本机的切片软件，由它自动下载并打开。
        切片软件需与浏览器安装在同一台电脑上；首次使用时浏览器会询问"是否打开 XX"，请选择允许。
      </p>

      <!-- 上次使用 -->
      <div v-if="lastUsed && lastUsed.id" class="rounded-lg bg-teal-600/10 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm">
            <span class="text-zinc-500 dark:text-zinc-400">上次使用：</span>
            <span class="font-medium">{{ lastUsed.name }}</span>
          </div>
          <button class="btn-primary !px-3 !py-1.5 text-xs" @click="send(lastUsed)">再次发送</button>
        </div>
      </div>

      <!-- 切片软件列表 -->
      <div class="space-y-2">
        <div
          v-for="s in SLICERS"
          :key="s.id"
          class="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ s.name }}</span>
              <span
                class="badge"
                :class="s.support === 'direct'
                  ? 'bg-teal-600/10 text-teal-600 dark:text-teal-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'"
              >{{ s.support === 'direct' ? '直接支持' : '官方限制来源' }}</span>
            </div>
            <div class="mt-0.5 text-[11px] text-zinc-500">{{ s.note }}</div>
          </div>
          <button class="btn-secondary shrink-0 !px-3 !py-1.5 text-xs" @click="send(s)">发送</button>
        </div>
      </div>

      <!-- 兜底 -->
      <div class="border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <div class="mb-2 text-xs text-zinc-500">
          若以上方式无效（切片软件未安装或来源被拒绝），可下载后手动拖入切片软件：
        </div>
        <div class="flex flex-wrap gap-2">
          <a class="btn-primary !px-3 !py-1.5 text-xs" :href="version?.downloadUrl">下载文件</a>
          <button class="btn-secondary !px-3 !py-1.5 text-xs" @click="copyLink">复制下载链接</button>
        </div>
      </div>

      <div v-if="version" class="text-[11px] text-zinc-400">
        将发送：v{{ version.versionNo }} · {{ version.originalFilename }} ·
        <span class="badge" :class="formatBadgeClass(version.format)">{{ FORMAT_LABELS[version.format] || version.format }}</span>
      </div>
    </div>
  </AppModal>
</template>
