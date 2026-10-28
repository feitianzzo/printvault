// Node 端验证 occt-import-js STEP 解析（与浏览器 worker 相同的调用方式）
import { createRequire } from 'node:module'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const occtimportjs = require('occt-import-js')

const file = process.argv[2]
const occt = await occtimportjs()
const buf = fs.readFileSync(file)
const result = occt.ReadStepFile(new Uint8Array(buf), null)
if (!result || !result.success) {
  console.error('解析失败')
  process.exit(1)
}
for (const mesh of result.meshes) {
  const pos = mesh.attributes.position.array
  console.log(`mesh=${mesh.name} positions=${pos.length / 3} index=${mesh.index ? mesh.index.array.length : 0} normal=${!!mesh.attributes.normal}`)
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i])
    minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1])
    minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2])
  }
  console.log(`bbox=(${(maxX - minX).toFixed(2)}, ${(maxY - minY).toFixed(2)}, ${(maxZ - minZ).toFixed(2)})`)
}
