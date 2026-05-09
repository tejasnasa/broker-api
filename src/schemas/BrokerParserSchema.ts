import type { ParseResult } from "./ParseResultSchema.js";

export interface BrokerParser {
  brokerName: string;
  detect(headers: string[]): boolean;
  parse(rows: Record<string, string>[]): ParseResult;
}
