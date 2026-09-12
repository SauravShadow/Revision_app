export interface GeneratedCard {
  front: string;
  back: string;
}

export interface GenerateResult {
  cards: GeneratedCard[];
  inputTokens?: number;
  outputTokens?: number;
  model: string;
}

/**
 * 'unavailable' is a connection-level failure or a non-2xx response: nothing
 * was generated. 'timeout' is distinct because the model was still generating
 * when we gave up — those tokens were billed, so the caller must not refund.
 */
export type ProviderErrorKind = 'rate_limited' | 'unavailable' | 'bad_output' | 'timeout';

export class ProviderError extends Error {
  constructor(public kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface GenerateInput {
  title: string;
  notes: string;
  count: number;
}

export interface Provider {
  readonly name: string;
  generateFlashcards(input: GenerateInput): Promise<GenerateResult>;
}
