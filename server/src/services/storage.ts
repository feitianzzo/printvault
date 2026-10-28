import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { DATA_DIR } from '../db.js'

/** 存储路径一律以 / 分隔、相对 DATA_DIR 保存，保证跨平台可移植 */
export const rel = (...parts: string[]): string => parts.join('/')

export const abs = (relPath: string): string => path.join(DATA_DIR, ...relPath.split('/'))

export const newUuid = (): string => randomUUID()

export function extOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim())
  return m ? m[1].toLowerCase() : ''
}

export function formatFromFilename(filename: string): string {
  const ext = extOf(filename)
  if (ext === 'stp') return 'step'
  if (['stl', '3mf', 'step', 'obj'].includes(ext)) return ext
  return ext || 'other'
}

export const PREVIEWABLE = new Set(['stl', '3mf', 'step', 'obj'])

export async function saveStreamTo(
  stream: Readable,
  relPath: string,
): Promise<{ size: number; sha256: string }> {
  const hash = createHash('sha256')
  let size = 0
  const dest = abs(relPath)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  stream.on('data', (chunk: Buffer) => {
    hash.update(chunk)
    size += chunk.length
  })
  await pipeline(stream, createWriteStream(dest))
  return { size, sha256: hash.digest('hex') }
}

export function writeBuffer(buf: Buffer, relPath: string): void {
  const dest = abs(relPath)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
}

export function deleteRel(relPath?: string | null): void {
  if (!relPath) return
  try {
    fs.rmSync(abs(relPath), { force: true })
  } catch {
    // 忽略文件清理失败
  }
}

export function deleteModelDir(modelId: number): void {
  try {
    fs.rmSync(path.join(DATA_DIR, 'models', String(modelId)), { recursive: true, force: true })
  } catch {
    // 忽略
  }
}

export function moveRel(fromRel: string, toRel: string): void {
  const from = abs(fromRel)
  const to = abs(toRel)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(from, to)
}

/** 删除模型相关数据：模型目录、各版本缩略图、模型及各版本备注（行 + 录音文件） */
export function deleteModelFiles(modelId: number): void {
  deleteModelDir(modelId)
  const versions = dbAll('SELECT id, thumbnail_path FROM model_versions WHERE model_id = ?', [modelId])
  const thumbPaths = versions.map((v) => v.thumbnail_path).filter(Boolean) as string[]
  for (const t of thumbPaths) deleteRel(t)
  // 被删缩略图若被项目封面引用，解除引用
  if (thumbPaths.length) {
    db.prepare(
      `UPDATE projects SET cover_path = NULL WHERE cover_path IN (${thumbPaths.map(() => '?').join(',')})`,
    ).run(...thumbPaths)
  }
  const notes = dbAll(
    `SELECT id, audio_path FROM notes
     WHERE (target_type = 'model' AND target_id = ?)
        OR (target_type = 'version' AND target_id IN (SELECT id FROM model_versions WHERE model_id = ?))`,
    [modelId, modelId],
  )
  for (const n of notes) deleteRel(n.audio_path)
  // notes 表对 models/model_versions 没有 FK 约束，必须显式清理，否则留下孤儿备注
  db.prepare(
    `DELETE FROM notes
     WHERE (target_type = 'model' AND target_id = @modelId)
        OR (target_type = 'version' AND target_id IN (SELECT id FROM model_versions WHERE model_id = @modelId))`,
  ).run({ modelId })
}

// 简单的内部查询封装，避免每个服务都依赖 better-sqlite3 实例
import { db } from '../db.js'
function dbAll(sql: string, params: unknown[] = []): any[] {
  return db.prepare(sql).all(...params) as any[]
}
