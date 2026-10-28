import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

let nextId = 1

export const useToastStore = defineStore('toast', () => {
  const items = ref<Toast[]>([])

  function push(kind: Toast['kind'], message: string, duration = 3000): void {
    const id = nextId++
    items.value.push({ id, kind, message })
    setTimeout(() => dismiss(id), duration)
  }

  function dismiss(id: number): void {
    items.value = items.value.filter((t) => t.id !== id)
  }

  return { items, push, dismiss }
})
