import assert from 'node:assert/strict';
import test from 'node:test';
import { DATABASE_POOL_POLICY } from '../dist/index.js';

test('database pool policy stays bounded and long-lived-process safe', () => {
  assert.deepEqual(DATABASE_POOL_POLICY, {
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
});
