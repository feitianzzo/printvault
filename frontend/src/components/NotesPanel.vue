<script setup lang="ts">
// 备注面板：文字备注 + 语音输入（Web Speech 实时转写，回退 MediaRecorder 录音）
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '@/api/client'
import type { NoteDTO } from '@/api/types'
import { AudioRecorder, speechRecognitionSupported, startRecognition, type RecognitionHandle } from '@/utils/voice'
import { useToastStore } from '@/stores/toast'
import { formatDate } from '@/utils/format'

const props = defineProps<{ targetType: 'model' | 'version'; targetId: number }>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToastStore()
const notes = ref<NoteDTO[]>([])
const loading = ref(false)
const content = ref('')
const sending = ref(false)

const mode = ref<'idle' | 'listening' | 'recording' | 'recorded'>('idle')
const interim = ref('')
const elapsed = ref(0)
const recordedBlob = ref<Blob | null>(null)
const recordedUrl = ref('')
const whisperAvailable = ref<boolean | null>(null)

let recHandle: RecognitionHandle | null = null
let recorder: AudioRecorder | null = null
let timer: number | null = null

async function loadNotes(): Promise<void> {
  loading.value = true
  try {
    const res = await api.get<{ notes: NoteDTO[] }>(
      `/api/notes?targetType=${props.targetType}&targetId=${props.targetId}`,
    )
    notes.value = res.notes
  } finally {
    loading.value = false
  }
}

async function saveText(): Promise<void> {
  const text = content.value.trim()
  if (!text) {
    toast.push('error', '备注内容不能为空')
    return
  }
  sending.value = true
  try {
    await api.post('/api/notes', {
      targetType: props.targetType,
      targetId: props.targetId,
      content: text,
      source: 'text',
    })
    toast.push('success', '备注已保存')
    resetCompose()
    await loadNotes()
    emit('changed')
  } catch (err) {
    toast.push('error', (err as Error).message)
  } finally {
    sending.value = false
  }
}

function resetCompose(): void {
  content.value = ''
  interim.value = ''
  recordedBlob.value = null
  if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
  recordedUrl.value = ''
  mode.value = 'idle'
}

function stopListening(): void {
  recHandle?.stop()
  recHandle = null
  mode.value = 'idle'
  interim.value = ''
}

async function stopRecording(): Promise<void> {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  try {
    const blob = await recorder!.stop()
    recordedBlob.value = blob
    recordedUrl.value = URL.createObjectURL(blob)
    mode.value = 'recorded'
  } catch (err) {
    toast.push('error', (err as Error).message)
    mode.value = 'idle'
  }
}

async function toggleMic(): Promise<void> {
  if (mode.value === 'idle' || mode.value === 'recorded') {
    resetCompose()
    if (speechRecognitionSupported()) {
      recHandle = startRecognition({
        onResult: (finalText, interimText) => {
          if (finalText) {
            content.value = (content.value ? content.value.replace(/\s+$/, '') + ' ' : '') + finalText.trim()
          }
          interim.value = interimText
        },
        onEnd: () => {
          if (mode.value === 'listening') stopListening()
        },
        onError: (m) => {
          toast.push('error', m)
          stopListening()
        },
      })
      if (recHandle) mode.value = 'listening'
      else toast.push('error', '无法启动语音识别')
    } else {
      recorder = new AudioRecorder()
      try {
        await recorder.start()
        mode.value = 'recording'
        elapsed.value = 0
        timer = window.setInterval(() => elapsed.value++, 1000)
        if (whisperAvailable.value === false) {
          toast.push('info', '当前浏览器不支持实时转写，且未配置 Whisper 服务，将仅保存录音')
        }
      } catch (err) {
        toast.push('error', '无法访问麦克风：' + (err as Error).message)
      }
    }
  } else if (mode.value === 'listening') {
    stopListening()
  } else if (mode.value === 'recording') {
    await stopRecording()
  }
}

