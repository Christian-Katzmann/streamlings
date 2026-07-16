import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAquariumCatalog, renderAquariumPage, touchStreak } from '../server/aquarium.js';

test('an action streak persists across a serialized restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'streamlings-streak-'));
  const ledgerPath = path.join(dir, 'ledger.json');
  const ledger = { feeders: { visitor: { feed: 1 } } };

  try {
    assert.deepEqual(touchStreak(ledger.feeders.visitor, new Date('2026-07-15T23:55:00Z')), {
      days: 1,
      lastDay: '2026-07-15',
    });
    await writeFile(ledgerPath, JSON.stringify(ledger));

    const restarted = JSON.parse(await readFile(ledgerPath, 'utf8'));
    assert.deepEqual(touchStreak(restarted.feeders.visitor, new Date('2026-07-16T00:05:00Z')), {
      days: 2,
      lastDay: '2026-07-16',
    });
    assert.equal(touchStreak(restarted.feeders.visitor, new Date('2026-07-16T22:00:00Z')).days, 2);
    assert.equal(touchStreak(restarted.feeders.visitor, new Date('2026-07-19T12:00:00Z')).days, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the visitors wall sanitizes hostile persisted logins and loads only same-origin resources', () => {
  const html = renderAquariumPage({
    feeders: {},
    recent: [{ kind: 'star', login: '<script src=https://evil.example/x>@octo</script>' }],
  });

  assert.match(html, /@scriptsrchttpsevilexamplexoc/);
  assert.doesNotMatch(html, /<script src=https:\/\/evil\.example/);
  const resourceURLs = [
    ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]),
    ...[...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(match => match[1]),
    ...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(match => match[1]),
  ];
  assert.deepEqual(resourceURLs, ['/aquarium-player.js']);
});

test('the Aquarium atlas exposes shared strip-store PNGs for idle and reaction clips', () => {
  const idle = { id: 'idle', key: 'idle-calm', frames: 60, fps: 12 };
  const feed = { id: 'feed', key: 'feed-nom', frames: 24, fps: 10 };
  const pet = {
    manifest: [idle, feed],
    pools: { idle: [idle] },
    clipsFor: kind => kind === 'feed' ? [feed] : [],
  };
  const catalog = createAquariumCatalog(pet, {}, { frameCap: 16 });

  assert.deepEqual(catalog.atlas['idle-calm'], {
    src: '/strips/idle-calm-16.png', frames: 16, fps: 12, idle: true, eager: true,
  });
  assert.deepEqual(catalog.atlas['feed-nom'], {
    src: '/strips/feed-nom-8.png', frames: 8, fps: 10, idle: false, eager: false,
  });
  assert.equal(catalog.strips.get('/strips/feed-nom-8.png').clip, feed);
});
