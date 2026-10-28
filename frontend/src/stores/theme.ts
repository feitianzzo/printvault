import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(document.documentElement.classList.contains('dark'))

  function toggle(): void {
    isDark.value = !isDark.value
    document.documentElement.classList.toggle('dark', isDark.value)
    try {
      localStorage.setItem('pv-theme', isDark.value ? 'dark' : 'light')
    } catch {
      // 忽略存储失败
    }
  }

  return { isDark, toggle }
})
