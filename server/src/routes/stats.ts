import type { FastifyInstance } from 'fastify'
import { db } from '../db.js'
import { rowToModel } from '../serialize.js'

export default async function statRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/stats', async () => {
    const totals = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM projects) AS projects,
        (SELECT COUNT(*) FROM models) AS models,
        (SELECT COUNT(*) FROM model_versions) AS versions,
        (SELECT COALESCE(SUM(size_bytes), 0) FROM model_versions) AS storage_bytes,
        (SELECT COUNT(*) FROM notes) AS notes`).get() as any

    const recent = db.prepare(`
      SELECT m.*, (SELECT COUNT(*) FROM model_versions vc WHERE vc.model_id = m.id) AS version_count,
        cv.id AS v_id, cv.version_no AS v_version_no, cv.version_label AS v_version_label,
        cv.format AS v_format, cv.original_filename AS v_original_filename, cv.size_bytes AS v_size_bytes,
        cv.sha256 AS v_sha256, cv.triangle_count AS v_triangle_count,
        cv.dim_x AS v_dim_x, cv.dim_y AS v_dim_y, cv.dim_z AS v_dim_z, cv.volume_mm3 AS v_volume_mm3,
        cv.thumbnail_path AS v_thumbnail_path, cv.file_path AS v_file_path, cv.created_at AS v_created_at,
        p.name AS project_name
      FROM models m
      LEFT JOIN model_versions cv ON cv.id = m.current_version_id
      JOIN projects p ON p.id = m.project_id
      ORDER BY m.updated_at DESC LIMIT 8`).all() as any[]

    return {
      totals,
      recent: recent.map((r) => ({
        ...rowToModel(
          { ...r, id: r.id, project_id: r.project_id, version_count: r.version_count },
          r.v_id != null
            ? { id: r.v_id, model_id: r.id, version_no: r.v_version_no, version_label: r.v_version_label,
                format: r.v_format, original_filename: r.v_original_filename, size_bytes: r.v_size_bytes,
                sha256: r.v_sha256, triangle_count: r.v_triangle_count, dim_x: r.v_dim_x, dim_y: r.v_dim_y,
                dim_z: r.v_dim_z, volume_mm3: r.v_volume_mm3, thumbnail_path: r.v_thumbnail_path,
                file_path: r.v_file_path, created_at: r.v_created_at }
            : null,
          r.version_count,
        ),
        projectName: r.project_name,
      })),
    }
  })
}
