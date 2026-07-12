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
const sanitizeLogin = s => String(s || 'someone').replace(/[^A-Za-z0-9-]/g, '').slice(0, 28) || 'someone';
const sanitizeText = s => String(s || '').replace(/[^A-Za-z0-9 .,!?@:#'()+*-]/g, '').slice(0, 60);

export function handleEvent(event, payload, pet, ledger, save) {
  const login = sanitizeLogin(payload.sender?.login);
  switch (event) {
    case 'star':
      if (payload.action !== 'created') return 'ignored';
      ledger.metab.stars++;
      ledger.recent.push({ kind: 'star', login, at: Date.now() });
      pet.celebrate('star', login);
      break;
    case 'fork':
      ledger.metab.forks++;
      ledger.recent.push({ kind: 'fork', login, at: Date.now() });
      pet.celebrate('fork', login);
      break;
    case 'push': {
      const n = Array.isArray(payload.commits) ? payload.commits.length : 0;
      if (!n) return 'ignored';
      ledger.metab.commits += n;
      pet.react('build');
      break;
    }
    case 'issues': {
      if (payload.action !== 'opened') return 'ignored';
      const title = String(payload.issue?.title || '');
      if (!/^whisper[:\s]/i.test(title)) return 'ignored';
      const text = sanitizeText(title.replace(/^whisper[:\s]+/i, ''));
      ledger.metab.whispers++;
      ledger.recent.push({ kind: 'whisper', login, at: Date.now() });
      pet.react('whisper', text ? `@${login} said ${text}` : `a whisper from @${login}!`);
      break;
    }
    case 'dependabot_alert': {
      const a = payload.action;
      // fleas is its own flag — independent of CI weather, so neither clobbers the other
      if (a === 'created' || a === 'reopened' || a === 'reintroduced') pet.setFlag('fleas', true);
      else if (['fixed', 'dismissed', 'auto_dismissed'].includes(a)) pet.setFlag('fleas', false);
      break;
    }
    case 'workflow_run': {
      if (payload.action !== 'completed') return 'ignored';
      if (payload.workflow_run?.head_branch !== 'main') return 'ignored';
      const concl = payload.workflow_run?.conclusion;
      if (concl === 'failure') pet.setFlag('ciRed', true);
      else if (concl === 'success' && pet.flags.ciRed) { pet.setFlag('ciRed', false); pet.react('play', 'the build is green again!'); }
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
