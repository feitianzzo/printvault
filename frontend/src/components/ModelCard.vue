<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { ModelListItemDTO } from '@/api/types'
import ThumbCanvas from './ThumbCanvas.vue'
import { formatBadgeClass, FORMAT_LABELS, formatDims, formatDate } from '@/utils/format'

const props = defineProps<{ model: ModelListItemDTO }>()
const router = useRouter()

function open(): void {
  void router.push(`/model/${props.model.id}`)
}
</script>

<template>
  <div
    class="card group cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg"
    @click="open"
  >
    <div class="aspect-[4/3] w-full">
      <ThumbCanvas :version="model.current" />
    </div>
    <div class="space-y-1.5 p-3.5">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1 truncate font-medium" :title="model.name">{{ model.name }}</div>
        <span v-if="model.current" class="badge shrink-0" :class="formatBadgeClass(model.current.format)">
          {{ FORMAT_LABELS[model.current.format] || model.current.format }}
        </span>
      </div>
      <div v-if="model.current" class="truncate text-xs text-zinc-500 dark:text-zinc-400">
        {{ formatDims(model.current.dims) }}
      </div>
      <div class="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
        <span>{{ model.versionCount }} 个版本</span>
        <span>{{ formatDate(model.updatedAt) }}</span>
      </div>
      <div v-if="model.tags.length" class="flex flex-wrap gap-1 pt-0.5">
        <span
          v-for="t in model.tags.slice(0, 3)"
          :key="t"
          class="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        >{{ t }}</span>
      </div>
    </div>
  </div>
</template>
