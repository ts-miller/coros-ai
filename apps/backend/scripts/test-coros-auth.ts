/**
 * test-coros-auth.ts
 *
 * Tests direct connectivity to the Coros API:
 *   1. Login + token acquisition
 *   2. Activity list fetch
 *   3. Activity detail fetch (first activity found)
 *   4. Token refresh / session expiry handling
 *
 * Credentials are loaded from the database (via Prisma) so you must have
 * configured settings first (POST /api/settings from the backend).
 *
 * Usage:
 *   npx tsx scripts/test-coros-auth.ts
 *
 * Override the base URL:
 *   COROS_BASE_URL=https://teamapi.coros.com npx tsx scripts/test-coros-auth.ts
 */

import 'dotenv/config';
import md5 from 'md5';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const COROS_BASE_URL = process.env.COROS_BASE_URL ?? 'https://teamapi.coros.com';

// ─── Inline decrypt (mirrors src/lib/crypto.ts – AES-256-GCM + PBKDF2) ───────

const ALGORITHM   = 'aes-256-gcm';
const IV_LENGTH   = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH  = 16;
const KEY_LENGTH  = 32;
const ITERATIONS  = 100_000;

function decrypt(ciphertext: string): string {
  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey) throw new Error('ENCRYPTION_KEY env var is required');
  const key  = Buffer.from(encKey, 'hex');
  const data = Buffer.from(ciphertext, 'base64');

  const salt       = data.subarray(0, SALT_LENGTH);
  const iv         = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag        = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted  = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const derivedKey = crypto.pbkdf2Sync(key, salt, ITERATIONS, KEY_LENGTH, 'sha512');
  const decipher   = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// ─── Minimal test harness ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(label: string, detail?: unknown) {
  const extra = detail !== undefined ? `  →  ${typeof detail === 'object' ? JSON.stringify(detail, null, 0) : detail}` : '';
  console.log(`  ✓ ${label}${extra}`);
  passed++;
}

function fail(label: string, reason: unknown) {
  console.error(`  ✗ ${label}  →  ${reason}`);
  failed++;
}

