import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFlashcards, AiServiceError } from './aiClient';

const body = { topicId: 't1', title: 'T', notes: 'N', count: 3 };

beforeEach(() => { vi.restoreAllMocks(); });

describe('aiClient', () => {
  it('returns the parsed payload on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ usageId: 7, cards: [{ front: 'Q', back: 'A' }] }), { status: 200 }),
    );
    await expect(generateFlashcards(body, 'Bearer t')).resolves.toEqual({
      usageId: 7, cards: [{ front: 'Q', back: 'A' }],
    });
  });

  it('propagates the service status and message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'quota gone' }), { status: 429 }),
    );
    await expect(generateFlashcards(body, 'Bearer t')).rejects.toMatchObject({
      status: 429, message: 'quota gone',
    });
  });

  it('turns a network failure into a 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(generateFlashcards(body, 'Bearer t')).rejects.toMatchObject({ status: 502 });
  });

  it('turns a timeout into a 504', async () => {
    const err = new Error('timed out'); err.name = 'TimeoutError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(err);
    await expect(generateFlashcards(body, 'Bearer t')).rejects.toBeInstanceOf(AiServiceError);
  });
});
