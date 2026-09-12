// fetch-polyfill.js — Node <18 运行时的极简 fetch 替代（仅支持 GET + arrayBuffer/text）
const https = require('https')
const http = require('http')

module.exports = function (url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('http://') ? http : https
    const req = mod.get(url, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: res.headers,
          text: async () => buf.toString('utf8'),
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        })
      })
    })
    req.on('error', reject)
    req.setTimeout(55000, () => req.destroy(new Error('CI 请求超时')))
  })
}
