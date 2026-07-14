// apps/frontend/lib/contentClient.ts
import type { AppData } from '@revision-app/shared';
import { PROXY_TIMEOUT_MS } from '@/lib/serviceProxy';

const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL ?? 'http://127.0.0.1:4002';

// Thrown on a network failure/timeout talking to content-service, so callers
// (the API routes) can turn it into a clean 502/504 instead of a hang or a
// raw 500 with a leaked stack trace.
export class ContentServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function callContentService(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${CONTENT_SERVICE_URL}${path}`, { ...init, signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new ContentServiceError(timedOut ? 504 : 502, 'content-service unavailable');
  }
}

export async function getAppData(userId: string, authHeader: string): Promise<AppData | null> {
  const res = await callContentService('/app-data', { headers: { Authorization: authHeader } });
  if (res.status === 404) return null;
  if (!res.ok) throw new ContentServiceError(res.status, `content-service GET failed: ${res.status}`);
  return res.json();
}

export async function putAppData(data: AppData, authHeader: string): Promise<void> {
  const res = await callContentService('/app-data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new ContentServiceError(res.status, `content-service PUT failed: ${res.status}`);
}
