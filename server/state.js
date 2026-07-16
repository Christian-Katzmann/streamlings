import { sanitizeLogin } from './hooks.js';

const SLOT_BY_KIND = {
  star: 'social',
  fork: 'social',
  whisper: 'whisper',
  feed: 'action',
  pat: 'action',
  play: 'action',
  wake: 'action',
  build: 'build',
};
const SLOT_ORDER = ['social', 'whisper', 'action', 'build'];

export function ensureState(ledger) {
  ledger.features ||= {};
  ledger.milestones ||= { starsHighWater: 0, unlockedSpawns: [], reached: [] };
  ledger.milestones.unlockedSpawns ||= [];
  ledger.milestones.reached ||= [];

  // One-time migration from the v3 single-feature shape.
  if (ledger.featured) {
    const slot = SLOT_BY_KIND[ledger.featured.kind] || 'action';
    ledger.features[slot] ||= { ...ledger.featured, slot };
    delete ledger.featured;
  }
  return ledger;
}

export function storeFeature(ledger, featured, { focus = false } = {}) {
  ensureState(ledger);
  const slot = SLOT_BY_KIND[featured.kind] || 'action';
  const stored = { ...featured, slot };
  ledger.features[slot] = stored;
  if (focus) ledger.featureFocus = slot;
  else if (ledger.featureFocus && SLOT_ORDER.indexOf(slot) < SLOT_ORDER.indexOf(ledger.featureFocus)) delete ledger.featureFocus;
  return stored;
}

// A feed/pat/play can take the next frame without deleting a higher-priority
// thank-you. After that one focused delivery, normal priority order resumes.
export function selectFeature(ledger, { now = Date.now(), consumeFocus = false } = {}) {
  ensureState(ledger);
  for (const [slot, featured] of Object.entries(ledger.features)) {
    if (!featured || featured.until <= now) delete ledger.features[slot];
  }

  const focused = ledger.features[ledger.featureFocus];
  if (focused) {
    if (consumeFocus) delete ledger.featureFocus;
    return focused;
  }
  delete ledger.featureFocus;
  return SLOT_ORDER.map(slot => ledger.features[slot]).find(Boolean) || null;
}

export function chooseIdleBubble(ledger, { random = Math.random } = {}) {
  ensureState(ledger);
  const reached = ledger.milestones.reached.filter(Number.isFinite).sort((a, b) => b - a);
  const recent = ledger.recent.slice(-1)[0];
  const options = [];

  if (recent) {
    const login = sanitizeLogin(recent.login);
    if (recent.kind === 'star') options.push(`still thinking about @${login}'s star ★`);
    else if (recent.kind === 'fork') options.push(`still thinking about @${login}'s little one`);
    else if (recent.kind === 'whisper') options.push(`still thinking about @${login}'s whisper`);
  }
  const meals = Math.max(0, Number(ledger.totals?.feed) || 0);
  if (meals) options.push(`ate ${meals} ${meals === 1 ? 'meal' : 'meals'} so far`);

  const roll = random();
  if (reached.length && roll < 0.08) return `Momó has ${reached[0]} stars ★`;
  if (options.length && roll < 0.25) return options[Math.floor(random() * options.length)];
  return null;
}
