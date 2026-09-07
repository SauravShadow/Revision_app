import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFlashcards, recordKept, AiServiceError } from './aiClient';

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
    await expect(generateFlashcards(body, 'Bearer t')).rejects.toMatchObject({ status: 504 });
  });
});

describe('recordKept', () => {
  const keptBody = { usageId: 42, kept: 3 };

  it('posts to the right path with the auth header and body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    await expect(recordKept(keptBody, 'Bearer t')).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/flashcards/kept'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer t' }),
        body: JSON.stringify(keptBody),
      }),
    );
  });

  it('resolves when fetch rejects (network failure)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(recordKept(keptBody, 'Bearer t')).resolves.toBeUndefined();
  });

  it('resolves when the response is a non-2xx status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'server error' }), { status: 500 }),
    );
    await expect(recordKept(keptBody, 'Bearer t')).resolves.toBeUndefined();
  });

  it('resolves on timeout', async () => {
    const err = new Error('timed out'); err.name = 'TimeoutError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(err);
    await expect(recordKept(keptBody, 'Bearer t')).resolves.toBeUndefined();
  });
});