async function section(name: string, fn: () => Promise<void>) {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 55 - name.length))}`);
  try {
    await fn();
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
  }
}

async function corosRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; data: T | null; raw: unknown }> {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const url = `${COROS_BASE_URL}${path}`;
  console.log(`     → ${method} ${url}`);
  const res = await fetch(url, opts);
  const raw = await res.json().catch(() => null);
  const typed = raw as { result?: string; data?: T } | null;
  return {
    status: res.status,
    data: typed?.result === '0000' ? (typed.data ?? null) : null,
    raw,
  };
}

// ─── Load credentials from DB ─────────────────────────────────────────────────

const prisma = new PrismaClient();
const settings = await prisma.settings.findFirst();
await prisma.$disconnect();

if (!settings) {
  console.error('\n[ERROR] No settings found in the database.');
  console.error('Configure credentials first via POST /api/settings.');
  process.exit(1);
}

let accessToken: string | null = settings.accessToken ?? null;
let userId: string | null = settings.userId ?? null;

function authHeaders(): Record<string, string> {
  if (!accessToken || !userId) throw new Error('Not authenticated');
  return {
    accessToken,
    yfheader: JSON.stringify({ userId }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

await section('Coros API reachability', async () => {
  try {
    const res = await fetch(COROS_BASE_URL, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    // Coros may return any non-network-error status here
    pass(`Reachable (HTTP ${res.status})`);
  } catch (err) {
    fail('Unreachable', err instanceof Error ? err.message : String(err));
    console.error('  Subsequent tests will likely fail.');
  }
});

await section('Login with stored credentials', async () => {
  const plainPwd = decrypt(settings!.corosPwd);
  const body = {
    account: settings!.corosEmail,
    accountType: 2,
    pwd: md5(plainPwd),
  };

  const { status, raw } = await corosRequest<{ accessToken: string; userId: string; nickname: string }>(
    'POST',
    '/account/login',
    body,
  );

  const r = raw as Record<string, unknown>;

  if (status !== 200) { fail('HTTP 200', `got ${status}`); return; }
  pass('HTTP 200 from login endpoint');

  if (r.result === '0000' && r.data) {
    const d = r.data as Record<string, unknown>;
    accessToken = d.accessToken as string;
    userId = d.userId as string;
    pass('result code 0000 – login successful');
    pass('accessToken acquired', `${String(accessToken).slice(0, 12)}…`);
    pass('userId', userId);
    if (d.nickname) pass('nickname', d.nickname);
  } else {
    fail('Expected result 0000', `got result=${r.result}, message=${r.message}`);
  }
});

await section('Activity list – past 7 days', async () => {
  if (!accessToken) { fail('skipped', 'no access token'); return; }

  const today = todayInt();
  const weekAgo = daysAgoInt(7);

  const params = new URLSearchParams({
    startDay: String(weekAgo),
    endDay: String(today),
    pageNumber: '1',
    size: '10',
    sportType: '100', // Run
  });

  const { status, raw } = await corosRequest<unknown>(
    'GET',
    `/activity/query?${params}`,
    undefined,
    authHeaders(),
  );

  const r = raw as Record<string, unknown>;
  if (status !== 200) { fail('HTTP 200', `got ${status}`); return; }
  pass('HTTP 200');
  if (r.result === '0000') {
    const d = r.data as Record<string, unknown> | null;
    const list = (d?.dataList ?? []) as unknown[];
    pass(`result 0000 – ${list.length} activities returned`);
    if (list.length > 0) {
      const a = list[0] as Record<string, unknown>;
      console.log('  Sample activity:', JSON.stringify({
        labelId: a.labelId,
        name: a.name,
        sportType: a.sportType,
        date: a.date,
        distance: a.distance,
        totalTime: a.totalTime,
      }, null, 2).replace(/^/gm, '    '));

      // Store for detail test
      (globalThis as Record<string, unknown>).__sampleLabelId = a.labelId;
      (globalThis as Record<string, unknown>).__sampleSportType = a.sportType;
    }
  } else {
    fail('result 0000', `got ${r.result}: ${r.message}`);
  }
});

await section('Activity detail – single activity', async () => {
  if (!accessToken) { fail('skipped', 'no access token'); return; }
  const labelId = (globalThis as Record<string, unknown>).__sampleLabelId as string | undefined;
  const sportType = (globalThis as Record<string, unknown>).__sampleSportType as number | undefined;

  if (!labelId || !sportType) {
    console.log('  (skipped – no activity found in previous step)');
    return;
  }

  const { status, raw } = await corosRequest<unknown>(
    'POST',
    '/activity/detail/query',
    { labelId, sportType },
    authHeaders(),
  );

  const r = raw as Record<string, unknown>;
  if (status !== 200) { fail('HTTP 200', `got ${status}`); return; }
  pass('HTTP 200');
  if (r.result === '0000' && r.data) {
    const d = r.data as Record<string, unknown>;
    pass('result 0000 – detail returned');
    const summary = d.summary as Record<string, unknown> | undefined;
    if (summary) {
      pass('summary block present', {
        avgHr: summary.avgHr,
        avgPace: summary.avgPace,
        trainingLoad: summary.trainingLoad,
        currentVo2Max: summary.currentVo2Max,
      });
    }
    const lapCount = Array.isArray(d.lapList) ? d.lapList.length : '?';
    pass(`lapList (${lapCount} laps)`);
  } else {
    fail('result 0000', `got ${r.result}: ${r.message}`);
    console.log('  Raw:', JSON.stringify(r).slice(0, 300));
  }
});

await section('Session token still valid after requests', async () => {
  if (!accessToken) { fail('skipped', 'no token'); return; }
  const params = new URLSearchParams({
    startDay: String(daysAgoInt(1)),
    endDay: String(todayInt()),
    pageNumber: '1',
    size: '1',
  });
  const { raw } = await corosRequest<unknown>('GET', `/activity/query?${params}`, undefined, authHeaders());
  const r = raw as Record<string, unknown>;
  if (r.result === '0000' || r.result === '1030') {
    if (r.result === '1030') fail('session expired (1030)', 'token needs refresh');
    else pass('Token still valid');
  } else {
    fail('Unexpected result', `${r.result}: ${r.message}`);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayInt(): number {
  return Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
}

function daysAgoInt(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return Number(d.toISOString().slice(0, 10).replace(/-/g, ''));
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log('All tests passed! ✓');
else { console.error(`${failed} test(s) failed.`); process.exit(1); }
