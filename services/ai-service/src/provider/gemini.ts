import {
  ProviderError,
  type GenerateInput,
  type GenerateResult,
  type GeneratedCard,
  type Provider,
} from './types';

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 30_000;

// Constrains the model to an array of front/back pairs, so there is no
// parsing-and-retry loop to write.
const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { front: { type: 'STRING' }, back: { type: 'STRING' } },
    required: ['front', 'back'],
  },
} as const;

function prompt(input: GenerateInput): string {
  return [
    `You are helping a student revise for an exam.`,
    `Write exactly ${input.count} flashcards for the topic "${input.title}".`,
    ``,
    `Rules:`,
    `- Base every card ONLY on the notes below. Do not introduce outside facts.`,
    `- "front" is a question or prompt; "back" is a concise, complete answer.`,
    `- Prefer specific, testable facts (definitions, formulas, conditions) over vague prompts.`,
    `- If the notes are too thin to support ${input.count} good cards, return fewer.`,
    ``,
    `Notes:`,
    input.notes,
  ].join('\n');
}

export class GeminiProvider implements Provider {
  readonly name = 'gemini';

  constructor(private apiKey: string) {}

  async generateFlashcards(input: GenerateInput): Promise<GenerateResult> {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt(input) }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ProviderError('unavailable', 'gemini request failed');
    }

    if (res.status === 429) throw new ProviderError('rate_limited', 'gemini rate limited');
    if (!res.ok) throw new ProviderError('unavailable', `gemini returned ${res.status}`);

    let body: {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new ProviderError('bad_output', 'gemini returned non-JSON');
    }

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new ProviderError('bad_output', 'gemini returned no content');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError('bad_output', 'gemini content was not valid JSON');
    }
    if (!Array.isArray(parsed)) throw new ProviderError('bad_output', 'gemini content was not an array');

    const cards: GeneratedCard[] = parsed
      .filter(
        (c): c is GeneratedCard =>
          typeof c === 'object' && c !== null &&
          typeof (c as GeneratedCard).front === 'string' &&
          typeof (c as GeneratedCard).back === 'string' &&
          (c as GeneratedCard).front.trim() !== '' &&
          (c as GeneratedCard).back.trim() !== '',
      )
      .map((c) => ({ front: c.front.trim(), back: c.back.trim() }));

    return {
      cards,
      inputTokens: body.usageMetadata?.promptTokenCount,
      outputTokens: body.usageMetadata?.candidatesTokenCount,
      model: MODEL,
    };
  }
}
