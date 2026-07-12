import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeLoop } from '../server/gif-stream.js';

test('bounded GIF is complete and loops forever', () => {
  const palette = [[255, 255, 255], [0, 0, 0]];
  const frames = [new Uint8Array([0, 1, 1, 0]), new Uint8Array([1, 0, 0, 1])];
  const gif = encodeLoop(frames, 2, 2, palette, { fps: 2 });

  assert.equal(gif.subarray(0, 6).toString(), 'GIF89a');
  assert.ok(gif.includes(Buffer.from('NETSCAPE2.0')));
  assert.equal(gif.at(-1), 0x3b);
});

test('empty frame list is rejected', () => {
  assert.throws(() => encodeLoop([], 1, 1, [[0, 0, 0]]), /empty GIF/);
});
