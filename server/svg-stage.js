// Endless SVG delivery for GitHub Camo. Motion is CSS-only: Camo permits inline
// styles and data-URI images, but no scripts, external images, or fonts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

export const FRAME_W = 400;
export const FRAME_H = 400;
export const BUDGET_BYTES = 1_500_000;

export class StageBudgetError extends Error {
  constructor(bytes) {
    super(`stage.svg over budget: ${bytes}B > ${BUDGET_BYTES}B`);
    this.name = 'StageBudgetError';
    this.bytes = bytes;
  }
}

// Wake is always first. Every segment is a whole number of film loops, so both
// the clip and the master timeline return to a clean frame boundary.
export function buildSchedule(pet, { minSeconds = 300, maxClips = 8, frameCap = 16 } = {}) {
  if (minSeconds <= 0 || maxClips < 1 || frameCap < 1) throw new Error('invalid stage schedule options');

  const segments = [];
  const used = new Map();
  let total = 0;
  let previous = null;

  const add = (clip) => {
    if (!clip) throw new Error('stage schedule has no clip');
    const frameCount = Math.max(1, Math.min(frameCap, Number(clip.frames) || 1));
    const fps = Number(clip.fps) || 12;
    if (fps <= 0) throw new Error(`invalid fps for ${clip.key}`);
    const loopSeconds = frameCount / fps;
    const loops = Math.max(2, Math.min(4, Math.round(6 / loopSeconds)));
    const seconds = loops * loopSeconds;
    segments.push({ clip, frameCount, loops, loopSeconds, seconds });
    used.set(clip.key, clip);
    total += seconds;
    previous = clip;
  };

  add(pet.scene('wake').clip);
  while (total < minSeconds) {
    let clip = pet.pickIdle();
    // Avoid immediate repeats when possible, without hanging on a one-clip library.
    for (let tries = 0; clip === previous && tries < 8; tries++) clip = pet.pickIdle();
    if (!used.has(clip.key) && used.size >= maxClips) {
      const paidFor = [...used.values()];
      clip = paidFor[Math.floor(Math.random() * paidFor.length)];
    }
    add(clip);
  }

  return segments;
}

export function renderStageSVG(segments, {
  paper = '#f6f1e7',
  stripDataURI,
  bubble = null,
  bubbleDataURI,
} = {}) {
  if (!segments.length) throw new Error('stage schedule is empty');
  if (typeof stripDataURI !== 'function') throw new Error('stripDataURI is required');

  const duration = segments.reduce((sum, segment) => sum + segment.seconds, 0);
  const percent = seconds => +((seconds / duration) * 100).toFixed(4);
  const strips = new Map();

  for (const segment of segments) {
    const key = `${segment.clip.key}:${segment.frameCount}`;
    if (!strips.has(key)) {
      strips.set(key, {
        id: `strip${strips.size}`,
        uri: stripDataURI(segment.clip, segment.frameCount),
        frameCount: segment.frameCount,
      });
    }
  }

  const css = [];
  const body = [];
  let elapsed = 0;

  segments.forEach((segment, index) => {
    const strip = strips.get(`${segment.clip.key}:${segment.frameCount}`);
    const start = percent(elapsed);
    const end = percent(elapsed + segment.seconds);
    const loopSeconds = segment.loopSeconds.toFixed(4);
    const epsilon = 0.001;
    const visible = `${start === 0 ? 0 : (start + epsilon).toFixed(4)}%, ${end >= 100 ? 100 : end}% { opacity: 1 }`;

    css.push(`@keyframes vis${index} { ${start > 0 ? `0%, ${start}% { opacity: 0 } ` : ''}${visible}${end < 100 ? ` ${(end + epsilon).toFixed(4)}%, 100% { opacity: 0 }` : ''} }`);
    css.push(`.s${index} { opacity: ${index === 0 ? 1 : 0}; animation: vis${index} ${duration.toFixed(3)}s linear infinite; }`);
    css.push(`.f${index} { animation-name: film-${strip.id}; animation-duration: ${loopSeconds}s; animation-timing-function: steps(${segment.frameCount}); animation-delay: ${elapsed.toFixed(3)}s; animation-iteration-count: infinite; }`);
    body.push(`<g class="s${index}"><g class="f${index}"><use href="#${strip.id}"/></g></g>`);
    elapsed += segment.seconds;
  });

  for (const strip of strips.values()) {
    css.push(`@keyframes film-${strip.id} { to { transform: translateX(-${FRAME_W * strip.frameCount}px) } }`);
  }

  if (bubble) {
    if (typeof bubbleDataURI !== 'function') throw new Error('bubbleDataURI is required for a bubble');
    const card = bubbleDataURI(bubble.text);
    const at = Math.max(0, Math.min(duration, bubble.at ?? 1.5));
    const until = Math.max(at, Math.min(duration, at + (bubble.seconds ?? 6)));
    const start = percent(at);
    const end = percent(until);
    css.push(`@keyframes visBubble { 0%, ${start}% { opacity: 0 } ${(start + 0.001).toFixed(4)}%, ${end}% { opacity: 1 } ${(end + 0.001).toFixed(4)}%, 100% { opacity: 0 } }`);
    css.push(`.bubble { opacity: 0; animation: visBubble ${duration.toFixed(3)}s linear infinite; }`);
    body.push(`<image class="bubble" x="${FRAME_W - card.w - 12}" y="12" width="${card.w}" height="${card.h}" href="${card.uri}"/>`);
  }

  css.push('@media (prefers-reduced-motion: reduce) { * { animation: none !important } }');
  const defs = [...strips.values()]
    .map(strip => `<image id="${strip.id}" width="${FRAME_W * strip.frameCount}" height="${FRAME_H}" href="${strip.uri}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}" role="img" aria-label="Momó, an animated pet">` +
    `<style>${css.join('\n')}</style>` +
    `<defs>${defs}</defs>` +
    `<rect width="${FRAME_W}" height="${FRAME_H}" fill="${paper}"/>` +
    body.join('') +
    '</svg>';

  const bytes = Buffer.byteLength(svg);
  if (bytes > BUDGET_BYTES) throw new StageBudgetError(bytes);
  return svg;
}

// PNG strips are immutable across requests and shared with the Aquarium. The
// key deliberately contains only the clip, frame count, and palette hash.
export function createStripStore(pet, { dataDir }) {
  const paletteHash = crypto.createHash('sha256').update(JSON.stringify(pet.palette)).digest('hex').slice(0, 16);
  const cacheDir = path.join(dataDir, 'strips', paletteHash);
  const memory = new Map();
  fs.mkdirSync(cacheDir, { recursive: true });

  const normalizedCount = (clip, requested) => Math.max(1, Math.min(Number(requested) || 1, Number(clip.frames) || 1));
  const keyFor = (clip, frameCount) => `${clip.key}:${normalizedCount(clip, frameCount)}:${paletteHash}`;
  const fileFor = (clip, frameCount) => {
    const safeKey = String(clip.key).replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(cacheDir, `${safeKey}-${normalizedCount(clip, frameCount)}.png`);
  };

  function bytesFor(clip, requestedCount) {
    const count = normalizedCount(clip, requestedCount);
    const key = keyFor(clip, count);
    if (memory.has(key)) return memory.get(key);

    const file = fileFor(clip, count);
    if (fs.existsSync(file)) {
      const bytes = fs.readFileSync(file);
      memory.set(key, bytes);
      return bytes;
    }

    const frames = pet.loadFrames(clip);
    if (frames.length < count) throw new Error(`${clip.key} has ${frames.length} frames, expected ${count}`);
    const width = pet.width;
    const height = pet.height;
    const png = new PNG({ width: width * count, height });

    for (let frameIndex = 0; frameIndex < count; frameIndex++) {
      const frame = frames[frameIndex];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const color = pet.palette[frame[y * width + x]] || [0, 0, 0];
          const offset = (y * png.width + frameIndex * width + x) * 4;
          png.data[offset] = color[0];
          png.data[offset + 1] = color[1];
          png.data[offset + 2] = color[2];
          png.data[offset + 3] = 255;
        }
      }
    }

    const bytes = PNG.sync.write(png);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, file);
    memory.set(key, bytes);
    return bytes;
  }

  return {
    cacheDir,
    paletteHash,
    keyFor,
    fileFor,
    bytesFor,
    dataURI: (clip, frameCount) => `data:image/png;base64,${bytesFor(clip, frameCount).toString('base64')}`,
  };
}

