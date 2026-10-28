// 缩略图渲染器：离屏 WebGL 渲染单个模型 → WebP Blob
import * as THREE from 'three'

let renderer: THREE.WebGLRenderer | null = null

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  }
  return renderer
}

export function renderThumbnail(geometry: THREE.BufferGeometry): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const size = 512
      const r = getRenderer()
      r.setSize(size, size)
      r.setPixelRatio(1)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100000)

      scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.4))
      const key = new THREE.DirectionalLight(0xffffff, 1.8)
      key.position.set(4, 6, 5)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xbfd8ff, 0.7)
      fill.position.set(-5, -2, -4)
      scene.add(fill)

      const material = new THREE.MeshStandardMaterial({
        color: 0x14b8a6,
        metalness: 0.12,
        roughness: 0.55,
        flatShading: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      scene.add(mesh)

      // 取等距视角，距离按包围球自适应
      geometry.computeBoundingSphere()
      const radius = Math.max(geometry.boundingSphere?.radius ?? 1, 1e-3)
      const dist = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.05
      camera.position.set(dist * 0.62, dist * 0.5, dist * 0.72)
      camera.lookAt(0, 0, 0)

      r.render(scene, camera)
      r.domElement.toBlob(
        (blob) => {
          material.dispose()
          resolve(blob)
        },
        'image/webp',
        0.85,
      )
    } catch {
      resolve(null)
    }
  })
}
