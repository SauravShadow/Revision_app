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

export type ProviderErrorKind = 'rate_limited' | 'unavailable' | 'bad_output';

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
