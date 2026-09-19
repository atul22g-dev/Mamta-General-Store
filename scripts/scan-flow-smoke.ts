/**
 * Smoke tests for the scan-flow seams: the in-memory scan session and the
 * visual-match service contract (no AI configured yet).
 * Run: npx tsx scripts/scan-flow-smoke.ts
 */
import assert from 'node:assert/strict';

import { scanSession } from '../src/lib/scan-session';
import {
  submitForMatching,
  fetchMatchResult,
  isVisualMatchConfigured,
  VISUAL_MATCH_NOT_CONFIGURED_MESSAGE,
} from '../src/lib/visual-match/service';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`✗ ${name}\n  ${(error as Error).message}`);
  }
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`✗ ${name}\n  ${(error as Error).message}`);
  }
}

// --- scanSession ---
test('session starts empty', () => {
  scanSession.clearShot();
  assert.equal(scanSession.getShot(), null);
});

test('setShot stores uri + timestamp', () => {
  const before = Date.now();
  const shot = scanSession.setShot('file:///photo.jpg');
  assert.equal(shot.uri, 'file:///photo.jpg');
  assert.ok(shot.capturedAt >= before && shot.capturedAt <= Date.now());
  assert.equal(scanSession.getShot()?.uri, 'file:///photo.jpg');
});

test('setShot overwrites the previous shot (single-photo flow)', () => {
  scanSession.setShot('file:///a.jpg');
  scanSession.setShot('file:///b.jpg');
  assert.equal(scanSession.getShot()?.uri, 'file:///b.jpg');
});

test('clearShot empties the session', () => {
  scanSession.setShot('file:///c.jpg');
  scanSession.clearShot();
  assert.equal(scanSession.getShot(), null);
});

// --- visual-match service ---
test('matcher is reported as not configured', () => {
  assert.equal(isVisualMatchConfigured, false);
});

test('submitForMatching: empty uri rejected', async () => {
  const result = await submitForMatching({ imageUri: '   ' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error.length > 0);
});

test('submitForMatching: valid photo → not-configured (honest state)', async () => {
  const result = await submitForMatching({
    imageUri: 'file:///photo.jpg',
    capturedAt: Date.now(),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.status, 'not-configured');
    assert.equal(result.data.requestId, undefined);
  }
});

test('fetchMatchResult: failed with explanatory message while unconfigured', async () => {
  const result = await fetchMatchResult('req_123');
  assert.equal(result.status, 'failed');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.error, VISUAL_MATCH_NOT_CONFIGURED_MESSAGE);
});

scanSession.clearShot();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
