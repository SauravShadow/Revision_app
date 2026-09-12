import { getPool } from './db';

export interface UsageRow {
  userId: string;
  provider: string;
  model: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  outcome: 'ok' | 'quota' | 'rate_limited' | 'error';
  cardsProposed?: number;
}

export async function recordUsage(row: UsageRow): Promise<number> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO ai_usage
       (user_id, provider, model, operation, input_tokens, output_tokens, latency_ms, outcome, cards_proposed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      row.userId, row.provider, row.model, row.operation,
      row.inputTokens ?? null, row.outputTokens ?? null, row.latencyMs ?? null,
      row.outcome, row.cardsProposed ?? null,
    ],
  );
  return Number(rows[0].id);
}

export async function recordKept(usageId: number, userId: string, kept: number): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'UPDATE ai_usage SET cards_kept = $1 WHERE id = $2 AND user_id = $3',
    [kept, usageId, userId],
  );
  return rowCount === 1;
}
