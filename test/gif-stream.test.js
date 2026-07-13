import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeLoop, encodeEpisode } from '../server/gif-stream.js';

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

test('episode chains multiple scenes into one complete loop', () => {
  const palette = [[255, 255, 255], [0, 0, 0]];
  const a = { frames: [new Uint8Array([0, 0, 0, 0])], fps: 1 };
  const b = { frames: [new Uint8Array([1, 1, 1, 1])], fps: 1 };
  const gif = encodeEpisode([a, b], 2, 2, palette, { framesPerScene: 1 });
  assert.ok(gif.includes(Buffer.from('NETSCAPE2.0')));
  assert.equal(gif.at(-1), 0x3b);
  assert.ok(gif.length > encodeEpisode([a], 2, 2, palette, { framesPerScene: 1 }).length);
});
