// 主线程侧的模型解析封装：Worker 调用 + BufferGeometry 构建
import * as THREE from 'three'

export interface ModelStats {
  triangles: number
  min: [number, number, number]
  max: [number, number, number]
  volume: number
}

export interface ParsedModel {
  positions: Float32Array
  normals: Float32Array | null
  stats: ModelStats
}

type Pending = {
  resolve: (p: ParsedModel) => void
  reject: (e: Error) => void
}

let worker: Worker | null = null
let seq = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/parser.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean } & Partial<ParsedModel> & { error?: string }>) => {
      const { id, ok, error, positions, normals, stats } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      if (ok && positions && stats) p.resolve({ positions, normals: normals ?? null, stats })
      else p.reject(new Error(error || '解析失败'))
    }
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || '解析 Worker 崩溃'))
      pending.clear()
    }
  }
  return worker
}

export function parseModelFile(buffer: ArrayBuffer, format: string): Promise<ParsedModel> {
  return new Promise((resolve, reject) => {
    const id = seq++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, buffer, format }, [buffer])
  })
}

/** 由解析结果构建居中的 BufferGeometry（尺寸信息保留在 stats 中） */
export function buildGeometry(parsed: ParsedModel): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3))
  if (parsed.normals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(parsed.normals, 3))
  } else {
    geometry.computeVertexNormals()
  }
  geometry.computeBoundingBox()
  if (geometry.boundingBox) {
    const center = geometry.boundingBox.getCenter(new THREE.Vector3())
    geometry.translate(-center.x, -center.y, -center.z)
  }
  return geometry
}

export function statsDims(stats: ModelStats): { x: number; y: number; z: number } {
  return {
    x: stats.max[0] - stats.min[0],
    y: stats.max[1] - stats.min[1],
    z: stats.max[2] - stats.min[2],
  }
}
