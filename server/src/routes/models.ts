import fs from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { db } from '../db.js'
import { httpError, modelDetail, rowToModel, rowToVersion } from '../serialize.js'
import {
  PREVIEWABLE,
  deleteModelFiles,
  deleteRel,
  extOf,
  formatFromFilename,
  moveRel,
  newUuid,
  rel,
  abs,
  saveStreamTo,
  writeBuffer,
} from '../services/storage.js'
import type { UploadMeta } from '../types.js'

const VERSION_COLUMNS = `
  cv.id AS v_id, cv.version_no AS v_version_no, cv.version_label AS v_version_label,
  cv.format AS v_format, cv.original_filename AS v_original_filename, cv.size_bytes AS v_size_bytes,
  cv.sha256 AS v_sha256, cv.triangle_count AS v_triangle_count,
  cv.dim_x AS v_dim_x, cv.dim_y AS v_dim_y, cv.dim_z AS v_dim_z, cv.volume_mm3 AS v_volume_mm3,
  cv.thumbnail_path AS v_thumbnail_path, cv.file_path AS v_file_path, cv.created_at AS v_created_at`

/** 把 v_* 前缀的行还原为 version 行结构，复用 rowToVersion */
function splitRow(row: any): { model: any; current: any | null } {
  const { v_id, v_version_no, v_version_label, v_format, v_original_filename, v_size_bytes,
    v_sha256, v_triangle_count, v_dim_x, v_dim_y, v_dim_z, v_volume_mm3, v_thumbnail_path,
    v_file_path, v_created_at, version_count, ...model } = row
  const current = v_id != null
    ? { id: v_id, model_id: model.id, version_no: v_version_no, version_label: v_version_label,
        format: v_format, original_filename: v_original_filename, size_bytes: v_size_bytes,
        sha256: v_sha256, triangle_count: v_triangle_count, dim_x: v_dim_x, dim_y: v_dim_y,
        dim_z: v_dim_z, volume_mm3: v_volume_mm3, thumbnail_path: v_thumbnail_path,
        file_path: v_file_path, created_at: v_created_at }
    : null
  return { model: { ...model, version_count: version_count ?? 0 }, current }
}

