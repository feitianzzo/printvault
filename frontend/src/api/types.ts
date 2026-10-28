export interface ProjectDTO {
  id: number
  name: string
  description: string
  coverUrl: string | null
  archived: boolean
  createdAt: string
  updatedAt: string
  modelCount?: number
  versionCount?: number
  storageBytes?: number
}

export interface VersionDTO {
  id: number
  modelId: number
  versionNo: number
  versionLabel: string
  format: string
  originalFilename: string
  sizeBytes: number
  sha256: string
  triangleCount: number | null
  dims: { x: number; y: number; z: number } | null
  volumeMm3: number | null
  thumbnailUrl: string | null
  fileUrl: string
  downloadUrl: string
  createdAt: string
}

export interface ModelListItemDTO {
  id: number
  projectId: number
  name: string
  description: string
  tags: string[]
  createdAt: string
  updatedAt: string
  versionCount: number
  current: VersionDTO | null
  projectName?: string
}

export interface NoteDTO {
  id: number
  targetType: 'model' | 'version'
  targetId: number
  content: string
  source: string
  audioUrl: string | null
  versionNo: number | null
  createdAt: string
}

export interface ModelDetailDTO extends ModelListItemDTO {
  versions: VersionDTO[]
  notes: NoteDTO[]
}

export interface StatsDTO {
  totals: {
    projects: number
    models: number
    versions: number
    storage_bytes: number
    notes: number
  }
  recent: ModelListItemDTO[]
}

export interface UploadResult {
  modelId: number
  versionId: number
  previewable: boolean
  warning?: string
}
