<script setup lang="ts">
// 项目新建/编辑弹窗
import { ref, watch } from 'vue'
import { api } from '@/api/client'
import type { ProjectDTO } from '@/api/types'
import { useToastStore } from '@/stores/toast'
import AppModal from './AppModal.vue'

const props = defineProps<{ open: boolean; project?: ProjectDTO | null }>()
const emit = defineEmits<{ close: []; saved: [project: ProjectDTO] }>()
const toast = useToastStore()

const name = ref('')
const description = ref('')
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = props.project?.name ?? ''
      description.value = props.project?.description ?? ''
    }
  },
)

async function save(): Promise<void> {
  if (!name.value.trim()) {
    toast.push('error', '项目名称不能为空')
    return
  }
  saving.value = true
  try {
    const body = { name: name.value.trim(), description: description.value.trim() }
    const res = props.project
      ? await api.patch<{ project: ProjectDTO }>(`/api/projects/${props.project.id}`, body)
      : await api.post<{ project: ProjectDTO }>('/api/projects', body)
    toast.push('success', props.project ? '项目已更新' : '项目已创建')
    emit('saved', res.project)
    emit('close')
  } catch (err) {
    toast.push('error', (err as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal :open="open" :title="project ? '编辑项目' : '新建项目'" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="save">
      <div>
        <label class="mb-1 block text-xs font-medium text-zinc-500">项目名称 *</label>
        <input v-model="name" class="input" placeholder="如：机械键盘外壳" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-zinc-500">描述</label>
        <textarea v-model="description" class="input min-h-20 resize-y" rows="3" placeholder="项目背景、材料、打印机型号…" />
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">取消</button>
        <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
      </div>
    </form>
  </AppModal>
</template>
