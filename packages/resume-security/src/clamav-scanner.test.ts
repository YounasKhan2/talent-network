import assert from 'node:assert/strict';
import test from 'node:test';
import { parseScanResponse } from './clamav-scanner.js';

void test('parses a clean ClamAV response', () => {
  assert.deepEqual(parseScanResponse('stream: OK\0'), {
    status: 'CLEAN',
    signature: null,
  });
});

void test('parses an infected ClamAV response and preserves the signature name', () => {
  assert.deepEqual(parseScanResponse('stream: Eicar-Signature FOUND\0'), {
    status: 'INFECTED',
    signature: 'Eicar-Signature',
  });
});

void test('treats unknown scanner responses as an error instead of clean', () => {
  assert.deepEqual(parseScanResponse('stream: scanner unavailable\0'), {
    status: 'ERROR',
    signature: null,
  });
});
