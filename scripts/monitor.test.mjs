// Unit tests for the smoke-run tag stored as flags.smoke (lib/monitor.ts): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// lib/ imports siblings without an extension; add .ts, as in turn-signature.test.mjs.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('./') && !/\\.[cm]?[jt]s$/.test(spec) && ctx.parentURL?.includes('/lib/')) {
    return next(spec + '.ts', ctx);
  }
  return next(spec, ctx);
}`),
);

const { cleanSmokeRun, smokeRun } = await import('../lib/monitor.ts');

const req = (h) => ({ headers: new Headers(h) });

test('a release tag is kept as sent', () => {
  assert.equal(cleanSmokeRun('v1.17'), 'v1.17');
  assert.equal(cleanSmokeRun('dev-check_2'), 'dev-check_2');
});

test('anything else is stripped and the length capped', () => {
  assert.equal(cleanSmokeRun('<script>v1.17</script>'), 'scriptv1.17script');
  assert.equal(cleanSmokeRun('x'.repeat(100)).length, 40);
  assert.equal(cleanSmokeRun('  '), null);
  assert.equal(cleanSmokeRun(null), null);
});

test('the header counts only on a monitor request', () => {
  process.env.MONITOR_TOKEN = 'secret-for-test';
  assert.equal(smokeRun(req({ 'x-smoke-run': 'v1.17' })), null);
  assert.equal(smokeRun(req({ 'x-smoke-run': 'v1.17', 'x-monitor-token': 'wrong-token-xxx' })), null);
  assert.equal(smokeRun(req({ 'x-smoke-run': 'v1.17', 'x-monitor-token': 'secret-for-test' })), 'v1.17');
  assert.equal(smokeRun(req({ 'x-monitor-token': 'secret-for-test' })), null);
});
