async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `请求失败 (HTTP ${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // 保留默认消息
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export const api = {
  get<T>(url: string): Promise<T> {
    return fetch(url).then((r) => handle<T>(r))
  },
  post<T>(url: string, body?: unknown): Promise<T> {
    return fetch(url, {
      method: 'POST',
      headers: body instanceof FormData ? undefined : { 'content-type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }).then((r) => handle<T>(r))
  },
  patch<T>(url: string, body?: unknown): Promise<T> {
    return fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => handle<T>(r))
  },
  delete<T>(url: string): Promise<T> {
    return fetch(url, { method: 'DELETE' }).then((r) => handle<T>(r))
  },
}

/** 带上传进度的 multipart POST */
export function postFormWithProgress<T>(
  url: string,
  form: FormData,
  onProgress?: (loaded: number, total: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total)
    }
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // 非 JSON 响应
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T)
      } else {
        const msg = (body as { error?: string })?.error || `上传失败 (HTTP ${xhr.status})`
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('网络错误，上传失败'))
    xhr.send(form)
  })
}

/** 下载文件并报告进度，返回 ArrayBuffer（用于 3D 解析） */
export async function fetchFileWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`文件下载失败 (HTTP ${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body) return res.arrayBuffer()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress?.(loaded, total)
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out.buffer
}
