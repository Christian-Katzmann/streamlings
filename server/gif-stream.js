// Complete, self-looping GIFs for GitHub Camo.
//
// Camo closes upstream image fetches after ~4.3 seconds. A finished GIF generated
// quickly survives that boundary and loops in the browser; an endless GIF does not.
import gifencMod from 'gifenc';
let gifenc = gifencMod;
while (gifenc && !(gifenc.GIFEncoder && gifenc.quantize)) gifenc = gifenc.default;
const { GIFEncoder } = gifenc;

export function encodeLoop(frames, width, height, palette, options = {}) {
  const {
    fps = 12,
    maxFrames = 36,
    bubble = null,
    composer = null,
  } = options;
  if (!frames.length) throw new Error('cannot encode an empty GIF');

  const count = Math.min(maxFrames, frames.length);
  const durationMs = frames.length / fps * 1000;
  const delay = Math.max(20, Math.round(durationMs / count));
  const enc = GIFEncoder();

  for (let i = 0; i < count; i++) {
    const source = frames[Math.floor(i * frames.length / count)];
    const frame = bubble ? source.slice() : source;
    if (bubble) composer.bubble(frame, width, height, bubble);
    const frameOptions = { delay, dispose: 1 };
    if (i === 0) Object.assign(frameOptions, { palette, repeat: 0 });
    enc.writeFrame(frame, width, height, frameOptions);
  }
  enc.finish();
  return Buffer.from(enc.bytes());
}
