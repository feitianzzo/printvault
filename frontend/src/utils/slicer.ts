// 主流切片软件的 URL 协议封装。
// 协议格式 `{scheme}://open?file=<下载地址>` 已对照各软件源码核实：
// - OrcaSlicer: src/slic3r/GUI/Downloader.cpp 接受 orcaslicer/prusaslicer/bambustudio/cura 四种 scheme，无来源限制
// - Cura: CuraApplication._openUrl 接受 cura:// 与 slicer://，无来源限制
// - Bambu Studio / PrusaSlicer 官方版仅放行自家网站（MakerWorld / Printables），自托管站点调用可能被忽略
export interface Slicer {
  id: string
  name: string
  scheme: string
  note: string
  /** direct = 无来源限制；restricted = 官方版有来源白名单 */
  support: 'direct' | 'restricted'
}

export const SLICERS: Slicer[] = [
  {
    id: 'orcaslicer',
    name: 'OrcaSlicer',
    scheme: 'orcaslicer',
    note: '无来源限制，任意网站可直接打开（推荐）',
    support: 'direct',
  },
  {
    id: 'cura',
    name: 'UltiMaker Cura',
    scheme: 'cura',
    note: '需要 Cura 5.7 及以上，无来源限制',
    support: 'direct',
  },
  {
    id: 'bambustudio',
    name: 'Bambu Studio',
    scheme: 'bambustudio',
    note: '官方版本仅接受 MakerWorld 来源，若无反应请改用下载',
    support: 'restricted',
  },
  {
    id: 'prusaslicer',
    name: 'PrusaSlicer',
    scheme: 'prusaslicer',
    note: '官方版本仅接受 Printables 来源，若无反应请改用下载',
    support: 'restricted',
  },
]

export function buildSlicerUrl(scheme: string, fileUrl: string): string {
  return `${scheme}://open?file=${encodeURIComponent(fileUrl)}`
}

const LAST_SLICER_KEY = 'pv-slicer'

export function getLastSlicerId(): string | null {
  try {
    return localStorage.getItem(LAST_SLICER_KEY)
  } catch {
    return null
  }
}

export function setLastSlicerId(id: string): void {
  try {
    localStorage.setItem(LAST_SLICER_KEY, id)
  } catch {
    // 忽略
  }
}
