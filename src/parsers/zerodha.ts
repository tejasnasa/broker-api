import type { BrokerParser } from "../schemas/BrokerParserSchema.js";
import type { SkippedRow } from "../schemas/ParseResultSchema.js";
import { TradeSchema, type Trade } from "../schemas/TradeSchema.js";

// -- CONSTANTS --

const REQUIRED_HEADERS = [
  "symbol",
  "isin",
  "trade_date",
  "trade_type",
  "quantity",
  "price",
  "trade_id",
  "order_id",
  "exchange",
  "segment",
];

const INDIAN_EXCHANGES = ["NSE", "BSE"];

// -- helper functions --

const _parseZerodhaDate = (dateStr: string): string | null => {
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;

  const [_, day, month, year] = match;

  return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
};

const _inferCurrency = (exchange: string): string => {
  return INDIAN_EXCHANGES.includes(exchange.toUpperCase()) ? "INR" : "USD";
};

// -- main parser --

export const zerodhaParser: BrokerParser = {
  brokerName: "Zerodha",

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
      const executedAt = _parseZerodhaDate(row.trade_date);
      if (!executedAt) {
        pushError(`Invalid date: ${row.trade_date}`);
        return;
      }

      // validate quantity
      const quantity = Number(row.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        pushError(`Quantity must be positive, got ${row.quantity}`);
        return;
      }

      // validate price
      const price = Number(row.price);
      if (isNaN(price) || price <= 0) {
        pushError(`Price must be positive, got '${row.price}'`);
        return;
      }

      // validate side
      const side = row.trade_type.toUpperCase();
      if (side !== "BUY" && side !== "SELL") {
        pushError(`Side must be BUY or SELL, got '${row.trade_type}'`);
        return;
      }

      const currency = _inferCurrency(row.exchange);
      const totalAmount = price * quantity * (side === "SELL" ? -1 : 1);

      const result = TradeSchema.safeParse({
        symbol: row.symbol,
        side,
        quantity,
        price,
        totalAmount,
        currency,
        executedAt,
        broker: "zerodha",
        rawData: row,
      });

      if (!result.success) {
        errors.push({
          row: rowNumber,
          reason: `Invalid trade data: ${result.error.message}`,
        });
        return;
      }

      trades.push(result.data);
    });

    return { trades, errors };
  },
};
