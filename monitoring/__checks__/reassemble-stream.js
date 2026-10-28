// Teardown script: runs after the request, before assertions.
// /api/chat returns an AI SDK UI message stream (SSE), one event per line, e.g.
//   data: {"type":"data-retrieval","data":{"status":"ok","chunks":[...]}}
//   data: {"type":"text-delta","id":"0","delta":"Wealth"}
//   data: {"type":"text-delta","id":"0","delta":"simple"}
//   data: {"type":"error","errorText":"error message"}
// Words are split across events, so a raw "contains" would never match.
// Rejoin the text deltas, surface error events as plain text, and summarise
// the retrieval part as one line, e.g.
//   [retrieval] status=ok chunks=5
// The retrieval part is only sent to requests carrying x-monitor-token.
//
// Until 2026-10-27 the site sent the AI SDK v4 data stream (0:"text",
// 3:"error", 8:[annotations]). Both are read, so this check can be deployed
// before or after the release that switched formats.
const lines = String(response.body || '').split('\n')
let text = ''
const errors = []
const retrieval = []
const summarise = (r) => {
  const withId = ((r && r.chunks) || []).filter((c) => c.chunk_id).length
  retrieval.push(`[retrieval] status=${r && r.status} chunks=${withId}`)
}
for (const line of lines) {
  try {
    if (line.startsWith('data: ')) {
      const payload = line.slice(6)
      if (payload === '[DONE]') continue
      const part = JSON.parse(payload)
      if (part.type === 'text-delta') text += part.delta
      else if (part.type === 'error') errors.push(part.errorText)
      else if (part.type === 'data-retrieval') summarise(part.data)
      continue
    }
    const sep = line.indexOf(':')
    if (sep < 1) continue
    const type = line.slice(0, sep)
    const payload = line.slice(sep + 1)
    if (type === '0') text += JSON.parse(payload)
    else if (type === '3') errors.push(JSON.parse(payload))
    else if (type === '8') {
      for (const a of JSON.parse(payload)) {
        if (a && a.type === 'retrieval') summarise(a)
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
