// The site's MONITOR_TOKEN, read at test/deploy time so it never lands in the
// public repo. Stored on each check as a secret Checkly variable and sent as
// the x-monitor-token header, which marks the request synthetic in chat_events,
// skips the rate limit and unlocks /api/health?deep=1.
const token = process.env.MONITOR_TOKEN
if (!token) {
  throw new Error('Set MONITOR_TOKEN before running checkly test or checkly deploy.')
}

export const monitorTokenVariable = { key: 'MONITOR_TOKEN', value: token, secret: true }
export const monitorTokenHeader = { key: 'x-monitor-token', value: '{{{MONITOR_TOKEN}}}' }
