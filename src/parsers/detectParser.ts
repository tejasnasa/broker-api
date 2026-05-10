import type { BrokerParser } from "../schemas/BrokerParserSchema.js";
import { ibkrParser } from "./ibkr.js";
import { zerodhaParser } from "./zerodha.js";

const PARSERS: BrokerParser[] = [zerodhaParser, ibkrParser];

export const detectParser = (headers: string[]): BrokerParser | null => {
  return PARSERS.find((parser) => parser.detect(headers)) || null;
};