// Composer draws the same hand-lettered bubble used by GIFs into an indexed
// scratch card. Untouched pixels become transparent in the cropped PNG.
export function createBubbleEncoder(composer, palette) {
  if (palette.length >= 256) throw new Error('bubble encoder needs one transparent palette sentinel');
  const transparent = 255;
  const memory = new Map();

  return function bubbleDataURI(text) {
    const message = String(text || 'oh, hello!');
    if (memory.has(message)) return memory.get(message);

    const width = FRAME_W;
    const height = 180;
    const indexed = new Uint8Array(width * height).fill(transparent);
    composer.bubble(indexed, width, height, message);

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (indexed[y * width + x] !== transparent) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    if (maxX < 0) throw new Error('composer produced an empty bubble');

    const pad = 2;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
    const card = new PNG({ width: maxX - minX + 1, height: maxY - minY + 1 });
    for (let y = 0; y < card.height; y++) for (let x = 0; x < card.width; x++) {
      const colorIndex = indexed[(minY + y) * width + minX + x];
      const offset = (y * card.width + x) * 4;
      if (colorIndex === transparent) {
        card.data[offset + 3] = 0;
      } else {
        const color = palette[colorIndex] || [0, 0, 0];
        card.data[offset] = color[0];
        card.data[offset + 1] = color[1];
        card.data[offset + 2] = color[2];
        card.data[offset + 3] = 255;
      }
    }

    const bytes = PNG.sync.write(card);
    const result = { uri: `data:image/png;base64,${bytes.toString('base64')}`, w: card.width, h: card.height };
    memory.set(message, result);
    return result;
  };
}

export function buildStageDocument(pet, {
  stripDataURI,
  bubbleDataURI,
  bubble = null,
  paper = '#f6f1e7',
  minSeconds = 300,
  maxClips = 8,
  frameCap = 16,
} = {}) {
  let lastBudgetError;
  for (let uniqueClips = maxClips; uniqueClips >= 1; uniqueClips--) {
    const segments = buildSchedule(pet, { minSeconds, maxClips: uniqueClips, frameCap });
    try {
      const svg = renderStageSVG(segments, { paper, stripDataURI, bubble, bubbleDataURI });
      return { svg, segments, uniqueClips };
    } catch (error) {
      if (!(error instanceof StageBudgetError)) throw error;
      lastBudgetError = error;
    }
  }
  throw lastBudgetError;
}
