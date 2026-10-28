<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useToastStore } from '@/stores/toast'

const theme = useThemeStore()
const toast = useToastStore()
const route = useRoute()

const navs = [
  { to: '/', label: '仪表盘', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { to: '/projects', label: '项目', icon: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' },
  { to: '/search', label: '搜索', icon: 'M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z' },
]

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  if (to === '/projects') return route.path.startsWith('/projects')
  return route.path.startsWith('/search')
}
</script>

<template>
  <div class="flex h-full">
    <!-- 桌面侧边栏 -->
    <aside class="hidden lg:flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div>
          <div class="text-base font-bold leading-tight">印库</div>
          <div class="text-[11px] text-zinc-500 dark:text-zinc-400">PrintVault · 3D 模型管理</div>
        </div>
      </div>
      <nav class="flex-1 space-y-1 px-3">
        <RouterLink
          v-for="n in navs"
          :key="n.to"
          :to="n.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          :class="isActive(n.to)
            ? 'bg-teal-600/10 text-teal-700 dark:text-teal-400'
            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5">
            <path :d="n.icon" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ n.label }}
        </RouterLink>
      </nav>
      <div class="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <button class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" @click="theme.toggle()">
          <svg v-if="!theme.isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5"><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {{ theme.isDark ? '浅色模式' : '深色模式' }}
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 移动端顶栏 -->
      <header class="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-900/90">
        <div class="flex items-center gap-2">
          <div class="flex h-7 w-7 items-center justify-center rounded-md bg-teal-600 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span class="font-bold">印库</span>
        </div>
        <button class="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="theme.toggle()">
          <svg v-if="!theme.isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5"><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0">
        <div class="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
          <RouterView />
        </div>
      </main>
    </div>

    <!-- 移动端底部导航 -->
    <nav class="fixed inset-x-0 bottom-0 z-30 flex border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-900/95">
      <RouterLink
        v-for="n in navs"
        :key="n.to"
        :to="n.to"
        class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
        :class="isActive(n.to) ? 'text-teal-600 dark:text-teal-400' : 'text-zinc-500 dark:text-zinc-400'"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-6 w-6">
          <path :d="n.icon" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        {{ n.label }}
      </RouterLink>
    </nav>

    <!-- Toast -->
    <div class="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="-translate-y-3 opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-for="t in toast.items"
          :key="t.id"
          class="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg"
          :class="{
            'bg-teal-600 text-white': t.kind === 'success',
            'bg-red-600 text-white': t.kind === 'error',
            'bg-zinc-800 text-white dark:bg-zinc-700': t.kind === 'info',
          }"
        >
          {{ t.message }}
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>
