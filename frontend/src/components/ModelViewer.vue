<script setup lang="ts">
// 3D 查看器：加载当前版本文件 → Worker 解析 → three.js 渲染
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchFileWithProgress } from '@/api/client'
import type { VersionDTO } from '@/api/types'
import { buildGeometry, parseModelFile, statsDims, type ModelStats } from '@/utils/modelFile'
import { formatBytes, formatCount, formatDims, formatVolume, PREVIEWABLE_FORMATS } from '@/utils/format'

const props = defineProps<{ version: VersionDTO }>()

const container = ref<HTMLElement>()
const loading = ref(false)
const progress = ref(0)
const error = ref('')
const stats = ref<ModelStats | null>(null)
const wireframe = ref(false)
const autoRotate = ref(false)
const showGrid = ref(true)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let mesh: THREE.Mesh | null = null
let grid: THREE.GridHelper | null = null
let raf = 0
let resizeObserver: ResizeObserver | null = null

const previewable = () => PREVIEWABLE_FORMATS.has(props.version.format)

function initThree(): void {
  const el = container.value!
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100000)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)
  renderer.domElement.style.touchAction = 'none'

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4356, 1.5))
  const key = new THREE.DirectionalLight(0xffffff, 1.7)
  key.position.set(4, 7, 5)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6)
  fill.position.set(-5, -3, -4)
  scene.add(fill)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.autoRotateSpeed = 2.2

  const loop = (): void => {
    raf = requestAnimationFrame(loop)
    controls.update()
    renderer!.render(scene, camera)
  }
  loop()

  resizeObserver = new ResizeObserver(() => {
    const w = el.clientWidth
    const h = el.clientHeight
    if (w === 0 || h === 0) return
    renderer!.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  })
  resizeObserver.observe(el)
}

function fitView(): void {
  if (!mesh) return
  mesh.geometry.computeBoundingSphere()
  const radius = Math.max(mesh.geometry.boundingSphere?.radius ?? 1, 1e-3)
  const dist = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.25
  camera.position.set(dist * 0.6, dist * 0.5, dist * 0.7)
  controls.target.set(0, 0, 0)
  camera.near = dist / 1000
  camera.far = dist * 1000
  camera.updateProjectionMatrix()
  controls.update()
}

function disposeModel(): void {
  if (mesh) {
    scene.remove(mesh)
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
    mesh = null
  }
  if (grid) {
    scene.remove(grid)
    grid.geometry.dispose()
    ;(grid.material as THREE.Material).dispose()
    grid = null
  }
  stats.value = null
}

let loadSeq = 0

