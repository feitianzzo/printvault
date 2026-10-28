/// <reference lib="webworker" />
// 模型解析 Worker：STL/OBJ/3MF/STEP → 合并后的三角网格 + 统计信息
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import occtimportjs from 'occt-import-js'
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url'

export interface WorkerStats {
  triangles: number
  min: [number, number, number]
  max: [number, number, number]
  volume: number
}

let occtPromise: Promise<import('occt-import-js').OcctModule> | null = null

function getOcct(): Promise<import('occt-import-js').OcctModule> {
  occtPromise ??= occtimportjs({ locateFile: () => wasmUrl })
  return occtPromise
}

function collectGeometries(root: THREE.Object3D): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = []
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if ((mesh as unknown as { isMesh?: boolean }).isMesh && mesh.geometry) {
      const g = mesh.geometry.clone()
      g.applyMatrix4(mesh.matrixWorld)
      geos.push(g)
    }
  })
  return geos
}

interface TriSink {
  positions: Float32Array
  normals: Float32Array | null
  offset: number
  volume: number
  min: [number, number, number]
  max: [number, number, number]
}

function writeTriangle(sink: TriSink, tri: Float32Array | number[], normals: Float32Array | null, nOffset: number): void {
  const p = sink.positions
  let o = sink.offset
  for (let i = 0; i < 9; i++) p[o + i] = tri[i]
  o += 9
  sink.offset = o

  // 包围盒
  for (let v = 0; v < 3; v++) {
    for (let c = 0; c < 3; c++) {
      const val = tri[v * 3 + c]
      if (val < sink.min[c]) sink.min[c] = val
      if (val > sink.max[c]) sink.max[c] = val
    }
  }

  // 有符号体积（四面体法）
  const [ax, ay, az] = [tri[0], tri[1], tri[2]]
  const [bx, by, bz] = [tri[3], tri[4], tri[5]]
  const [cx, cy, cz] = [tri[6], tri[7], tri[8]]
  sink.volume +=
    (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6

  if (sink.normals && normals) {
    sink.normals.set(normals.subarray(nOffset, nOffset + 9), o - 9)
  } else if (sink.normals) {
    // 平面法线（叉积）
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    const n = sink.normals
    const no = o - 9
    for (let v = 0; v < 3; v++) {
      n[no + v * 3] = nx
      n[no + v * 3 + 1] = ny
      n[no + v * 3 + 2] = nz
    }
  }
}

function mergeGeometries(geos: THREE.BufferGeometry[]): {
  positions: Float32Array
  normals: Float32Array | null
  stats: WorkerStats
} {
  const indexed: { g: THREE.BufferGeometry; triCount: number }[] = []
  let totalTris = 0
  let allHaveNormals = geos.length > 0
  for (const g of geos) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) continue
    const idx = g.getIndex()
    const triCount = idx ? idx.count / 3 : pos.count / 3
    totalTris += triCount
    if (!g.getAttribute('normal')) allHaveNormals = false
    indexed.push({ g, triCount })
  }

  const hasNormals = allHaveNormals
  const sink: TriSink = {
    positions: new Float32Array(totalTris * 9),
    normals: hasNormals ? new Float32Array(totalTris * 9) : null,
    offset: 0,
    volume: 0,
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  }

  const tri = new Float32Array(9)
  const nrm = new Float32Array(9)
  for (const { g } of indexed) {
    const posAttr = g.getAttribute('position') as THREE.BufferAttribute
    const pos = posAttr.array as ArrayLike<number>
    const posCount = posAttr.count
    const nAttr = g.getAttribute('normal') as THREE.BufferAttribute | undefined
    const nArr = nAttr ? (nAttr.array as ArrayLike<number>) : null
    const idx = g.getIndex()
    if (idx) {
      const ia = idx.array as ArrayLike<number>
      for (let t = 0; t < idx.count; t += 3) {
        for (let v = 0; v < 3; v++) {
          const vi = ia[t + v]
          for (let c = 0; c < 3; c++) {
            tri[v * 3 + c] = pos[vi * 3 + c]
            nrm[v * 3 + c] = nArr ? nArr[vi * 3 + c] : 0
          }
        }
        writeTriangle(sink, tri, sink.normals ? nrm : null, 0)
      }
    } else {
      for (let t = 0; t < posCount / 3; t++) {
        for (let i = 0; i < 9; i++) {
          tri[i] = pos[t * 9 + i]
          nrm[i] = nArr ? nArr[t * 9 + i] : 0
        }
        writeTriangle(sink, tri, sink.normals ? nrm : null, 0)
      }
    }
  }

  const stats: WorkerStats = {
    triangles: totalTris,
    min: Number.isFinite(sink.min[0]) ? sink.min : [0, 0, 0],
    max: Number.isFinite(sink.max[0]) ? sink.max : [0, 0, 0],
    volume: Math.abs(sink.volume),
  }
  return { positions: sink.positions, normals: sink.normals, stats }
}

async function parseStep(buffer: ArrayBuffer): Promise<THREE.BufferGeometry[]> {
  const occt = await getOcct()
  const result = occt.ReadStepFile(new Uint8Array(buffer), null)
  if (!result || !result.success || !result.meshes?.length) {
    throw new Error('STEP 文件解析失败')
  }
  const geos: THREE.BufferGeometry[] = []
  for (const mesh of result.meshes) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3))
    if (mesh.attributes.normal) {
      g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3))
    }
    if (mesh.index) {
      g.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1))
    }
    geos.push(g)
  }
  return geos
}

async function parse(buffer: ArrayBuffer, format: string): Promise<{
  positions: Float32Array
  normals: Float32Array | null
  stats: WorkerStats
}> {
  let geos: THREE.BufferGeometry[]
  switch (format) {
    case 'stl':
      geos = [new STLLoader().parse(buffer)]
      break
    case 'obj': {
      const group = new OBJLoader().parse(new TextDecoder().decode(buffer))
      geos = collectGeometries(group)
      break
    }
    case '3mf': {
      const group = new ThreeMFLoader().parse(buffer)
      geos = collectGeometries(group)
      break
    }
    case 'step':
      geos = await parseStep(buffer)
      break
    default:
      throw new Error(`不支持的格式: ${format}`)
  }
  if (!geos.length) throw new Error('文件中没有网格数据')
  return mergeGeometries(geos)
}

self.onmessage = async (e: MessageEvent<{ id: number; buffer: ArrayBuffer; format: string }>) => {
  const { id, buffer, format } = e.data
  try {
    const out = await parse(buffer, format)
    const transfers: Transferable[] = [out.positions.buffer as ArrayBuffer]
    if (out.normals) transfers.push(out.normals.buffer as ArrayBuffer)
    ;(self as unknown as Worker).postMessage({ id, ok: true, ...out }, transfers)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, error: String((err as Error)?.message || err) })
  }
}
