import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from './auth.crypto.js';

await test('password hashing verifies the original password and rejects a different password', async () => {
  const encoded = await hashPassword('correct horse battery staple');

  assert.equal(await verifyPassword('correct horse battery staple', encoded), true);
  assert.equal(await verifyPassword('wrong password', encoded), false);
  assert.match(encoded, /^scrypt-v1\$/);
});

await test('opaque session tokens are random and only deterministic after hashing', () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();

  assert.notEqual(first, second);
  assert.equal(hashOpaqueToken(first), hashOpaqueToken(first));
  assert.notEqual(hashOpaqueToken(first), hashOpaqueToken(second));
  assert.equal(first.length >= 40, true);
});
