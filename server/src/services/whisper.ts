import fs from 'node:fs'

export const WHISPER_URL = (process.env.WHISPER_URL || '').replace(/\/+$/, '')

export const whisperAvailable = (): boolean => WHISPER_URL !== ''

/**
 * 调用 faster-whisper HTTP 服务转写音频。
 * 兼容 onerahmet/openai-whisper-asr-webservice 的 /asr 接口。
 */
export async function transcribeFile(absPath: string, mime: string): Promise<string> {
  const buf = await fs.promises.readFile(absPath)
  const form = new FormData()
  form.append(
    'audio_file',
    new Blob([new Uint8Array(buf)], { type: mime || 'audio/webm' }),
    'audio.webm',
  )
  const res = await fetch(`${WHISPER_URL}/asr?task=transcribe&language=zh&output=json`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) {
    throw new Error(`语音转写服务返回 ${res.status}`)
  }
  const data = (await res.json()) as { text?: string }
  return (data.text || '').trim()
}
