import type { BrokerParser } from "../schemas/BrokerParserSchema.js";
import type { SkippedRow } from "../schemas/ParseResultSchema.js";
import { TradeSchema, type Trade } from "../schemas/TradeSchema.js";

// -- CONSTANTS --

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

// -- helper functions --

const _inferSide = (side: string): "BUY" | "SELL" | null => {
  if (side === "BOT") return "BUY";
  if (side === "SLD") return "SELL";
  return null;
};

const _normalizeSymbol = (symbol: string): string => {
  return symbol.replace(".", "/");
};

export const _parseDate = (dateStr: string): string | null => {
  // ISO 8601 with timezone e.g. 2026-04-01T14:30:00Z
  if (dateStr.includes("T")) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // MM/DD/YYYY
  const mdy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mdy) {
    const [, month, day, year] = mdy;
    return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
  }

  return null;
};

// -- main parser --

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
      const pushError = (field: string, value: unknown, reason: string) => {
        errors.push({
          row: rowNumber,
          field,
          value,
          reason,
        });
      };

      // validate date
      const executedAt = _parseDate(row.DateTime);
      if (!executedAt) {
        pushError("executed_at", row.DateTime, "Invalid date");
        return;
      }

      // validate quantity
      const quantity = Number(row.Quantity);
      if (isNaN(quantity) || quantity <= 0) {
        pushError("quantity", row.Quantity, "Quantity must be positive");
        return;
      }

      // validate price
      const price = Number(row.TradePrice);
      if (isNaN(price) || price <= 0) {
        pushError("price", row.TradePrice, "Price must be positive");
        return;
      }

      // validate side
      const side = _inferSide(row["Buy/Sell"]);
      if (!side) {
        pushError("side", row["Buy/Sell"], "Invalid side");
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
        pushError("schema", null, "Invalid trade data");
        return;
      }

      trades.push(result.data);
    });

    return { trades, errors };
  },
};
