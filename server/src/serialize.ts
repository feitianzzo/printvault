import type { ModelDetailDTO, ModelListItemDTO, NoteDTO, ProjectDTO, VersionDTO } from './types.js'

export function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode })
}

export function rowToVersion(v: any): VersionDTO {
  return {
    id: v.id,
    modelId: v.model_id,
    versionNo: v.version_no,
    versionLabel: v.version_label,
    format: v.format,
    originalFilename: v.original_filename,
    sizeBytes: v.size_bytes,
    sha256: v.sha256,
    triangleCount: v.triangle_count ?? null,
    dims: v.dim_x != null ? { x: v.dim_x, y: v.dim_y, z: v.dim_z } : null,
    volumeMm3: v.volume_mm3 ?? null,
    thumbnailUrl: v.thumbnail_path ? `/files/${v.thumbnail_path}` : null,
    fileUrl: `/files/${v.file_path}`,
    downloadUrl: `/api/versions/${v.id}/download`,
    createdAt: v.created_at,
  }
}

export function rowToModel(m: any, current?: any, versionCount = 0): ModelListItemDTO {
  return {
    id: m.id,
    projectId: m.project_id,
    name: m.name,
    description: m.description || '',
    tags: safeParseTags(m.tags),
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    versionCount: versionCount || m.version_count || 0,
    current: current ? rowToVersion(current) : null,
  }
}

export function rowToProject(p: any): ProjectDTO {
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    coverUrl: p.cover_path ? `/files/${p.cover_path}` : null,
    archived: !!p.archived,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    modelCount: p.model_count ?? undefined,
    versionCount: p.version_count ?? undefined,
    storageBytes: p.storage_bytes ?? undefined,
  }
}

export function rowToNote(n: any): NoteDTO {
  return {
    id: n.id,
    targetType: n.target_type,
    targetId: n.target_id,
    content: n.content || '',
    source: n.source || 'text',
    audioUrl: n.audio_path ? `/files/${n.audio_path}` : null,
    versionNo: n.version_no ?? null,
    createdAt: n.created_at,
  }
}

export function modelDetail(m: any, versions: any[], notes: any[]): ModelDetailDTO {
  return {
    ...rowToModel(m, versions.find((v) => v.id === m.current_version_id), versions.length),
    versions: versions.map(rowToVersion),
    notes: notes.map(rowToNote),
  }
}

function safeParseTags(raw: unknown): string[] {
  try {
    const v = JSON.parse(String(raw || '[]'))
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
