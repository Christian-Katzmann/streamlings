// REFERENCE IMPLEMENTATION · momo-comes-alive · Step 2.1. Not the target file — do not edit; this is the bar to match.
// Shows: the endless-SVG stage — one complete SVG document that animates indefinitely on
//   github.com, because all motion is client-side CSS and Camo only ever proxies a small
//   text file. This is what replaces the 64-second GIF ceiling.
// Non-obvious (the reasons this is shaped the way it is):
//   · <defs> + <use> dedup is the entire economic argument: episode length is decoupled
//     from byte size. A 10-minute schedule reusing 8 clips costs the same bytes as 8 strips.
//   · Each segment's film animation gets animation-delay = segment start. Before the delay
//     the element's UNANIMATED pose is translateX(0) = frame 0, so no fill-mode is needed
//     and every clip enters on its first frame.
//   · Segment durations are integer multiples of the clip's loop period (frames/fps), so
//     when the master timeline wraps at 100% the film phase realigns exactly — otherwise
//     pass 2+ of the episode enters clips mid-loop and drifts forever.
//   · steps(N) pairs with translateX(-frameW*N): frames 0..N-1 each get one step. Using
//     N-1 in either place is the off-by-one that silently eats the last frame.
//   · Visibility via opacity, never display:none — CSS animations advance identically on
//     opacity-hidden elements in all engines; display swaps have replay quirks.
//   · The UNANIMATED document doubles as the static fallback: seg 0 (the wake pose) has
//     base opacity 1, everything else 0. Renderers that don't run CSS animations (some
//     native apps, email) show a clean greeting, not a random mid-frame.
//   · Camo's measured CSP for SVG: `default-src 'none'; img-src data:; style-src
//     'unsafe-inline'`. Data-URI images and inline <style> only — no fonts (glyph-atlas
//     PNGs carry all text, same as the GIF pipeline), no scripts, no external refs.
// Yours to decide: strip PNG encoding + disk caching (contract stubbed below), bubble
//   cards via the existing composer glyph atlas, and the /stage.svg route + how the size
//   budget degrades (fewer unique clips, not a truncated document).

const FRAME_W = 400;
const FRAME_H = 400;
const BUDGET_BYTES = 1_500_000; // keep well under Camo's transfer ceiling; measured GIFs ran ~0.9MB