export default async function modelRoutes(app: FastifyInstance): Promise<void> {
  // 项目内模型列表（搜索/标签/格式筛选 + 排序）
  app.get('/api/projects/:id/models', async (req) => {
    const { id } = req.params as { id: string }
    const q = req.query as Record<string, string | undefined>
    const where: string[] = ['m.project_id = @projectId']
    const params: Record<string, unknown> = { projectId: Number(id) }

    if (q.search?.trim()) {
      params.search = `%${q.search.trim()}%`
      where.push(`(m.name LIKE @search OR m.description LIKE @search OR m.tags LIKE @search
        OR EXISTS (SELECT 1 FROM notes n WHERE n.content LIKE @search AND (
          (n.target_type = 'model' AND n.target_id = m.id) OR
          (n.target_type = 'version' AND n.target_id IN (SELECT id FROM model_versions WHERE model_id = m.id))
        )))`)
    }
    if (q.tag?.trim()) {
      params.tag = q.tag.trim()
      where.push('EXISTS (SELECT 1 FROM json_each(m.tags) je WHERE je.value = @tag)')
    }
    if (q.format?.trim()) {
      params.format = q.format.trim()
      where.push('cv.format = @format')
    }

    const orderBy =
      ({
        updated_desc: 'm.updated_at DESC',
        updated_asc: 'm.updated_at ASC',
        name_asc: 'm.name COLLATE NOCASE ASC',
        name_desc: 'm.name COLLATE NOCASE DESC',
      } as Record<string, string>)[q.sort || 'updated_desc'] || 'm.updated_at DESC'

    const limit = Math.min(Number(q.limit) || 200, 500)
    const offset = Number(q.offset) || 0

    const rows = db.prepare(`
      SELECT m.*, (SELECT COUNT(*) FROM model_versions vc WHERE vc.model_id = m.id) AS version_count,
        ${VERSION_COLUMNS}
      FROM models m
      LEFT JOIN model_versions cv ON cv.id = m.current_version_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset }) as any[]

    return {
      models: rows.map((r) => {
        const { model, current } = splitRow(r)
        return rowToModel(model, current, model.version_count)
      }),
    }
  })

  // 上传：multipart，创建新模型（无 modelId）或为已有模型新增版本
  app.post('/api/models', async (req, reply) => {
    const fields: Record<string, string> = {}
    let thumbBuf: Buffer | null = null
    let thumbExt = 'webp'
    let tmpRel: string | null = null
    let uploaded: { originalName: string; ext: string; format: string; size: number; sha256: string } | null = null

    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          if (part.fieldname === 'thumbnail') {
            // 缩略图上限 8MB：模型文件需要大上限，故此处手动流式截断而非复用全局限制
            const MAX_THUMB = 8 * 1024 * 1024
            const buf = await new Promise<Buffer>((resolve) => {
              const chunks: Buffer[] = []
              let size = 0
              part.file.on('data', (c: Buffer) => {
                if (size > MAX_THUMB) return
                size += c.length
                if (size > MAX_THUMB) {
                  chunks.length = 0
                  return
                }
                chunks.push(c)
              })
              part.file.on('end', () => resolve(size > MAX_THUMB ? Buffer.alloc(0) : Buffer.concat(chunks)))
              part.file.on('error', () => resolve(Buffer.alloc(0)))
            })
            if (buf.length > 0) {
              thumbBuf = buf
              thumbExt = part.mimetype.includes('png') ? 'png' : 'webp'
            }
          } else if (part.fieldname === 'file') {
            if (uploaded) throw httpError(400, '一次只能上传一个模型文件')
            const originalName = part.filename || 'model'
            const ext = extOf(originalName) || 'bin'
            const format = formatFromFilename(originalName)
            tmpRel = rel('tmp', `${newUuid()}.${ext}`)
            const { size, sha256 } = await saveStreamTo(part.file, tmpRel)
            uploaded = { originalName, ext, format, size, sha256 }
          }
        } else {
          fields[part.fieldname] = String(part.value)
        }
      }

      if (!uploaded || !tmpRel) throw httpError(400, '缺少模型文件')
      const projectId = Number(fields.projectId)
      if (!projectId) throw httpError(400, '缺少 projectId')
      const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
      if (!project) throw httpError(404, '目标项目不存在')

      let meta: UploadMeta = {}
      try {
        meta = JSON.parse(fields.meta || '{}') as UploadMeta
      } catch {
        meta = {}
      }

      let modelId = Number(fields.modelId) || 0
      const modelName = (fields.name || '').trim() || uploaded.originalName.replace(/\.[^.]+$/, '')

      const finalize = db.transaction((): number => {
        if (modelId) {
          const model = db
            .prepare('SELECT id FROM models WHERE id = ? AND project_id = ?')
            .get(modelId, projectId)
          if (!model) throw httpError(404, '目标模型不存在')
        } else {
          const r = db
            .prepare('INSERT INTO models (project_id, name) VALUES (?, ?)')
            .run(projectId, modelName)
          modelId = Number(r.lastInsertRowid)
        }

        const nextNo = (
          db
            .prepare('SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM model_versions WHERE model_id = ?')
            .get(modelId) as any
        ).n
        const versionUuid = newUuid()
        const finalRel = rel('models', String(modelId), `${versionUuid}.${uploaded!.ext}`)
        moveRel(tmpRel!, finalRel)
        tmpRel = null

        const r = db.prepare(`
          INSERT INTO model_versions
            (model_id, version_no, version_label, file_path, format, original_filename, size_bytes, sha256,
             triangle_count, dim_x, dim_y, dim_z, volume_mm3)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          modelId, nextNo, (fields.versionLabel || '').trim(), finalRel, uploaded!.format,
          uploaded!.originalName, uploaded!.size, uploaded!.sha256,
          meta.triangles ?? null, meta.dimX ?? null, meta.dimY ?? null, meta.dimZ ?? null,
          meta.volume ?? null,
        )
        const versionId = Number(r.lastInsertRowid)

        if (thumbBuf) {
          const tRel = rel('thumbs', `v${versionId}.${thumbExt}`)
          writeBuffer(thumbBuf, tRel)
          db.prepare('UPDATE model_versions SET thumbnail_path = ? WHERE id = ?').run(tRel, versionId)
          // 项目还没有封面时，自动用这个缩略图作为封面
          db.prepare('UPDATE projects SET cover_path = COALESCE(cover_path, ?) WHERE id = ?').run(tRel, projectId)
        }

        db.prepare(`UPDATE models SET current_version_id = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
          .run(versionId, modelId)
        db.prepare(`UPDATE projects SET updated_at = datetime('now','localtime') WHERE id = ?`).run(projectId)
        return versionId
      })

      const versionId = finalize()

      const dup = db.prepare(`
        SELECT m.name AS model_name FROM model_versions v JOIN models m ON m.id = v.model_id
        WHERE v.sha256 = ? AND v.id <> ? AND v.sha256 <> '' LIMIT 1`).get(uploaded.sha256, versionId) as any
      const warning = dup ? `提示：相同内容的文件已存在于模型「${dup.model_name}」` : undefined

      reply.code(201)
      return {
        modelId,
        versionId,
        previewable: PREVIEWABLE.has(uploaded.format),
        warning,
      }
    } catch (err) {
      if (tmpRel) deleteRel(tmpRel)
      throw err
    }
  })

  // 模型详情（含全部版本与备注）
  app.get('/api/models/:id', async (req) => {
    const { id } = req.params as { id: string }
    const model = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as any
    if (!model) throw httpError(404, '模型不存在')
    const versions = db
      .prepare('SELECT * FROM model_versions WHERE model_id = ? ORDER BY version_no DESC')
      .all(id) as any[]
    const notes = db.prepare(`
      SELECT n.*, v.version_no FROM notes n
      LEFT JOIN model_versions v ON n.target_type = 'version' AND v.id = n.target_id
      WHERE (n.target_type = 'model' AND n.target_id = @id)
         OR (n.target_type = 'version' AND n.target_id IN (SELECT id FROM model_versions WHERE model_id = @id))
      ORDER BY n.created_at DESC, n.id DESC`).all({ id: Number(id) }) as any[]
    return { model: modelDetail(model, versions, notes) }
  })

  app.patch('/api/models/:id', async (req) => {
    const { id } = req.params as { id: string }
    const model = db.prepare('SELECT id FROM models WHERE id = ?').get(id)
    if (!model) throw httpError(404, '模型不存在')
    const body = (req.body || {}) as { name?: string; description?: string; tags?: string[] }
    const sets: string[] = []
    const params: unknown[] = []
    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) throw httpError(400, '模型名称不能为空')
      sets.push('name = ?')
      params.push(name)
    }
    if (body.description !== undefined) {
      sets.push('description = ?')
      params.push(body.description)
    }
    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags)) throw httpError(400, 'tags 必须为字符串数组')
      sets.push('tags = ?')
      params.push(JSON.stringify(body.tags.map((t) => String(t).trim()).filter(Boolean)))
    }
    if (sets.length > 0) {
      sets.push(`updated_at = datetime('now','localtime')`)
      params.push(id)
      db.prepare(`UPDATE models SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
    const updated = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as any
    const versions = db
      .prepare('SELECT * FROM model_versions WHERE model_id = ? ORDER BY version_no DESC')
      .all(id) as any[]
    return { model: rowToModel(updated, versions.find((v) => v.id === updated.current_version_id), versions.length) }
  })

  app.delete('/api/models/:id', async (req) => {
    const { id } = req.params as { id: string }
    const model = db.prepare('SELECT id FROM models WHERE id = ?').get(id)
    if (!model) throw httpError(404, '模型不存在')
    deleteModelFiles(Number(id))
    db.prepare('DELETE FROM models WHERE id = ?').run(id)
    return { ok: true }
  })

  // 回滚：将历史版本设为当前版本
  app.post('/api/models/:id/versions/:vid/rollback', async (req) => {
    const { id, vid } = req.params as { id: string; vid: string }
    const version = db
      .prepare('SELECT id FROM model_versions WHERE id = ? AND model_id = ?')
      .get(vid, id)
    if (!version) throw httpError(404, '版本不存在')
    db.prepare(`UPDATE models SET current_version_id = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(Number(vid), Number(id))
    return { ok: true, currentVersionId: Number(vid) }
  })

  // 删除单个版本（不允许删除当前版本或唯一版本）
  app.delete('/api/models/:id/versions/:vid', async (req) => {
    const { id, vid } = req.params as { id: string; vid: string }
    const model = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as any
    if (!model) throw httpError(404, '模型不存在')
    const version = db
      .prepare('SELECT * FROM model_versions WHERE id = ? AND model_id = ?')
      .get(vid, id) as any
    if (!version) throw httpError(404, '版本不存在')
    if (model.current_version_id === version.id) throw httpError(400, '不能删除当前版本，请先回滚到其他版本')
    const count = (db
      .prepare('SELECT COUNT(*) AS c FROM model_versions WHERE model_id = ?')
      .get(id) as any).c
    if (count <= 1) throw httpError(400, '模型至少需要保留一个版本')
    deleteRel(version.file_path)
    deleteRel(version.thumbnail_path)
    // 该版本的缩略图若被项目封面引用，先解除引用再删文件
    db.prepare('UPDATE projects SET cover_path = NULL WHERE cover_path = ?').run(version.thumbnail_path)
    // 先删该版本备注的录音文件，再删行，避免磁盘上留下孤儿音频
    const versionNotes = db
      .prepare("SELECT audio_path FROM notes WHERE target_type = 'version' AND target_id = ?")
      .all(version.id) as any[]
    for (const n of versionNotes) deleteRel(n.audio_path)
    db.prepare('DELETE FROM notes WHERE target_type = ? AND target_id = ?').run('version', version.id)
    db.prepare('DELETE FROM model_versions WHERE id = ?').run(version.id)
    return { ok: true }
  })

  // 下载指定版本（带附件头）
  app.get('/api/versions/:id/download', async (req, reply) => {
    const { id } = req.params as { id: string }
    const version = db.prepare('SELECT * FROM model_versions WHERE id = ?').get(id) as any
    if (!version) throw httpError(404, '版本不存在')
    const fileAbs = abs(version.file_path)
    if (!fs.existsSync(fileAbs)) throw httpError(404, '文件缺失')
    reply.header('content-type', 'application/octet-stream')
    reply.header('content-length', String(version.size_bytes || fs.statSync(fileAbs).size))
    reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(version.original_filename)}`)
    return reply.send(fs.createReadStream(fileAbs))
  })

  // 版本信息（单查，预览时使用）
  app.get('/api/versions/:id', async (req) => {
    const { id } = req.params as { id: string }
    const version = db.prepare('SELECT * FROM model_versions WHERE id = ?').get(id) as any
    if (!version) throw httpError(404, '版本不存在')
    return { version: rowToVersion(version) }
  })

  // 全局搜索
  app.get('/api/search', async (req) => {
    const q = req.query as { q?: string }
    const text = (q.q || '').trim()
    if (!text) return { models: [] }
    const like = `%${text}%`
    const rows = db.prepare(`
      SELECT m.*, p.name AS project_name,
        (SELECT COUNT(*) FROM model_versions vc WHERE vc.model_id = m.id) AS version_count,
        ${VERSION_COLUMNS}
      FROM models m
      JOIN projects p ON p.id = m.project_id
      LEFT JOIN model_versions cv ON cv.id = m.current_version_id
      WHERE m.name LIKE @like OR m.description LIKE @like OR m.tags LIKE @like
         OR EXISTS (SELECT 1 FROM notes n WHERE n.content LIKE @like AND (
            (n.target_type = 'model' AND n.target_id = m.id) OR
            (n.target_type = 'version' AND n.target_id IN (SELECT id FROM model_versions WHERE model_id = m.id))))
      ORDER BY m.updated_at DESC LIMIT 100`).all({ like }) as any[]
    return {
      models: rows.map((r) => {
        const { model, current } = splitRow(r)
        return { ...rowToModel(model, current, model.version_count), projectName: r.project_name }
      }),
    }
  })
}
