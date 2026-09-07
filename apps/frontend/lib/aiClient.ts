const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:4004';

// Generation is slower than a CRUD hop — allow more than PROXY_TIMEOUT_MS,
// but stay under ai-service's own 30s provider timeout plus overhead.
const AI_TIMEOUT_MS = 35_000;

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

async function callAiService(path: string, authHeader: string, payload: unknown): Promise<Response> {
  try {
    return await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
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
  await callAiService('/flashcards/kept', authHeader, body);
}
