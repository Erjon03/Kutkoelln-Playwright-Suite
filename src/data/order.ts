import type { ResolvedConfig } from '../config/types';

/**
 * Quantity for an order test. Card gateways reject the same card + amount again within
 * a time window (duplicate-order guard) → with a test card the quantity varies per run.
 * Odd/even default quantities never collide with each other (e.g. guest 1, registered 2).
 */
export function orderQuantity(cfg: ResolvedConfig, defaultQty: number): number {
  if (!cfg.testData.cardPayment) return defaultQty;
  return defaultQty + 2 * Math.floor(Math.random() * 10);
}
