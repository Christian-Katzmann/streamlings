import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleEvent } from '../server/hooks.js';
import { Pet } from '../server/pet.js';
import { chooseIdleBubble, selectFeature, storeFeature } from '../server/state.js';

test('an action gets one focused delivery without erasing a live social feature', () => {
  const now = 1_000;
  const ledger = {};
  storeFeature(ledger, { kind: 'star', bubble: 'thank you @octo ★', until: now + 30 * 60_000 });
  storeFeature(ledger, { kind: 'feed', bubble: 'nom nom', until: now + 60_000 }, { focus: true });

  assert.equal(selectFeature(ledger, { now, consumeFocus: true }).kind, 'feed');
  assert.equal(selectFeature(ledger, { now: now + 1 }).kind, 'star');
  assert.equal(ledger.features.social.bubble, 'thank you @octo ★');
});

test('memory bubbles sanitize persisted visitor names', () => {
  const ledger = {
    recent: [{ kind: 'star', login: '<script>@octo</script>' }],
    totals: { feed: 3 },
  };
  const rolls = [0.1, 0];
  const bubble = chooseIdleBubble(ledger, { random: () => rolls.shift() });
  assert.equal(bubble, "still thinking about @scriptoctoscript's star ★");
  assert.doesNotMatch(bubble, /[<>]/);
});

test('reached star milestones occasionally surface in idle bubbles', () => {
  const bubble = chooseIdleBubble({
    milestones: { starsHighWater: 27, unlockedSpawns: ['uncommon', 'rare'], reached: [5, 25] },
    recent: [],
    totals: {},
  }, { random: () => 0 });
  assert.equal(bubble, 'Momó has 25 stars ★');
});

test('star high-water unlocks milestone clips and survives a restart', async () => {
  const assetDir = await mkdtemp(path.join(tmpdir(), 'streamlings-milestone-'));
  const ledgerPath = path.join(assetDir, 'ledger.json');
  const manifest = [
    { id: 'common', key: 'common', frames: 1, fps: 12, spawn: 'common', state_hint: 'idle' },
    { id: 'uncommon', key: 'uncommon', frames: 1, fps: 12, spawn: 'uncommon', state_hint: 'special' },
    { id: 'rare', key: 'rare', frames: 1, fps: 12, spawn: 'rare', state_hint: 'sleep' },
  ];
  await writeFile(path.join(assetDir, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(assetDir, 'palette.json'), JSON.stringify({ palette: [[255, 255, 255]], ink: 0, paper: 0 }));

  try {
    const ledger = { metab: { stars: 99 }, recent: [], milestones: { starsHighWater: 0, unlockedSpawns: [], reached: [] } };
    const pet = new Pet(assetDir, {}, { unlockedSpawns: [] });
    handleEvent('star', {
      action: 'created',
      sender: { login: 'octo' },
      repository: { stargazers_count: 25 },
    }, pet, ledger, () => {});

    assert.equal(ledger.milestones.starsHighWater, 25);
    assert.deepEqual(ledger.milestones.unlockedSpawns, ['uncommon', 'rare']);
    assert.ok(pet.pools.idle.some(clip => clip.id === 'rare'));

    await writeFile(ledgerPath, JSON.stringify(ledger));
    const restartedLedger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    const restartedPet = new Pet(assetDir, {}, { unlockedSpawns: restartedLedger.milestones.unlockedSpawns });
    assert.ok(restartedPet.pools.idle.some(clip => clip.id === 'rare'));
  } finally {
    await rm(assetDir, { recursive: true, force: true });
  }
});
