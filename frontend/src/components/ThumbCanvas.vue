<script setup lang="ts">
// 模型缩略图：优先用服务端缩略图；缺失时进入视口后懒加载并渲染
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchFileWithProgress } from '@/api/client'
import type { VersionDTO } from '@/api/types'
import { buildGeometry, parseModelFile } from '@/utils/modelFile'
import { renderThumbnail } from '@/utils/thumbnail'
import { PREVIEWABLE_FORMATS } from '@/utils/format'

const props = defineProps<{ version: VersionDTO | null }>()

const src = ref<string>('')
const loading = ref(false)
const failed = ref(false)
const root = ref<HTMLElement>()
// 服务端缩略图 404 时回退到本地懒渲染，只尝试一次
const triedFallback = ref(false)

function onImgError(): void {
  if (triedFallback.value) {
    src.value = ''
    failed.value = true
    return
  }
  triedFallback.value = true
  src.value = ''
  const v = props.version
  if (v && PREVIEWABLE_FORMATS.has(v.format)) void lazyRender(v)
  else failed.value = true
}

const memCache = new Map<number, string>()
// 缓存上限：超出后释放最早的条目，避免长时间浏览累积大量 object URL
const MEM_CACHE_MAX = 50
let observer: IntersectionObserver | null = null
let token = 0

function cachePut(versionId: number, url: string): void {
  if (memCache.size >= MEM_CACHE_MAX) {
    const oldest = memCache.keys().next().value
    if (oldest !== undefined) {
      const old = memCache.get(oldest)
      if (old) URL.revokeObjectURL(old)
      memCache.delete(oldest)
    }
  }
  memCache.set(versionId, url)
}

async function lazyRender(version: VersionDTO): Promise<void> {
  const my = ++token
  loading.value = true
  failed.value = false
  try {
    const cached = memCache.get(version.id)
    if (cached) {
      src.value = cached
      return
    }
    const buffer = await fetchFileWithProgress(version.fileUrl)
    if (my !== token) return
    const parsed = await parseModelFile(buffer, version.format)
    if (my !== token) return
    const geometry = buildGeometry(parsed)
    const blob = await renderThumbnail(geometry)
    geometry.dispose()
    if (my !== token) return
    if (blob) {
      const url = URL.createObjectURL(blob)
      cachePut(version.id, url)
      src.value = url
    } else {
      failed.value = true
    }
  } catch {
    if (my === token) failed.value = true
  } finally {
    if (my === token) loading.value = false
  }
}

function setup(): void {
  src.value = ''
  failed.value = false
  triedFallback.value = false
  observer?.disconnect()
  if (!props.version) return
  if (props.version.thumbnailUrl) {
    src.value = props.version.thumbnailUrl
    return
  }
  if (!PREVIEWABLE_FORMATS.has(props.version.format)) {
    failed.value = true
    return
  }
  // 无服务端缩略图：等进入视口再解析渲染
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer?.disconnect()
        observer = null
        const v = props.version
        if (v) void lazyRender(v)
      }
    },
    { rootMargin: '200px' },
  )
  observer.observe(root.value!)
}

watch(() => props.version?.id, () => setup())
onMounted(setup)
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="root" class="relative h-full w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
    <img v-if="src" :src="src" class="h-full w-full object-cover" alt="" loading="lazy" @error="onImgError" />
    <div v-else class="flex h-full w-full items-center justify-center">
      <div v-if="loading" class="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
      <svg v-else-if="failed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" class="h-10 w-10 text-zinc-300 dark:text-zinc-600">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div v-else class="h-6 w-6 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
  </div>
</template>
