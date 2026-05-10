import type { BrokerParser } from "../schemas/BrokerParserSchema.js";
import type { SkippedRow } from "../schemas/ParseResultSchema.js";
import { TradeSchema, type Trade } from "../schemas/TradeSchema.js";
import { parseDate } from "./utils.js";

const REQUIRED_HEADERS = [
  "TradeID",
  "AccountID",
  "Symbol",
  "DateTime",
  "Buy/Sell",
  "Quantity",
  "TradePrice",
  "Currency",
  "Commission",
  "NetAmount",
  "AssetClass",
];

const _inferSide = (side: string): "BUY" | "SELL" | null => {
  if (side === "BOT") return "BUY";
  if (side === "SLD") return "SELL";
  return null;
};

const _normalizeSymbol = (symbol: string): string => {
  return symbol.replace(".", "/");
};

export const ibkrParser: BrokerParser = {
  brokerName: "ibkr",

  detect(headers: string[]): boolean {
    return REQUIRED_HEADERS.every((h) => headers.includes(h));
  },

  parse(rows: Record<string, string>[]) {
    const trades: Trade[] = [];
    const errors: SkippedRow[] = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2; // +2 because row 1 is headers

      // helper to push errors with row number
      const pushError = (reason: string) => {
        errors.push({
          row: rowNumber,
          reason,
        });
      };

      // validate date
      const executedAt = parseDate(row.DateTime);
      if (!executedAt) {
        pushError(`Invalid date: ${row.DateTime}`);
        return;
      }

      // validate quantity
      const quantity = Number(row.Quantity);
      if (isNaN(quantity) || quantity <= 0) {
        pushError(`Quantity must be positive, got ${row.Quantity}`);
        return;
      }

      // validate price
      const price = Number(row.TradePrice);
      if (isNaN(price) || price <= 0) {
        pushError(`Price must be positive, got '${row.TradePrice}'`);
        return;
      }

      // validate side
      const side = _inferSide(row["Buy/Sell"]);
      if (!side) {
        pushError(`Invalid side: ${row["Buy/Sell"]}`);
        return;
      }

      const totalAmount = price * quantity * (side === "SELL" ? -1 : 1);

      // validate final trade object
      const result = TradeSchema.safeParse({
        symbol: _normalizeSymbol(row.Symbol),
        side,
        quantity,
        price,
        totalAmount,
        currency: row.Currency,
        executedAt,
        broker: "ibkr",
        rawData: row,
      });
      if (!result.success) {
        pushError(`Validation error: ${result.error.message}`);
        return;
      }

      trades.push(result.data);
    });

    return { trades, errors };
  },
};
