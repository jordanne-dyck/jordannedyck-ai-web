// Unit tests for reading the backend's /chat stream (lib/answer-engine.ts): npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineEvents } from '../lib/answer-engine.ts';

// A body that arrives in the given pieces, split wherever the network splits it.
const body = (...pieces) =>
  new ReadableStream({
    start(controller) {
      for (const p of pieces) controller.enqueue(new TextEncoder().encode(p));
      controller.close();
    },
  });

const read = async (stream) => {
  const events = [];
  for await (const e of engineEvents(stream)) events.push(e);
  return events;
};

test('one event per line, in order', async () => {
  const events = await read(body('{"type":"meta","fixed":null}\n{"type":"text","delta":"Hi"}\n{"type":"done"}\n'));
  assert.deepEqual(events.map((e) => e.type), ['meta', 'text', 'done']);
  assert.equal(events[1].delta, 'Hi');
});

test('a line split across chunks, and a multi-byte character split across chunks', async () => {
  const bytes = new TextEncoder().encode('{"type":"text","delta":"café — ok"}\n');
  const cut = bytes.indexOf(0xc3) + 1;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, cut));
      controller.enqueue(bytes.slice(cut));
      controller.close();
    },
  });
  const events = await read(stream);
  assert.deepEqual(events, [{ type: 'text', delta: 'café — ok' }]);
});

test('a last line without a newline still counts; blank lines are skipped', async () => {
  const events = await read(body('{"type":"meta"}\n\n', '{"type":"error","reason":"timeout","message":"The answer timed out."}'));
  assert.deepEqual(events.map((e) => e.type), ['meta', 'error']);
});

test('a delta carrying newlines stays one event', async () => {
  const events = await read(body(JSON.stringify({ type: 'text', delta: 'a\n\n{{timeline}}\n\nb' }) + '\n'));
  assert.equal(events.length, 1);
  assert.equal(events[0].delta, 'a\n\n{{timeline}}\n\nb');
});
