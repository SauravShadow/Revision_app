import { GeminiProvider } from './gemini';
import type { Provider } from './types';

export * from './types';

let cached: Provider | undefined;

/**
 * The one place a provider is chosen. Adding Claude or a local llama.cpp
 * adapter later means a new class here, not a change at any call site.
 */
export function getProvider(): Provider {
  if (!cached) {
    const key = process.env.GEMINI_API_KEY_REVISION;
    if (!key) throw new Error('GEMINI_API_KEY_REVISION env var must be set');
    cached = new GeminiProvider(key);
  }
  return cached;
}

export function _resetProviderCache(): void {
  cached = undefined;
}
