/**
 * test-api.ts
 *
 * Tests the local backend REST API endpoints end-to-end.
 *
 * Requires the backend to be running (npm run dev or docker-compose up).
 *
 * Usage:
 *   npx tsx scripts/test-api.ts
 *   BASE_URL=http://localhost:3001 npx tsx scripts/test-api.ts
 */

import 'dotenv/config';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const API = `${BASE_URL}/api`;

// ─── Minimal test harness ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(label: string, detail?: string) {
  console.log(`  ✓ ${label}${detail ? `  →  ${detail}` : ''}`);
  passed++;
}

function fail(label: string, reason: string) {
  console.error(`  ✗ ${label}  →  ${reason}`);
  failed++;
}

async function section(name: string, fn: () => Promise<void>) {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 55 - name.length))}`);
  try {
    await fn();
  } catch (err) {
    fail(name, String(err));
  }
}

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function post(path: string, payload: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function isSuccess(body: unknown): body is { success: true; data: unknown } {
  return typeof body === 'object' && body !== null && (body as Record<string, unknown>).success === true;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

await section('Health check – GET /ping', async () => {
  const { status, body } = await get('/ping');
  if (status === 200) {
    pass('HTTP 200', JSON.stringify(body));
  } else {
    fail('Expected 200', `got ${status}`);
  }
  const b = body as Record<string, unknown>;
  if (b.status === 'ok') pass('status field is "ok"');
  else fail('status field', `expected "ok", got ${b.status}`);
  if (typeof b.ts === 'string') pass('timestamp field present', b.ts as string);
  else fail('timestamp field', 'missing or not a string');
});

await section('Settings – GET /settings', async () => {
  const { status, body } = await get('/settings');
  if (status !== 200) { fail('HTTP 200', `got ${status}`); return; }
  if (!isSuccess(body)) { fail('success:true', JSON.stringify(body)); return; }
  pass('HTTP 200 + success:true');
  const data = (body as { success: true; data: Record<string, unknown> | null }).data;
  if (data === null) {
    fail('settings exist', 'null – no settings configured yet. Run POST /settings first.');
    return;
  }
  if (typeof data === 'object') {
    pass('settings object returned');
    if ('corosEmail' in data) pass('corosEmail present', String(data.corosEmail));
    else fail('corosEmail', 'missing from response');
    if ('goal' in data) pass('goal present', String(data.goal));
    else fail('goal', 'missing from response');
  }
});

await section('Activities – GET /activities', async () => {
  const { status, body } = await get('/activities');
  if (status !== 200) { fail('HTTP 200', `got ${status}`); return; }
  if (!isSuccess(body)) { fail('success:true', JSON.stringify(body)); return; }
  pass('HTTP 200 + success:true');
  const data = (body as { success: true; data: { activities: unknown[]; summary: Record<string, unknown> } }).data;
  if (!Array.isArray(data.activities)) { fail('activities array', 'not an array'); return; }
  pass(`activities array (${data.activities.length} records)`);
  if (data.summary && typeof data.summary === 'object') {
    pass('summary object present', JSON.stringify(data.summary));
  } else {
    fail('summary', 'missing');
  }
  if (data.activities.length > 0) {
    const a = data.activities[0] as Record<string, unknown>;
    const required = ['labelId', 'date', 'sportType', 'name', 'distance', 'totalTime'];
    for (const field of required) {
      if (field in a) pass(`  activity.${field}`, String(a[field]));
      else fail(`  activity.${field}`, 'missing');
    }
  }
});

await section('Activities – GET /activities?days=7', async () => {
  const { status, body } = await get('/activities?days=7');
  if (status !== 200) { fail('HTTP 200', `got ${status}`); return; }
  if (!isSuccess(body)) { fail('success:true', JSON.stringify(body)); return; }
  pass('7-day filter accepted', `${(body as { success: true; data: { activities: unknown[] } }).data.activities.length} activities`);
});

await section('Health metrics – GET /health', async () => {
  const { status, body } = await get('/health');
  if (status !== 200) { fail('HTTP 200', `got ${status}`); return; }
  if (!isSuccess(body)) { fail('success:true', JSON.stringify(body)); return; }
  pass('HTTP 200 + success:true');
  const data = (body as { success: true; data: { metrics: unknown[]; mockDataDisclaimer: string | null } }).data;
  if (!Array.isArray(data.metrics)) { fail('metrics array', 'not an array'); return; }
  pass(`metrics array (${data.metrics.length} records)`);
  if (data.mockDataDisclaimer !== undefined) pass('mockDataDisclaimer field present', data.mockDataDisclaimer ?? '(null – real data!)');
  if (data.metrics.length > 0) {
    const m = data.metrics[0] as Record<string, unknown>;
    const fields = ['date', 'sleepDuration', 'restingHr', 'hrv', 'isMock'];
    for (const f of fields) {
      if (f in m) pass(`  metric.${f}`, String(m[f]));
      else fail(`  metric.${f}`, 'missing');
    }
  }
});

await section('Schedule – GET /schedule', async () => {
  const { status, body } = await get('/schedule');
  if (status !== 200) { fail('HTTP 200', `got ${status}`); return; }
  if (!isSuccess(body)) { fail('success:true', JSON.stringify(body)); return; }
  const data = (body as { success: true; data: unknown[] }).data;
  pass(`HTTP 200 + success:true (${Array.isArray(data) ? data.length : '?'} upcoming workouts)`);
});

await section('Predictions – GET /predictions', async () => {
  const { status, body } = await get('/predictions');
  if (status !== 200) { fail('HTTP 200', `got ${status}`); return; }
  if (!isSuccess(body)) { fail('success:true', JSON.stringify(body)); return; }
  pass('HTTP 200 + success:true');
});

await section('Settings – POST /settings (no-op update to verify write path)', async () => {
  // Read current settings first so we don't change anything
  const { body: current } = await get('/settings');
  const d = (current as { success: true; data: Record<string, unknown> | null }).data;
  if (!d) { pass('skipped – no settings configured yet'); return; }
  // Re-submit the same goal to verify the update path works
  const { status, body } = await post('/settings', { goal: d.goal });
  if (status !== 200) { fail('HTTP 200', `got ${status}`); return; }
  if (!isSuccess(body)) { fail('success:true', JSON.stringify(body)); return; }
  pass('Settings update accepted (goal unchanged)');
});

await section('Manual sync trigger – POST /sync', async () => {
  console.log('  (This will call the Coros API and may take several seconds…)');
  const { status, body } = await post('/sync', {});
  if (status !== 200) { fail('HTTP 200', `got ${status} – ${JSON.stringify(body)}`); return; }
  if (!isSuccess(body)) { fail('success:true', JSON.stringify(body)); return; }
  pass('Sync completed', JSON.stringify((body as { success: true; data: unknown }).data));
});

await section('Error handling – bad route', async () => {
  const res = await fetch(`${API}/nonexistent-route-xyz`);
  if (res.status === 404) pass('404 for unknown route');
  else fail('404 expected', `got ${res.status}`);
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All tests passed! ✓');
} else {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}
