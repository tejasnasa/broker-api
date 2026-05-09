import { z } from "zod";

export const TradeSchema = z.object({
  symbol: z.string().min(1), // e.g. "AAPL", "EUR/USD", "BTC/USDT"
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().positive(),
  totalAmount: z.number(), // quantity * price (can be negative for sells)
  currency: z.string().length(3), // e.g. "USD", "INR", "EUR"
  executedAt: z.string().datetime(), // ISO 8601 format
  broker: z.string().min(1), // e.g. "zerodha", "ibkr"
  rawData: z.record(z.string(), z.unknown()), // original row as key-value pairs
});

export type Trade = z.infer<typeof TradeSchema>;
