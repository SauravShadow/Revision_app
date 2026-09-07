import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from './gemini';
import { ProviderError } from './types';

const provider = new GeminiProvider('test-key');
const input = { title: 'Limit State Design', notes: 'Partial safety factors...', count: 3 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('GeminiProvider', () => {
  it('parses cards and token counts from a well-formed response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '[{"front":"Q1","back":"A1"},{"front":"Q2","back":"A2"}]' }] } }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 45 },
    }));

    const result = await provider.generateFlashcards(input);
    expect(result.cards).toEqual([{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }]);
    expect(result.inputTokens).toBe(120);
    expect(result.outputTokens).toBe(45);
    expect(result.model).toBe('gemini-2.5-flash');
  });

  it('maps 429 to a rate_limited ProviderError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'quota' }, 429));
    await expect(provider.generateFlashcards(input)).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('maps 500 to an unavailable ProviderError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    await expect(provider.generateFlashcards(input)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('maps a network failure to an unavailable ProviderError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(provider.generateFlashcards(input)).rejects.toBeInstanceOf(ProviderError);
  });

  it('rejects output that is not an array of front/back pairs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '{"not":"an array"}' }] } }],
    }));
    await expect(provider.generateFlashcards(input)).rejects.toMatchObject({ kind: 'bad_output' });
  });

  it('drops cards with empty sides', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '[{"front":"Q","back":"A"},{"front":"","back":"A2"}]' }] } }],
    }));
    const result = await provider.generateFlashcards(input);
    expect(result.cards).toEqual([{ front: 'Q', back: 'A' }]);
  });

  it('never puts the API key in the request URL path or body', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '[{"front":"Q","back":"A"}]' }] } }],
    }));
    await provider.generateFlashcards(input);
    const [url, init] = spy.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    expect(url).not.toContain('test-key');
    expect((init as RequestInit).body).not.toContain('test-key');
  });

  it('rejects a response body that is not valid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 200 }));
    await expect(provider.generateFlashcards(input)).rejects.toMatchObject({ kind: 'bad_output' });
  });

  it('rejects when candidates array is empty or missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      candidates: [],
    }));
    await expect(provider.generateFlashcards(input)).rejects.toMatchObject({ kind: 'bad_output' });
  });

  it('rejects when candidate text is not valid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: 'not json' }] } }],
    }));
    await expect(provider.generateFlashcards(input)).rejects.toMatchObject({ kind: 'bad_output' });
  });
});
