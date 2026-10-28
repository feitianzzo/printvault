import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyError } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { DATA_DIR } from './db.js'
import projectRoutes from './routes/projects.js'
import modelRoutes from './routes/models.js'
import noteRoutes from './routes/notes.js'
import statRoutes from './routes/stats.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendDist = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.resolve(here, '../../frontend/dist')

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: undefined,
  },
  bodyLimit: 64 * 1024 * 1024,
})

await app.register(multipart, {
  limits: { files: 6, fileSize: 200 * 1024 * 1024 * 1024, fieldSize: 4 * 1024 * 1024 },
})
await app.register(cors, { origin: true })

// /files/** —— 模型文件、缩略图、录音（支持 Range 断点下载）。
// allowedPath 限制只能访问三个子目录，避免暴露数据库文件和上传临时目录
await app.register(fastifyStatic, {
  root: DATA_DIR,
  prefix: '/files/',
  decorateReply: false,
  allowedPath: (pathName) => /^\/(models|thumbs|audio)\//.test(pathName),
})

// 生产环境托管前端构建产物（SPA fallback）
if (fs.existsSync(frontendDist)) {
  await app.register(fastifyStatic, { root: frontendDist, prefix: '/' })
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/files')) {
      return reply.sendFile('index.html')
    }
    reply.code(404).send({ error: 'Not Found' })
  })
} else {
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Not Found' }))
}

app.setErrorHandler((err: FastifyError, req, reply) => {
  const status = typeof err.statusCode === 'number' && err.statusCode >= 400 ? err.statusCode : 500
  if (status >= 500) req.log.error(err)
  else req.log.warn(`${status} ${err.message}`)
  const message =
    err.code === 'FST_REQ_FILE_TOO_LARGE' || err.code === 'FST_PART_FILE_SIZE_LIMIT'
      ? '文件超过大小限制'
      : status >= 500
        ? '服务器内部错误'
        : err.message
  reply.code(status).send({ error: message })
})

await app.register(projectRoutes)
await app.register(modelRoutes)
await app.register(noteRoutes)
await app.register(statRoutes)

const port = Number(process.env.PORT || 8001)
const host = process.env.HOST || '0.0.0.0'
await app.listen({ port, host })
app.log.info(`PrintVault 已启动: http://localhost:${port}`)
app.log.info(`数据目录: ${DATA_DIR}`)
if (fs.existsSync(frontendDist)) {
  app.log.info(`前端产物目录: ${frontendDist}`)
} else {
  app.log.info('未发现前端构建产物，仅提供 API（开发模式请配合 vite dev）')
}