async function load(): Promise<void> {
  const seq = ++loadSeq
  disposeModel()
  error.value = ''
  if (!previewable()) return
  loading.value = true
  progress.value = 0
  try {
    const buffer = await fetchFileWithProgress(props.version.fileUrl, (l, t) => {
      if (seq === loadSeq) progress.value = t > 0 ? Math.round((l / t) * 100) : 0
    })
    if (seq !== loadSeq) return // 已切到其他版本，丢弃本次结果
    const parsed = await parseModelFile(buffer, props.version.format)
    if (seq !== loadSeq) return
    const geometry = buildGeometry(parsed)
    stats.value = parsed.stats

    const material = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      metalness: 0.15,
      roughness: 0.55,
      side: THREE.DoubleSide,
      wireframe: wireframe.value,
    })
    mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    // 地面网格：贴合模型底面
    const dims = statsDims(parsed.stats)
    const span = Math.max(dims.x, dims.y, dims.z)
    grid = new THREE.GridHelper(span * 1.6, 16, 0x9ca3af, 0x4b5563)
    ;(grid.material as THREE.Material).opacity = 0.35
    ;(grid.material as THREE.Material).transparent = true
    grid.position.y = -dims.y / 2 - span * 0.005
    grid.visible = showGrid.value
    scene.add(grid)

    fitView()
  } catch (err) {
    if (seq === loadSeq) error.value = (err as Error).message || '加载失败'
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

function screenshot(): void {
  if (!renderer) return
  renderer.render(scene, camera)
  renderer.domElement.toBlob((blob) => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${props.version.originalFilename.replace(/\.[^.]+$/, '')}-v${props.version.versionNo}.png`
    a.click()
    URL.revokeObjectURL(a.href)
  }, 'image/png')
}

watch(wireframe, (v) => {
  if (mesh) (mesh.material as THREE.MeshStandardMaterial).wireframe = v
})
watch(autoRotate, (v) => {
  if (controls) controls.autoRotate = v
})
watch(showGrid, (v) => {
  if (grid) grid.visible = v
})
watch(() => props.version.id, load)

onMounted(() => {
  initThree()
  load()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  resizeObserver?.disconnect()
  controls?.dispose()
  disposeModel()
  renderer?.dispose()
  renderer?.domElement.remove()
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden rounded-xl bg-gradient-to-b from-slate-100 to-slate-200 dark:from-zinc-900 dark:to-zinc-950">
    <div ref="container" class="h-full w-full" />

    <!-- 加载中 -->
    <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-100/80 backdrop-blur-sm dark:bg-zinc-900/80">
      <div class="h-8 w-8 animate-spin rounded-full border-[3px] border-teal-500 border-t-transparent" />
      <div class="text-sm text-zinc-500">
        {{ progress > 0 ? `下载中 ${progress}%` : '解析模型中…' }}
      </div>
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-10 w-10 text-red-400"><path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div class="text-sm text-red-500">{{ error }}</div>
      <button class="btn-secondary mt-1" @click="load">重试</button>
    </div>

    <!-- 不支持预览 -->
    <div v-else-if="!previewable()" class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-10 w-10 text-zinc-400"><path d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div class="text-sm text-zinc-500">该格式（{{ version.format.toUpperCase() }}）暂不支持在线预览</div>
      <a class="btn-primary mt-1" :href="version.downloadUrl">下载文件</a>
    </div>

    <!-- 工具条 -->
    <div v-if="previewable() && !loading" class="absolute right-3 top-3 flex flex-col gap-1.5">
      <button
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 shadow-sm backdrop-blur transition-colors hover:bg-white dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
        :class="{ 'text-teal-600 dark:text-teal-400': wireframe }"
        title="线框模式"
        @click="wireframe = !wireframe"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 shadow-sm backdrop-blur transition-colors hover:bg-white dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
        :class="{ 'text-teal-600 dark:text-teal-400': autoRotate }"
        title="自动旋转"
        @click="autoRotate = !autoRotate"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5"><path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 shadow-sm backdrop-blur transition-colors hover:bg-white dark:bg-zinc-800/90 dark:hover:bg-zinc-800"
        :class="{ 'text-teal-600 dark:text-teal-400': showGrid }"
        title="地面网格"
        @click="showGrid = !showGrid"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5"><path d="M3 15l9-6 9 6M3 19l9-6 9 6M3 11l9-6 9 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 shadow-sm backdrop-blur transition-colors hover:bg-white dark:bg-zinc-800/90 dark:hover:bg-zinc-800" title="复位视角" @click="fitView">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5"><path d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 shadow-sm backdrop-blur transition-colors hover:bg-white dark:bg-zinc-800/90 dark:hover:bg-zinc-800" title="截图" @click="screenshot">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5"><path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>

    <!-- 信息浮层 -->
    <div v-if="stats && !loading" class="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5">
      <span class="rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
        {{ formatDims(statsDims(stats)) }}
      </span>
      <span class="rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
        {{ formatCount(stats.triangles) }} 三角形
      </span>
      <span class="rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
        体积 {{ formatVolume(stats.volume) }}
      </span>
      <span class="hidden rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur sm:inline">
        {{ formatBytes(version.sizeBytes) }}
      </span>
    </div>
  </div>
</template>
