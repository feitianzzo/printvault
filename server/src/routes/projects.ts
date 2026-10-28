import type { FastifyInstance } from 'fastify'
import { db } from '../db.js'
import { deleteModelFiles } from '../services/storage.js'
import { httpError, rowToProject } from '../serialize.js'

export default async function projectRoutes(app: FastifyInstance): Promise<void> {
  const selectWithCounts = `
    SELECT p.*,
      (SELECT COUNT(*) FROM models m WHERE m.project_id = p.id) AS model_count,
      (SELECT COUNT(*) FROM model_versions v JOIN models m2 ON m2.id = v.model_id WHERE m2.project_id = p.id) AS version_count,
      (SELECT COALESCE(SUM(v2.size_bytes), 0) FROM model_versions v2 JOIN models m3 ON m3.id = v2.model_id WHERE m3.project_id = p.id) AS storage_bytes
    FROM projects p`
  const listSql = `${selectWithCounts} ORDER BY p.archived ASC, p.updated_at DESC`
  const byIdSql = `${selectWithCounts} WHERE p.id = ?`

  app.get('/api/projects', async () => {
    const rows = db.prepare(listSql).all() as any[]
    return { projects: rows.map(rowToProject) }
  })

  app.get('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string }
    const row = db.prepare(byIdSql).get(id) as any
    if (!row) throw httpError(404, '项目不存在')
    return { project: rowToProject(row) }
  })

  app.post('/api/projects', async (req, reply) => {
    const body = (req.body || {}) as { name?: string; description?: string }
    const name = (body.name || '').trim()
    if (!name) throw httpError(400, '项目名称不能为空')
    const info = db
      .prepare('INSERT INTO projects (name, description) VALUES (?, ?)')
      .run(name, (body.description || '').trim())
    const row = db.prepare(byIdSql).get(info.lastInsertRowid) as any
    reply.code(201)
    return { project: rowToProject(row) }
  })

  app.patch('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string }
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    if (!existing) throw httpError(404, '项目不存在')
    const body = (req.body || {}) as {
      name?: string
      description?: string
      archived?: boolean
      coverVersionId?: number
    }

    let coverPath: string | null | undefined
    if (body.coverVersionId != null) {
      const version = db
        .prepare('SELECT thumbnail_path FROM model_versions WHERE id = ?')
        .get(body.coverVersionId) as any
      if (version?.thumbnail_path) {
        coverPath = version.thumbnail_path
      } else if (body.coverVersionId === 0) {
        coverPath = null
      }
    }

    const sets: string[] = []
    const params: unknown[] = []
    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) throw httpError(400, '项目名称不能为空')
      sets.push('name = ?')
      params.push(name)
    }
    if (body.description !== undefined) {
      sets.push('description = ?')
      params.push(body.description.trim())
    }
    if (body.archived !== undefined) {
      sets.push('archived = ?')
      params.push(body.archived ? 1 : 0)
    }
    if (coverPath !== undefined) {
      sets.push('cover_path = ?')
      params.push(coverPath)
    }
    if (sets.length > 0) {
      sets.push(`updated_at = datetime('now','localtime')`)
      params.push(id)
      db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
    const row = db.prepare(byIdSql).get(id) as any
    return { project: rowToProject(row) }
  })

  app.delete('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string }
    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id)
    if (!existing) throw httpError(404, '项目不存在')
    const modelIds = (db.prepare('SELECT id FROM models WHERE project_id = ?').all(id) as any[]).map(
      (m) => m.id,
    )
    for (const modelId of modelIds) deleteModelFiles(modelId)
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return { ok: true }
  })
}
