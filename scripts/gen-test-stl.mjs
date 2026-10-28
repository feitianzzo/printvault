// 生成用于测试的二进制 STL 立方体（边长 size，单位 mm）
import fs from 'node:fs'
import path from 'node:path'

const size = Number(process.argv[2] || 20)
const out = process.argv[3] || 'test-files/cube.stl'
const s = size / 2

// 立方体 6 个面 × 2 三角形
const faces = [
  [[0,1,2],[0,2,3]], // +Z 顶面（顶点顺序保证法线朝外）
]
const v = [
  [-s,-s, s], [ s,-s, s], [ s, s, s], [-s, s, s], // 顶 0-3
  [-s,-s,-s], [ s,-s,-s], [ s, s,-s], [-s, s,-s], // 底 4-7
]
const tris = [
  [0,1,2],[0,2,3],       // +Z
  [4,6,5],[4,7,6],       // -Z
  [0,4,5],[0,5,1],       // -Y
  [2,6,7],[2,7,3],       // +Y
  [1,5,6],[1,6,2],       // +X
  [0,3,7],[0,7,4],       // -X
]

function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]] }
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]] }
function norm(a) { const l = Math.hypot(...a) || 1; return [a[0]/l, a[1]/l, a[2]/l] }

const buf = Buffer.alloc(84 + tris.length * 50)
buf.write('PrintVault test cube', 0, 80, 'ascii')
buf.writeUInt32LE(tris.length, 80)
let off = 84
for (const [ia, ib, ic] of tris) {
  const a = v[ia], b = v[ib], c = v[ic]
  const n = norm(cross(sub(b, a), sub(c, a)))
  for (const comp of n) buf.writeFloatLE(comp, off), off += 4
  for (const p of [a, b, c]) for (const comp of p) buf.writeFloatLE(comp, off), off += 4
  buf.writeUInt16LE(0, off); off += 2
}

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, buf)
console.log(`已生成 ${out}: ${tris.length} 三角形, 边长 ${size}mm, ${buf.length} 字节`)
