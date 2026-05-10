import type { BrokerParser } from "../schemas/BrokerParserSchema.js";
import type { SkippedRow } from "../schemas/ParseResultSchema.js";
import { TradeSchema, type Trade } from "../schemas/TradeSchema.js";
import { parseDate } from "./utils.js";

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

const _inferCurrency = (exchange: string): string => {
  return INDIAN_EXCHANGES.includes(exchange?.toUpperCase()) ? "INR" : "USD";
};

// -- main parser --

export const zerodhaParser: BrokerParser = {
  brokerName: "zerodha",

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
      const executedAt = parseDate(row.trade_date);
      if (!executedAt) {
        pushError("executed_at", row.trade_date, "Invalid date");
        return;
      }

      // validate quantity
      const quantity = Number(row.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        pushError("quantity", row.quantity, "Quantity must be positive");
        return;
      }

      // validate price
      const price = Number(row.price);
      if (isNaN(price) || price <= 0) {
        pushError("price", row.price, "Price must be positive");
        return;
      }

      // validate side
      const side = row.trade_type?.toUpperCase();
      if (side !== "BUY" && side !== "SELL") {
        pushError("side", row.trade_type, "Side must be BUY or SELL");
        return;
      }

      const currency = _inferCurrency(row.exchange);
      const totalAmount = price * quantity * (side === "SELL" ? -1 : 1);

      // validate final trade object
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
        pushError("schema", null, "Invalid trade data");
        return;
      }

      trades.push(result.data);
    });

    return { trades, errors };
  },
};
