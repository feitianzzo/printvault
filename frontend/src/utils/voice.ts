// 语音工具：Web Speech API 实时转写 + MediaRecorder 录音回退

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechEventLike {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

export function speechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export interface RecognitionHandle {
  stop(): void
}

/**
 * 启动实时语音识别（zh-CN）。onResult 的 final 参数区分临时/最终结果。
 * Chrome 会在静音后自动结束，这里在 active 期间自动重启以保持连续听写。
 */
export function startRecognition(callbacks: {
  onResult: (finalText: string, interimText: string) => void
  onEnd: () => void
  onError: (message: string) => void
}): RecognitionHandle | null {
  const Ctor = (window.SpeechRecognition || window.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined
  if (!Ctor) return null

  const rec = new Ctor()
  rec.lang = 'zh-CN'
  rec.continuous = true
  rec.interimResults = true

  let active = true
  let restarting = false

  rec.onresult = (e) => {
    let finalText = ''
    let interimText = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      const text = r[0]?.transcript ?? ''
      if (r.isFinal) finalText += text
      else interimText += text
    }
    callbacks.onResult(finalText, interimText)
  }
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return
    active = false
    callbacks.onError(
      e.error === 'not-allowed' ? '麦克风权限被拒绝，请在浏览器设置中允许' : `语音识别错误: ${e.error}`,
    )
  }
  rec.onend = () => {
    if (active && !restarting) {
      restarting = true
      // 某些浏览器要求 end 事件后再 start
      setTimeout(() => {
        restarting = false
        if (active) {
          try {
            rec.start()
          } catch {
            if (active) callbacks.onEnd()
          }
        }
      }, 120)
    } else if (!active) {
      callbacks.onEnd()
    }
  }

  rec.start()
  return {
    stop() {
      active = false
      rec.stop()
    },
  }
}

export class AudioRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  recording = false

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''
    this.recorder = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream)
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start()
    this.recording = true
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const r = this.recorder
      if (!r || !this.recording) {
        reject(new Error('没有进行中的录音'))
        return
      }
      r.onstop = () => {
        this.recording = false
        for (const t of this.stream?.getTracks() ?? []) t.stop()
        resolve(new Blob(this.chunks, { type: r.mimeType || 'audio/webm' }))
      }
      r.stop()
    })
  }
}