// ---------------------------------------------------------------------------
// Schedule: a list of segments, each { clip, frameCount, loops } — total time is
// implied. Wake comes first: a drive-by visitor's first seconds must read as a
// greeting, and the static fallback shows exactly this pose.
// ---------------------------------------------------------------------------
export function buildSchedule(pet, { minSeconds = 300, maxClips = 8, frameCap = 16 } = {}) {
  const segments = [];
  const used = new Set();
  let total = 0;
  let prev = null;

  const add = (clip) => {
    const frameCount = Math.min(frameCap, clip.frames);
    const loopS = frameCount / (clip.fps || 12);
    // 2–4 loops per visit keeps a beat long enough to register but never wallpaper-static
    const loops = Math.max(2, Math.min(4, Math.round(6 / loopS)));
    segments.push({ clip, frameCount, loops, seconds: loops * loopS });
    used.add(clip.key);
    total += loops * loopS;
    prev = clip;
  };

  add(pet.scene('wake').clip);
  while (total < minSeconds) {
    // no immediate repeats — but only as a bounded preference, never a spin-wait:
    // a sparse library (the test fixture has ONE idle clip) must still terminate
    let clip = pet.pickIdle();
    for (let tries = 0; clip === prev && tries < 8; tries++) clip = pet.pickIdle();
    if (!used.has(clip.key) && used.size >= maxClips) {
      // at the byte cap, reuse an already-paid-for strip — a fresh one costs full weight
      const keys = [...used];
      clip = segments.find(s => s.clip.key === keys[Math.floor(Math.random() * keys.length)]).clip;
    }
    add(clip);
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Renderer: schedule → complete SVG text. Strip/bubble encoders are injected so
// this stays a pure function of its inputs (and trivially testable).
// ---------------------------------------------------------------------------
export function renderStageSVG(segments, { paper = '#f6f1e7', stripDataURI, bubble = null, bubbleDataURI } = {}) {
  const T = segments.reduce((a, s) => a + s.seconds, 0);
  const pct = (s) => +((s / T) * 100).toFixed(4);

  // one strip per unique clip, defined once, <use>d per segment
  const strips = new Map();
  for (const seg of segments) {
    if (!strips.has(seg.clip.key)) {
      strips.set(seg.clip.key, {
        id: `strip${strips.size}`,
        uri: stripDataURI(seg.clip, seg.frameCount),
        frameCount: seg.frameCount,
      });
    }
  }

  const css = [];
  const body = [];
  let t = 0;
  segments.forEach((seg, i) => {
    const strip = strips.get(seg.clip.key);
    const a = pct(t), b = pct(t + seg.seconds);
    const loopS = (seg.frameCount / (seg.clip.fps || 12)).toFixed(4);

    // visibility window on the master timeline; boundaries snap to 0/100 exactly
    const eps = 0.001;
    const on = `${a === 0 ? 0 : (a + eps).toFixed(4)}%, ${b >= 100 ? 100 : b}% { opacity: 1 }`;
    css.push(`@keyframes vis${i} { ${a > 0 ? `0%, ${a}% { opacity: 0 } ` : ''}${on}${b < 100 ? ` ${(b + eps).toFixed(4)}%, 100% { opacity: 0 }` : ''} }`);
    css.push(`.s${i} { opacity: ${i === 0 ? 1 : 0}; animation: vis${i} ${T.toFixed(3)}s linear infinite; }`);
    css.push(`.f${i} { animation-name: film-${strip.id}; animation-duration: ${loopS}s; animation-timing-function: steps(${seg.frameCount}); animation-delay: ${t.toFixed(3)}s; animation-iteration-count: infinite; }`);

    body.push(`<g class="s${i}"><g class="f${i}"><use href="#${strip.id}"/></g></g>`);
    t += seg.seconds;
  });

  for (const strip of strips.values()) {
    css.push(`@keyframes film-${strip.id} { to { transform: translateX(-${FRAME_W * strip.frameCount}px) } }`);
  }

  if (bubble) {
    // the bubble rides its own window near the start (after the wake beat lands)
    const { uri, w, h } = bubbleDataURI(bubble.text);
    const [ba, bb] = [pct(bubble.at), pct(bubble.at + bubble.seconds)];
    css.push(`@keyframes visBubble { 0%, ${ba}% { opacity: 0 } ${(ba + 0.001).toFixed(4)}%, ${bb}% { opacity: 1 } ${(bb + 0.001).toFixed(4)}%, 100% { opacity: 0 } }`);
    css.push(`.bubble { opacity: 0; animation: visBubble ${T.toFixed(3)}s linear infinite; }`);
    body.push(`<image class="bubble" x="${FRAME_W - w - 12}" y="12" width="${w}" height="${h}" href="${uri}"/>`);
  }

  // reduced-motion collapses to the static wake pose — the same graceful fallback
  css.push(`@media (prefers-reduced-motion: reduce) { * { animation: none !important } }`);

  const defs = [...strips.values()]
    .map(s => `<image id="${s.id}" width="${FRAME_W * s.frameCount}" height="${FRAME_H}" href="${s.uri}"/>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}">` +
    `<style>${css.join('\n')}</style>` +
    `<defs>${defs}</defs>` +
    `<rect width="${FRAME_W}" height="${FRAME_H}" fill="${paper}"/>` +
    body.join('') +
    `</svg>`;

  if (Buffer.byteLength(svg) > BUDGET_BYTES) {
    // degrade by shrinking the unique-clip set (rebuild with maxClips - 1), never by
    // truncating the document — Camo must always receive a complete, valid SVG
    throw new Error(`stage.svg over budget: ${Buffer.byteLength(svg)}B > ${BUDGET_BYTES}B — rebuild schedule with fewer unique clips`);
  }
  return svg;
}

// ---------------------------------------------------------------------------
// Stubs — the contracts the implementer fills in.
// ---------------------------------------------------------------------------

// Horizontal filmstrip PNG (frameCount frames side by side), base64 data URI.
// Encode from the same indexed frames pet.loadFrames() returns (palette → RGBA →
// pngjs). Cache the encoded strip on disk under DATA_DIR keyed by
// `${clip.key}:${frameCount}:${paletteHash}` — encoding is the expensive step and
// strips are immutable per build; the aquarium (Step 2.3) serves these same files.
export function stripDataURI(_clip, _frameCount) {
  throw new Error('stub — see header: implement with pngjs + disk cache');
}

// Transparent PNG speech-bubble card rendered from the existing composer glyph
// atlas (no fonts allowed under Camo's CSP). Returns { uri, w, h }.
export function bubbleDataURI(_text) {
  throw new Error('stub — see header: reuse Composer\'s glyph atlas');
}
