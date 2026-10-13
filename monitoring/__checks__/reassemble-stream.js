// Teardown script: runs after the request, before assertions.
// /api/chat returns an AI SDK v4 data stream, one part per line, e.g.
//   0:"Wealth"
//   0:"simple"
//   3:"error message"
// Words are split across parts, so a raw "contains" would never match.
// Rejoin the text parts (0:) and surface error parts (3:) as plain text.
const lines = String(response.body || '').split('\n')
let text = ''
const errors = []
for (const line of lines) {
  const sep = line.indexOf(':')
  if (sep < 1) continue
  const type = line.slice(0, sep)
  const payload = line.slice(sep + 1)
  try {
    if (type === '0') text += JSON.parse(payload)
    else if (type === '3') errors.push(JSON.parse(payload))
  } catch (e) {
    // Leave unparseable parts out of the text.
  }
}
if (errors.length) text += '\n[stream error] ' + errors.join(' | ')
// Fall back to the raw body if nothing parsed (e.g. an HTML error page),
// so the error-string assertions still see it.
response.body = text || String(response.body || '')
