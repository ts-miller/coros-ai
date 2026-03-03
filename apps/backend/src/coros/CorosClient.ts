import md5 from 'md5';
import { prisma } from '../lib/prisma.js';
import { decrypt } from '../lib/crypto.js';
import {
  COROS_BASE_URL,
  CorosApiResponse,
  CorosActivity,
  LoginData,
  LoginRequest,
  ActivityListResponse,
  ActivityDetailResponse,
  RUNNING_SPORT_TYPES,
} from '../types/coros.js';

export class CorosClient {
  private accessToken: string | null = null;
  private userId: string | null = null;

  // ─── Auth ────────────────────────────────────────────────────────────────────

  async login(): Promise<void> {
    const settings = await prisma.settings.findFirst();
    if (!settings) throw new Error('No settings configured. Add Coros credentials first.');

    const plainPassword = decrypt(settings.corosPwd);

    const body: LoginRequest = {
      account: settings.corosEmail,
      accountType: 2,
      pwd: md5(plainPassword),
    };

    const res = await this.rawPost<LoginData>('/account/login', body, false);

    if (res.result !== '0000' || !res.data) {
      throw new Error(`Coros login failed (${res.result}): ${res.message}`);
    }

    this.accessToken = res.data.accessToken;
    this.userId = res.data.userId;

    // Persist token so cron jobs don't need to re-login every run
    await prisma.settings.update({
      where: { id: settings.id },
      data: { accessToken: this.accessToken, userId: this.userId },
    });

    console.log('[CorosClient] Logged in, userId:', this.userId);
  }

  /** Load persisted token from DB without re-logging in. */
  async loadToken(): Promise<boolean> {
    const settings = await prisma.settings.findFirst();
    if (settings?.accessToken && settings.userId) {
      this.accessToken = settings.accessToken;
      this.userId = settings.userId;
      return true;
    }
    return false;
  }

  /** Ensure we have a token; if not (or if expired), re-login. */
  private async ensureAuth(): Promise<void> {
    if (!this.accessToken) {
      const loaded = await this.loadToken();
      if (!loaded) await this.login();
    }
  }

  // ─── Activities ──────────────────────────────────────────────────────────────

  async getActivities(options: {
    pageNumber?: number;
    size?: number;
    /** Comma-separated sport-type codes, e.g. "100,101,102,103". Empty string = all modes. */
    modeList?: string;
    /** YYYYMMDD */
    startDay?: number;
    /** YYYYMMDD */
    endDay?: number;
  } = {}): Promise<ActivityListResponse> {
    const { pageNumber = 1, size = 50, modeList = '', startDay, endDay } = options;

    const params = new URLSearchParams({
      size: String(size),
      pageNumber: String(pageNumber),
      modeList,
      ...(startDay !== undefined ? { startDay: String(startDay) } : {}),
      ...(endDay !== undefined ? { endDay: String(endDay) } : {}),
    });

    const res = await this.authGet<ActivityListResponse>(`/activity/query?${params}`);
    return res.data ?? { count: 0, dataList: [], pageNumber: 1, totalPage: 1 };
  }

  async getAllRunningActivities(options: { startDay?: number; endDay?: number } = {}) {
    const modeList = RUNNING_SPORT_TYPES.join(',');
    const all: CorosActivity[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const result = await this.getActivities({ pageNumber: page, size: 50, modeList, ...options });
      all.push(...result.dataList);
      totalPages = result.totalPage;
      page++;
    } while (page <= totalPages);
    return all;
  }

  async getActivityDetail(
    labelId: string,
    sportType: number,
  ): Promise<ActivityDetailResponse | null> {
    const body = { labelId, sportType };
    const res = await this.authPost<ActivityDetailResponse>(
      '/activity/detail/query',
      body,
    );
    return res.data ?? null;
  }

  // ─── HTTP Helpers ────────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    if (!this.accessToken || !this.userId) {
      throw new Error('Not authenticated — call login() first');
    }
    return {
      'Content-Type': 'application/json',
      accessToken: this.accessToken,
      yfheader: JSON.stringify({ userId: this.userId }),
    };
  }

  private async rawPost<T>(
    path: string,
    body: unknown,
    authenticated: boolean,
  ): Promise<CorosApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authenticated) Object.assign(headers, this.authHeaders());

    const response = await fetch(`${COROS_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Coros API HTTP ${response.status} on POST ${path}`);
    }

    return response.json() as Promise<CorosApiResponse<T>>;
  }

  private async authGet<T>(path: string): Promise<CorosApiResponse<T>> {
    await this.ensureAuth();

    const response = await fetch(`${COROS_BASE_URL}${path}`, {
      method: 'GET',
      headers: this.authHeaders(),
    });

    if (response.status === 401) {
      console.warn('[CorosClient] 401 received, re-logging in...');
      await this.login();
      return this.authGet<T>(path);
    }

    if (!response.ok) {
      throw new Error(`Coros API HTTP ${response.status} on GET ${path}`);
    }

    const json = (await response.json()) as CorosApiResponse<T>;
    if (json.result === '1030') {
      console.warn('[CorosClient] Session expired, re-logging in...');
      await this.login();
      return this.authGet<T>(path);
    }

    return json;
  }

  private async authPost<T>(path: string, body: unknown): Promise<CorosApiResponse<T>> {
    await this.ensureAuth();

    const response = await fetch(`${COROS_BASE_URL}${path}`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      console.warn('[CorosClient] 401 received, re-logging in...');
      await this.login();
      return this.authPost<T>(path, body);
    }

    if (!response.ok) {
      throw new Error(`Coros API HTTP ${response.status} on POST ${path}`);
    }

    const json = (await response.json()) as CorosApiResponse<T>;
    if (json.result === '1030') {
      console.warn('[CorosClient] Session expired, re-logging in...');
      await this.login();
      return this.authPost<T>(path, body);
    }

    return json;
  }
}

// Singleton for use across services
export const corosClient = new CorosClient();
