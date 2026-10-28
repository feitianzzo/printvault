<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

const props = defineProps<{ open: boolean; title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()

// 弹窗打开时锁定背景滚动（移动端抽屉体验）
watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  },
)
onBeforeUnmount(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="emit('close')" />
      <div
        class="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl dark:bg-zinc-900"
        :class="wide ? 'sm:max-w-2xl' : ''"
      >
        <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h3 class="text-base font-semibold">{{ title }}</h3>
          <button class="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800" @click="emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
