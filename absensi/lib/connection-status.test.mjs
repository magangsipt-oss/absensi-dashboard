import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConnectionStatus } from './connection-status.js';

test('parses online JSON status as connected', () => {
  assert.equal(parseConnectionStatus('{"status":"online"}'), 'Connected');
});

test('parses plain OK text as connected', () => {
  assert.equal(parseConnectionStatus('OK'), 'Connected');
});

test('treats failed or timeout text as offline', () => {
  assert.equal(parseConnectionStatus('timeout'), 'Offline');
  assert.equal(parseConnectionStatus('error'), 'Offline');
});
