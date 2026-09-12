const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:4004';

// Generation is slower than a CRUD hop. Backend's own provider timeout is 30s, so we need
// margin for backend error classification and serialization before we timeout ourselves.
const AI_TIMEOUT_MS = 40_000;

// Fire-and-forget quality signal — much shorter timeout, no reason to hang 40s.
const KEPT_TIMEOUT_MS = 5_000;

export class AiServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AiServiceError';
  }
}

export interface GenerateBody {
  topicId: string;
  title: string;
  notes: string;
  count: number;
}

export interface GenerateResponse {
  usageId: number;
  cards: { front: string; back: string }[];
}

async function callAiService(path: string, authHeader: string, payload: unknown, timeoutMs?: number): Promise<Response> {
  try {
    return await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs ?? AI_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new AiServiceError(timedOut ? 504 : 502, 'ai-service unavailable');
  }
}

export async function generateFlashcards(body: GenerateBody, authHeader: string): Promise<GenerateResponse> {
  const res = await callAiService('/flashcards', authHeader, body);
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AiServiceError(res.status, detail.error ?? 'Could not generate cards');
  }
  return (await res.json()) as GenerateResponse;
}

export async function recordKept(
  body: { usageId: number; kept: number },
  authHeader: string,
): Promise<void> {
  try {
    await callAiService('/flashcards/kept', authHeader, body, KEPT_TIMEOUT_MS);
  } catch {
    // Fire-and-forget: this is a quality signal, not user data. Losing it must
    // never fail a save whose cards were already committed.
  }
}