async function sendRecorded(): Promise<void> {
  if (!recordedBlob.value) return
  sending.value = true
  try {
    const form = new FormData()
    form.append('targetType', props.targetType)
    form.append('targetId', String(props.targetId))
    form.append('audio', recordedBlob.value, 'voice.webm')
    const res = await api.post<{ note: NoteDTO; transcribeError?: string }>('/api/notes/audio', form)
    if (res.transcribeError) toast.push('error', res.transcribeError + '，已保留录音')
    else if (!res.note.content) toast.push('info', '录音已保存（未产生转写文字）')
    else toast.push('success', '语音备注已保存')
    resetCompose()
    await loadNotes()
    emit('changed')
  } catch (err) {
    toast.push('error', (err as Error).message)
  } finally {
    sending.value = false
  }
}

async function removeNote(note: NoteDTO): Promise<void> {
  if (!confirm('确定删除这条备注？')) return
  try {
    await api.delete(`/api/notes/${note.id}`)
    notes.value = notes.value.filter((n) => n.id !== note.id)
    emit('changed')
  } catch (err) {
    toast.push('error', (err as Error).message)
  }
}

onMounted(async () => {
  void loadNotes()
  try {
    const res = await api.get<{ available: boolean }>('/api/whisper/health')
    whisperAvailable.value = res.available
  } catch {
    whisperAvailable.value = false
  }
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  recHandle?.stop()
  if (recorder?.recording) void recorder.stop()
})
</script>

<template>
  <div class="space-y-4">
    <!-- 输入区 -->
    <div class="card p-3">
      <textarea
        v-model="content"
        class="input min-h-20 resize-y border-0 bg-transparent p-0 focus:ring-0 dark:bg-transparent"
        :placeholder="mode === 'listening' ? '正在聆听，请说话…' : '记录打印参数、问题、改进想法…'"
        rows="3"
      />
      <div v-if="mode === 'listening' && interim" class="mt-1 text-sm italic text-zinc-400">{{ interim }}…</div>

      <!-- 录音预览 -->
      <div v-if="mode === 'recorded'" class="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800/60">
        <audio :src="recordedUrl" controls class="h-9 max-w-full flex-1" />
        <button class="btn-primary !px-3 !py-1.5 text-xs" :disabled="sending" @click="sendRecorded">保存录音备注</button>
        <button class="btn-secondary !px-3 !py-1.5 text-xs" @click="resetCompose">丢弃</button>
      </div>

      <div class="mt-2 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button
            class="flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-all"
            :class="{
              'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300': mode === 'idle' || mode === 'recorded',
              'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse': mode === 'listening' || mode === 'recording',
            }"
            @click="toggleMic"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-[18px] w-[18px]">
              <path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <template v-if="mode === 'idle'">语音输入</template>
            <template v-else-if="mode === 'listening'">停止听写</template>
            <template v-else-if="mode === 'recording'">{{ Math.floor(elapsed / 60) }}:{{ String(elapsed % 60).padStart(2, '0') }} 停止</template>
            <template v-else>重录</template>
          </button>
          <span v-if="mode === 'recording'" class="text-xs text-zinc-400">
            {{ whisperAvailable ? '停止后将自动转写' : '仅保存录音' }}
          </span>
        </div>
        <button class="btn-primary !px-4 !py-1.5 text-sm" :disabled="sending || !content.trim()" @click="saveText">保存备注</button>
      </div>
    </div>

    <!-- 列表 -->
    <div v-if="loading" class="py-6 text-center text-sm text-zinc-400">加载中…</div>
    <div v-else-if="!notes.length" class="py-6 text-center text-sm text-zinc-400">暂无备注</div>
    <ul v-else class="space-y-2.5">
      <li v-for="note in notes" :key="note.id" class="card p-3.5">
        <div class="flex items-start justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="badge" :class="note.source === 'voice' ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'bg-zinc-500/10 text-zinc-500'">
              {{ note.source === 'voice' ? '语音' : '文字' }}
            </span>
            <span v-if="note.versionNo != null" class="badge bg-teal-600/10 text-teal-600 dark:text-teal-400">v{{ note.versionNo }}</span>
          </div>
          <button class="text-zinc-300 hover:text-red-500 dark:text-zinc-600" title="删除备注" @click="removeNote(note)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
          </button>
        </div>
        <p class="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{{ note.content || '（无文字内容）' }}</p>
        <audio v-if="note.audioUrl" :src="note.audioUrl" controls class="mt-2 h-9 w-full max-w-xs" />
        <div class="mt-1.5 text-[11px] text-zinc-400">{{ formatDate(note.createdAt) }}</div>
      </li>
    </ul>
  </div>
</template>
