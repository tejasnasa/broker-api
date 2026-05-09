import type { Trade } from "./TradeSchema.js";

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ParseResult {
  trades: Trade[];
  errors: SkippedRow[];
}
