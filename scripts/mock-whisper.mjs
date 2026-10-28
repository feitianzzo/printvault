// 模拟 faster-whisper 服务（/asr），用于本地验证转写链路
import http from 'node:http'

const mode = process.argv[2] || 'ok'

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url?.startsWith('/asr')) {
    let size = 0
    req.on('data', (c) => (size += c.length))
    req.on('end', () => {
      console.log(`[mock-whisper] 收到音频 ${size} 字节, url=${req.url}`)
      if (mode === 'fail') {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'mock 转写失败' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ text: ' 这是模拟转写出来的备注内容 ' }))
    })
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(9999, () => console.log('[mock-whisper] listening on :9999, mode=' + mode))
