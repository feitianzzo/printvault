/// <reference types="vite/client" />

declare module 'occt-import-js/dist/occt-import-js.wasm?url' {
  const src: string
  export default src
}

declare module 'occt-import-js' {
  export interface OcctMesh {
    name: string
    attributes: {
      position: { array: Float32Array }
      normal?: { array: Float32Array }
    }
    index?: { array: Uint32Array }
    brep_faces?: unknown[]
  }
  export interface OcctResult {
    success: boolean
    root: unknown
    meshes: OcctMesh[]
  }
  export interface OcctModule {
    ReadStepFile(file: Uint8Array, params: unknown): OcctResult | null
  }
  function occtimportjs(params: { locateFile?: (name: string) => string }): Promise<OcctModule>
  export default occtimportjs
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  SpeechRecognition?: unknown
  webkitSpeechRecognition?: unknown
}
