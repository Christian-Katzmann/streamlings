import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifySignature, handleEvent } from '../server/hooks.js';

function fixture() {
  const ledger = {
    metab: { commits: 0, stars: 0, forks: 0, whispers: 0, boops: 0 },
    recent: [],
    alerts: {},
  };
  const pet = { flags: { fleas: false, ciRed: false }, setFlag(name, on) { this.flags[name] = on; } };
  const remembered = [];
  return { ledger, pet, remembered };
}

test('signature verification rejects tampering', () => {
  const body = Buffer.from('{"ok":true}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(verifySignature('secret', body, sig), true);
  assert.equal(verifySignature('secret', Buffer.from('changed'), sig), false);
});

test('star stores a named durable reaction', () => {
  const { ledger, pet, remembered } = fixture();
  const result = handleEvent('star', { action: 'created', sender: { login: 'octo-user' } }, pet, ledger, () => {}, (...args) => remembered.push(args));
  assert.equal(result, 'ok');
  assert.equal(ledger.metab.stars, 1);
  assert.deepEqual(remembered, [['star', 'thank you @octo-user ★', 'social']]);
});

test('fork stores a named durable reaction', () => {
  const { ledger, pet, remembered } = fixture();
  const result = handleEvent('fork', { sender: { login: 'forker' } }, pet, ledger, () => {}, (...args) => remembered.push(args));
  assert.equal(result, 'ok');
  assert.equal(ledger.metab.forks, 1);
  assert.deepEqual(remembered, [['fork', 'a little one! hi @forker', 'social']]);
});

test('fixing one dependency alert does not clear another', () => {
  const { ledger, pet } = fixture();
  const send = (action, number) => handleEvent('dependabot_alert', { action, alert: { number }, sender: {} }, pet, ledger, () => {});
  send('created', 1);
  send('created', 2);
  send('fixed', 1);
  assert.equal(pet.flags.fleas, true);
  send('fixed', 2);
  assert.equal(pet.flags.fleas, false);
});
