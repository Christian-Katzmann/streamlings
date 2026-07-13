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
  return encodeEpisode([{ frames, fps, bubble }], width, height, palette, {
    framesPerScene: maxFrames,
    composer,
  });
}

export function encodeEpisode(scenes, width, height, palette, options = {}) {
  const { framesPerScene = 18, composer = null } = options;
  if (!scenes.length || scenes.some(scene => !scene.frames?.length)) {
    throw new Error('cannot encode an empty GIF');
  }

  const enc = GIFEncoder();
  let outputIndex = 0;

  for (const scene of scenes) {
    const count = Math.min(framesPerScene, scene.frames.length);
    const durationMs = scene.frames.length / (scene.fps || scene.clip?.fps || 12) * 1000;
    const delay = Math.max(20, Math.round(durationMs / count));
    for (let i = 0; i < count; i++) {
      const source = scene.frames[Math.floor(i * scene.frames.length / count)];
      const frame = scene.bubble ? source.slice() : source;
      if (scene.bubble) composer.bubble(frame, width, height, scene.bubble);
      const frameOptions = { delay, dispose: 1 };
      if (outputIndex++ === 0) Object.assign(frameOptions, { palette, repeat: 0 });
      enc.writeFrame(frame, width, height, frameOptions);
    }
  }
  enc.finish();
  return Buffer.from(enc.bytes());
}
