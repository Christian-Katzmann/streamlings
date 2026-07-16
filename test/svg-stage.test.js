import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  BUDGET_BYTES,
  buildSchedule,
  createBubbleEncoder,
  createStripStore,
  renderStageSVG,
} from '../server/svg-stage.js';

const wake = { id: 'wake', key: 'wake', frames: 16, fps: 12 };
const idles = [1, 2, 3].map(id => ({ id: `idle${id}`, key: `idle${id}`, frames: 16, fps: 12 }));

function fakePet(clips = idles) {
  let cursor = 0;
  return {
    scene: () => ({ clip: wake }),
    pickIdle: () => clips[cursor++ % clips.length],
  };
}

function assertStructurallyWellFormed(xml) {
  const stack = [];
  const tags = xml.match(/<\/?[A-Za-z][^>]*>/g) || [];
  for (const tag of tags) {
    const name = tag.match(/^<\/?([A-Za-z][\w:-]*)/)[1];
    if (tag.startsWith('</')) assert.equal(stack.pop(), name, `unexpected ${tag}`);
    else if (!tag.endsWith('/>')) stack.push(name);
  }
  assert.deepEqual(stack, []);
}

test('schedule wakes first, lasts five minutes, and uses whole clip loops', () => {
  const schedule = buildSchedule(fakePet());
  assert.equal(schedule[0].clip, wake);
  assert.ok(schedule.reduce((sum, segment) => sum + segment.seconds, 0) >= 300);
  for (const segment of schedule) {
    const loops = segment.seconds / (segment.frameCount / segment.clip.fps);
    assert.ok(Math.abs(loops - Math.round(loops)) < 1e-9, `${segment.clip.key} is not loop-aligned`);
  }
});

test('a one-clip library terminates', () => {
  const only = { id: 'only', key: 'only', frames: 12, fps: 12 };
  const pet = { scene: () => ({ clip: only }), pickIdle: () => only };
  const schedule = buildSchedule(pet);
  assert.ok(schedule.length > 1);
  assert.ok(schedule.reduce((sum, segment) => sum + segment.seconds, 0) >= 300);
});

test('a 23:00 UTC schedule draws its idle segments from the sleep pool', () => {
  const sleep = { id: 'sleep', key: 'sleep', frames: 12, fps: 12, spawn: 'common' };
  const pet = {
    scene: () => ({ clip: wake }),
    pickIdle: ({ night }) => {
      assert.equal(night, true);
      return sleep;
    },
  };
  const schedule = buildSchedule(pet, {
    minSeconds: 20,
    now: () => new Date('2026-07-16T23:00:00Z'),
    rareChance: 0,
  });
  assert.ok(schedule.length > 1);
  assert.ok(schedule.slice(1).every(segment => segment.clip === sleep));
});

test('the rare roll places a rare clip prominently after the opening', () => {
  const rare = { id: 'rare', key: 'rare', frames: 12, fps: 12, spawn: 'rare' };
  const pet = {
    scene: () => ({ clip: wake }),
    pickRare: () => rare,
    pickIdle: () => idles[0],
  };
  const schedule = buildSchedule(pet, { minSeconds: 20, random: () => 0 });
  assert.equal(schedule[1].clip, rare);
});

test('renderer stays within budget, is complete XML, and resolves every use through defs', () => {
  const schedule = buildSchedule(fakePet(), { minSeconds: 300, maxClips: 3 });
  const pixel = 'data:image/png;base64,iVBORw0KGgo=';
  const svg = renderStageSVG(schedule, { stripDataURI: () => pixel });

  assert.ok(Buffer.byteLength(svg) <= BUDGET_BYTES);
  assert.match(svg, /^<svg /);
  assert.ok(svg.endsWith('</svg>'));
  assertStructurallyWellFormed(svg);

  const defined = new Set([...svg.matchAll(/<image id="([^"]+)"/g)].map(match => match[1]));
  const used = [...svg.matchAll(/<use href="#([^"]+)"/g)].map(match => match[1]);
  assert.ok(used.length >= schedule.length);
  for (const id of used) assert.ok(defined.has(id), `${id} is missing from defs`);
});

test('the visible bubble is traceable in SVG accessibility text', () => {
  const schedule = buildSchedule(fakePet(), { minSeconds: 10, rareChance: 0 });
  const svg = renderStageSVG(schedule, {
    stripDataURI: () => 'data:image/png;base64,iVBORw0KGgo=',
    bubbleDataURI: () => ({ uri: 'data:image/png;base64,iVBORw0KGgo=', w: 10, h: 10 }),
    bubble: { text: 'thank you @octo ★', segmentIndex: 1 },
  });
  assert.match(svg, /<title>Momó says: thank you @octo ★<\/title>/);
});

test('strip store writes a horizontal PNG and reuses its disk cache', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'streamlings-strips-'));
  const clip = { key: 'fixture', frames: 2 };
  const frames = [new Uint8Array([0, 1]), new Uint8Array([1, 0])];
  const pet = {
    palette: [[255, 255, 255], [0, 0, 0]],
    width: 2,
    height: 1,
    loadFrames: () => frames,
  };

  try {
    const store = createStripStore(pet, { dataDir });
    const first = store.bytesFor(clip, 2);
    const png = PNG.sync.read(first);
    assert.equal(png.width, 4);
    assert.equal(png.height, 1);

    const diskOnly = createStripStore({ ...pet, loadFrames: () => { throw new Error('cache miss'); } }, { dataDir });
    assert.deepEqual(diskOnly.bytesFor(clip, 2), first);
    assert.match(store.dataURI(clip, 2), /^data:image\/png;base64,/);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('bubble encoder produces a cropped transparent PNG card', () => {
  const composer = {
    bubble(indexed, width) {
      indexed[2 * width + 3] = 1;
      indexed[2 * width + 4] = 0;
    },
  };
  const encode = createBubbleEncoder(composer, [[255, 255, 255], [0, 0, 0]]);
  const result = encode('hi');
  const png = PNG.sync.read(Buffer.from(result.uri.split(',')[1], 'base64'));
  const alphas = [...png.data].filter((_, index) => index % 4 === 3);
  assert.ok(alphas.includes(0));
  assert.ok(alphas.includes(255));
  assert.equal(result.w, png.width);
  assert.equal(result.h, png.height);
});
