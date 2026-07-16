// GitHub webhook receiver: HMAC-verified, translates repo events into pet events.
// Viewing is anonymous (Camo strips everything) — but ACTING is not: these payloads
// carry the actor's login, which is how Momó learns names.
import crypto from 'node:crypto';

export function verifySignature(secret, rawBody, sigHeader) {
  if (!sigHeader || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(sigHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GitHub logins are [A-Za-z0-9-], but never trust a payload with your glyph atlas
export const sanitizeLogin = s => String(s || 'someone').replace(/[^A-Za-z0-9-]/g, '').slice(0, 28) || 'someone';
export const sanitizeText = s => String(s || '').replace(/[^A-Za-z0-9 .,!?@:#'()+*-]/g, '').slice(0, 60);

export const STAR_MILESTONES = [
  { stars: 5, spawn: 'uncommon' },
  { stars: 25, spawn: 'rare' },
];

function applyStarMilestones(payload, pet, ledger) {
  ledger.milestones ||= { starsHighWater: 0, unlockedSpawns: [], reached: [] };
  const reported = Math.max(0, Number(payload.repository?.stargazers_count) || 0);
  ledger.milestones.starsHighWater = Math.max(ledger.milestones.starsHighWater || 0, reported);
  const reached = STAR_MILESTONES.filter(milestone => ledger.milestones.starsHighWater >= milestone.stars);
  ledger.milestones.reached = [...new Set([...(ledger.milestones.reached || []), ...reached.map(m => m.stars)])].sort((a, b) => a - b);
  ledger.milestones.unlockedSpawns = [...new Set([...(ledger.milestones.unlockedSpawns || []), ...reached.map(m => m.spawn)])];
  pet.setUnlockedSpawns?.(ledger.milestones.unlockedSpawns);
}

export function handleEvent(event, payload, pet, ledger, save, remember = () => {}) {
  const login = sanitizeLogin(payload.sender?.login);
  switch (event) {
    case 'star':
      if (payload.action !== 'created') return 'ignored';
      ledger.metab.stars++;
      ledger.recent.push({ kind: 'star', login, at: Date.now() });
      applyStarMilestones(payload, pet, ledger);
      remember('star', `thank you @${login} ★`, 'social');
      break;
    case 'fork':
      ledger.metab.forks++;
      ledger.recent.push({ kind: 'fork', login, at: Date.now() });
      remember('fork', `a little one! hi @${login}`, 'social');
      break;
    case 'push': {
      const n = Array.isArray(payload.commits) ? payload.commits.length : 0;
      if (!n) return 'ignored';
      ledger.metab.commits += n;
      remember('build', undefined, 'build');
      break;
    }
    case 'issues': {
      if (payload.action !== 'opened') return 'ignored';
      const title = String(payload.issue?.title || '');
      if (!/^whisper[:\s]/i.test(title)) return 'ignored';
      const text = sanitizeText(title.replace(/^whisper[:\s]+/i, ''));
      ledger.metab.whispers++;
      ledger.recent.push({ kind: 'whisper', login, at: Date.now() });
      remember('whisper', text ? `@${login} said ${text}` : `a whisper from @${login}!`, 'whisper');
      break;
    }
    case 'dependabot_alert': {
      const action = payload.action;
      const number = String(payload.alert?.number ?? 'unknown');
      ledger.alerts ||= {};
      if (action === 'created' || action === 'reopened' || action === 'reintroduced') ledger.alerts[number] = true;
      else if (['fixed', 'dismissed', 'auto_dismissed'].includes(action)) delete ledger.alerts[number];
      pet.setFlag('fleas', Object.keys(ledger.alerts).length > 0);
      break;
    }
    case 'workflow_run': {
      if (payload.action !== 'completed') return 'ignored';
      if (payload.workflow_run?.head_branch !== 'main') return 'ignored';
      if (payload.workflow_run?.name !== 'ci') return 'ignored';
      const concl = payload.workflow_run?.conclusion;
      if (concl === 'failure') pet.setFlag('ciRed', true);
      else if (concl === 'success' && pet.flags.ciRed) {
        pet.setFlag('ciRed', false);
        remember('play', 'the build is green again!', 'build');
      }
      break;
    }
    case 'ping':
      return 'pong';
    default:
      return 'ignored';
  }
  if (ledger.recent.length > 50) ledger.recent = ledger.recent.slice(-50);
  save();
  return 'ok';
}
