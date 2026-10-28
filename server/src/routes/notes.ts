import type { FastifyInstance } from 'fastify'
import { db } from '../db.js'
import { httpError, rowToNote } from '../serialize.js'
import { abs, deleteRel, newUuid, rel, writeBuffer } from '../services/storage.js'
import { transcribeFile, whisperAvailable } from '../services/whisper.js'

const NOTE_WITH_VERSION = `
  SELECT n.*, v.version_no FROM notes n
  LEFT JOIN model_versions v ON n.target_type = 'version' AND v.id = n.target_id`

function assertTarget(targetType: string, targetId: number): void {
  if (targetType === 'model') {
    if (!db.prepare('SELECT id FROM models WHERE id = ?').get(targetId)) {
      throw httpError(404, '模型不存在')
    }
  } else if (targetType === 'version') {
    if (!db.prepare('SELECT id FROM model_versions WHERE id = ?').get(targetId)) {
      throw httpError(404, '版本不存在')
    }
  } else {
    throw httpError(400, 'targetType 必须为 model 或 version')
  }
}

export default async function noteRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/notes', async (req) => {
    const q = req.query as { targetType?: string; targetId?: string }
    if (!q.targetType || !q.targetId) throw httpError(400, '缺少 targetType / targetId')
    const list = db.prepare(`
      ${NOTE_WITH_VERSION}
      WHERE n.target_type = @targetType AND n.target_id = @targetId
      ORDER BY n.created_at DESC, n.id DESC`).all({ targetType: q.targetType, targetId: Number(q.targetId) }) as any[]
    return { notes: list.map(rowToNote) }
  })

  // 文字备注
  app.post('/api/notes', async (req, reply) => {
    const body = (req.body || {}) as {
      targetType?: string
      targetId?: number
      content?: string
      source?: string
    }
    const targetType = body.targetType || ''
    const targetId = Number(body.targetId)
    assertTarget(targetType, targetId)
    const content = (body.content || '').trim()
    if (!content) throw httpError(400, '备注内容不能为空')
    const info = db
      .prepare('INSERT INTO notes (target_type, target_id, content, source) VALUES (?, ?, ?, ?)')
      .run(targetType, targetId, content, body.source === 'voice' ? 'voice' : 'text')
    const row = db.prepare(`${NOTE_WITH_VERSION} WHERE n.id = ?`).get(info.lastInsertRowid) as any
    reply.code(201)
    return { note: rowToNote(row) }
  })

  // 语音备注：上传录音；无前端转写文本且已配置 whisper 时由服务端转写
  app.post('/api/notes/audio', async (req, reply) => {
    const fields: Record<string, string> = {}
    let audioBuf: Buffer | null = null
    let mime = 'audio/webm'
    let ext = 'webm'

    // 录音单文件上限 64MB，防止异常大文件整体缓冲进内存
    for await (const part of req.parts({ limits: { fileSize: 64 * 1024 * 1024 } })) {
      if (part.type === 'file') {
        if (part.fieldname === 'audio') {
          audioBuf = await part.toBuffer()
          mime = part.mimetype || 'audio/webm'
          ext = mime.includes('mp4') ? 'm4a' : 'webm'
        }
      } else {
        fields[part.fieldname] = String(part.value)
      }
    }

    const targetType = fields.targetType || ''
    const targetId = Number(fields.targetId)
    assertTarget(targetType, targetId)
    if (!audioBuf || audioBuf.length === 0) throw httpError(400, '缺少录音文件')

    const uuid = newUuid()
    const audioRel = rel('audio', `${uuid}.${ext}`)
    writeBuffer(audioBuf, audioRel)

    let transcript = (fields.transcript || '').trim()
    let transcribeError: string | undefined
    if (!transcript && whisperAvailable()) {
      try {
        transcript = await transcribeFile(abs(audioRel), mime)
      } catch (err: any) {
        transcribeError = `语音转写失败：${err?.message || err}`
      }
    }

    const info = db
      .prepare('INSERT INTO notes (target_type, target_id, content, audio_path, source) VALUES (?, ?, ?, ?, ?)')
      .run(targetType, targetId, transcript, audioRel, 'voice')
    const row = db.prepare(`${NOTE_WITH_VERSION} WHERE n.id = ?`).get(info.lastInsertRowid) as any
    reply.code(201)
    return { note: rowToNote(row), transcribeError }
  })

  app.delete('/api/notes/:id', async (req) => {
    const { id } = req.params as { id: string }
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any
    if (!note) throw httpError(404, '备注不存在')
    deleteRel(note.audio_path)
    db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    return { ok: true }
  })

  app.get('/api/whisper/health', async () => {
    return { available: whisperAvailable() }
  })
}
