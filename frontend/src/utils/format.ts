export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const v = n / 1024 ** i
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return '-'
  return s.slice(0, 16)
}

export function formatVolume(mm3: number | null | undefined): string {
  if (mm3 == null) return '-'
  if (mm3 >= 1e9) return `${(mm3 / 1e9).toFixed(2)} L`
  if (mm3 >= 1e3) return `${(mm3 / 1e3).toFixed(1)} cm³`
  return `${mm3.toFixed(1)} mm³`
}

export function formatDims(d: { x: number; y: number; z: number } | null): string {
  if (!d) return '-'
  const f = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1))
  return `${f(d.x)} × ${f(d.y)} × ${f(d.z)} mm`
}

export function formatCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n ?? 0)
}

export const FORMAT_LABELS: Record<string, string> = {
  stl: 'STL',
  '3mf': '3MF',
  step: 'STEP',
  obj: 'OBJ',
}

export const PREVIEWABLE_FORMATS = new Set(['stl', '3mf', 'step', 'obj'])

export function formatBadgeClass(format: string): string {
  switch (format) {
    case 'stl':
      return 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
    case '3mf':
      return 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
    case 'step':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    case 'obj':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    default:
      return 'bg-zinc-500/10 text-zinc-500'
  }
}
