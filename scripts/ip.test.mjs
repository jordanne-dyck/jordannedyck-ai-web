// Unit tests for client-IP selection (lib/ip.ts): npm test.
// Each case is one possible proxy chain in front of the pod, with a client that
// sends its own X-Forwarded-For: 6.6.6.6 to try to pick its bucket.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClientIp } from '../lib/ip.ts';

const CLIENT = '203.0.113.7'; // the real visitor
const HAPROXY = '192.0.2.10'; // public HAProxy, as the router sees it
const SPOOF = '6.6.6.6';

function req(h) {
  const m = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (n) => m.get(n.toLowerCase()) ?? null } };
}

beforeEach(() => {
  delete process.env.CLIENT_IP_HEADER;
  delete process.env.TRUSTED_PROXY_HOPS;
});

test('unset: old left-most rule, which the spoof wins (the JOA.15 defect)', () => {
  assert.equal(getClientIp(req({ 'x-forwarded-for': `${SPOOF}, ${CLIENT}, ${HAPROXY}` })), SPOOF);
  assert.equal(getClientIp(req({ 'x-real-ip': CLIENT })), CLIENT);
  assert.equal(getClientIp(req({})), 'unknown');
});

test('HAProxy appends + router appends, hops=2: the client, not the spoof', () => {
  process.env.TRUSTED_PROXY_HOPS = '2';
  assert.equal(getClientIp(req({ 'x-forwarded-for': `${SPOOF}, ${CLIENT}, ${HAPROXY}` })), CLIENT);
  assert.equal(getClientIp(req({ 'x-forwarded-for': `${CLIENT}, ${HAPROXY}` })), CLIENT);
  // Several spoofed entries change nothing.
  assert.equal(getClientIp(req({ 'x-forwarded-for': `1.1.1.1, ${SPOOF}, ${CLIENT}, ${HAPROXY}` })), CLIENT);
});

test('HAProxy replaces + router appends, hops=2: the same setting works', () => {
  process.env.TRUSTED_PROXY_HOPS = '2';
  assert.equal(getClientIp(req({ 'x-forwarded-for': `${CLIENT}, ${HAPROXY}` })), CLIENT);
});

test('one appending hop (L4 HAProxy with PROXY protocol, or router only), hops=1', () => {
  process.env.TRUSTED_PROXY_HOPS = '1';
  assert.equal(getClientIp(req({ 'x-forwarded-for': `${SPOOF}, ${CLIENT}` })), CLIENT);
});

test('hops: fewer entries than hops takes the left-most; none is unknown', () => {
  process.env.TRUSTED_PROXY_HOPS = '2';
  assert.equal(getClientIp(req({ 'x-forwarded-for': CLIENT })), CLIENT);
  assert.equal(getClientIp(req({})), 'unknown');
  // x-real-ip is never trusted in hops mode.
  assert.equal(getClientIp(req({ 'x-real-ip': SPOOF })), 'unknown');
});

test('hops: a non-IP in the trusted position is unknown, not its own bucket', () => {
  process.env.TRUSTED_PROXY_HOPS = '2';
  assert.equal(getClientIp(req({ 'x-forwarded-for': `unknown, ${HAPROXY}` })), 'unknown');
});

test('hops: IPv6 is kept', () => {
  process.env.TRUSTED_PROXY_HOPS = '2';
  assert.equal(getClientIp(req({ 'x-forwarded-for': `${SPOOF}, 2001:db8::1, ${HAPROXY}` })), '2001:db8::1');
});

test('hops: a malformed setting throws instead of falling back', () => {
  for (const bad of ['0', '-1', '1.5', 'two']) {
    process.env.TRUSTED_PROXY_HOPS = bad;
    assert.throws(() => getClientIp(req({ 'x-forwarded-for': CLIENT })), /TRUSTED_PROXY_HOPS/);
  }
});

test('router replaces XFF, HAProxy sets its own header: CLIENT_IP_HEADER', () => {
  process.env.CLIENT_IP_HEADER = 'X-Client-IP';
  // The router's replaced XFF holds only HAProxy; the spoof is ignored.
  assert.equal(getClientIp(req({ 'x-client-ip': CLIENT, 'x-forwarded-for': HAPROXY })), CLIENT);
  // Takes precedence over TRUSTED_PROXY_HOPS.
  process.env.TRUSTED_PROXY_HOPS = '1';
  assert.equal(getClientIp(req({ 'x-client-ip': CLIENT, 'x-forwarded-for': `${SPOOF}` })), CLIENT);
});

test('CLIENT_IP_HEADER: missing or garbage is unknown; appended-to takes the right-most', () => {
  process.env.CLIENT_IP_HEADER = 'x-client-ip';
  assert.equal(getClientIp(req({ 'x-forwarded-for': SPOOF })), 'unknown');
  assert.equal(getClientIp(req({ 'x-client-ip': 'not-an-ip' })), 'unknown');
  assert.equal(getClientIp(req({ 'x-client-ip': `${SPOOF}, ${CLIENT}` })), CLIENT);
});
