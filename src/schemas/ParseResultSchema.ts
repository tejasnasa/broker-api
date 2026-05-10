import type { Trade } from "./TradeSchema.js";

export interface SkippedRow {
  row: number;
  field: string;
  value: unknown;
  reason: string;
}

export interface ParseResult {
  trades: Trade[];
  errors: SkippedRow[];
}
