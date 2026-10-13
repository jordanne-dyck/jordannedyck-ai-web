// Teardown script: runs after the request, before assertions.
// /api/chat returns an AI SDK v4 data stream, one part per line, e.g.
//   8:[{"type":"retrieval","status":"ok","chunks":[...]}]
//   0:"Wealth"
//   0:"simple"
//   3:"error message"
// Words are split across parts, so a raw "contains" would never match.
// Rejoin the text parts (0:), surface error parts (3:) as plain text, and
// summarise the retrieval annotation (8:) as one line, e.g.
//   [retrieval] status=ok chunks=5
// The 8: part is only sent to requests carrying x-monitor-token.
const lines = String(response.body || '').split('\n')
let text = ''
const errors = []
const retrieval = []
for (const line of lines) {
  const sep = line.indexOf(':')
  if (sep < 1) continue
  const type = line.slice(0, sep)
  const payload = line.slice(sep + 1)
  try {
    if (type === '0') text += JSON.parse(payload)
    else if (type === '3') errors.push(JSON.parse(payload))
    else if (type === '8') {
      for (const a of JSON.parse(payload)) {
        if (a && a.type === 'retrieval') {
          const withId = (a.chunks || []).filter((c) => c.chunk_id).length
          retrieval.push(`[retrieval] status=${a.status} chunks=${withId}`)
        }
      }
    }
  } catch (e) {
    // Leave unparseable parts out of the text.
  }
}
if (retrieval.length) text = retrieval.join('\n') + '\n' + text
if (errors.length) text += '\n[stream error] ' + errors.join(' | ')
// Fall back to the raw body if nothing parsed (e.g. an HTML error page),
// so the error-string assertions still see it.
response.body = text || String(response.body || '')
