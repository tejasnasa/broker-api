import { describe, it, expect } from "vitest";
import { zerodhaParser, _parseDate } from "../zerodha.js";

// -- Sample data matching src/data/zerodha.csv --

const SAMPLE_ROWS: Record<string, string>[] = [
  { symbol: "RELIANCE", isin: "INE002A01018", trade_date: "01-04-2026", trade_type: "buy", quantity: "10", price: "2450.50", trade_id: "TRD001", order_id: "ORD001", exchange: "NSE", segment: "EQ" },
  { symbol: "INFY", isin: "INE009A01021", trade_date: "01-04-2026", trade_type: "sell", quantity: "25", price: "1520.75", trade_id: "TRD002", order_id: "ORD002", exchange: "NSE", segment: "EQ" },
  { symbol: "TATAMOTORS", isin: "INE155A01022", trade_date: "02-04-2026", trade_type: "buy", quantity: "50", price: "650.00", trade_id: "TRD003", order_id: "ORD003", exchange: "BSE", segment: "EQ" },
  { symbol: "HDFCBANK", isin: "", trade_date: "03-04-2026", trade_type: "buy", quantity: "15", price: "1680.30", trade_id: "TRD004", order_id: "ORD004", exchange: "NSE", segment: "EQ" },
  { symbol: "SBIN", isin: "INE062A01020", trade_date: "03-04-2026", trade_type: "SELL", quantity: "30", price: "820.45", trade_id: "TRD005", order_id: "ORD005", exchange: "NSE", segment: "EQ" },
  { symbol: "RELIANCE", isin: "INE002A01018", trade_date: "invalid_date", trade_type: "buy", quantity: "10", price: "2480.00", trade_id: "TRD006", order_id: "ORD006", exchange: "NSE", segment: "EQ" },
  { symbol: "WIPRO", isin: "INE075A01022", trade_date: "05-04-2026", trade_type: "buy", quantity: "-5", price: "450.00", trade_id: "TRD007", order_id: "ORD007", exchange: "NSE", segment: "EQ" },
];

const ZERODHA_HEADERS = [
  "symbol", "isin", "trade_date", "trade_type", "quantity",
  "price", "trade_id", "order_id", "exchange", "segment",
];

describe("_parseDate (Zerodha)", () => {
  describe("DD-MM-YYYY format", () => {
    it("parses valid DD-MM-YYYY date", () => {
      expect(_parseDate("01-04-2026")).toBe("2026-04-01T00:00:00.000Z");
    });

    it("parses end-of-month date", () => {
      expect(_parseDate("31-01-2026")).toBe("2026-01-31T00:00:00.000Z");
    });

    it("parses first day of year", () => {
      expect(_parseDate("01-01-2026")).toBe("2026-01-01T00:00:00.000Z");
    });

    it("parses last day of year", () => {
      expect(_parseDate("31-12-2026")).toBe("2026-12-31T00:00:00.000Z");
    });
  });

  describe("invalid inputs", () => {
    it("returns null for garbage string", () => {
      expect(_parseDate("invalid_date")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(_parseDate("")).toBeNull();
    });

    it("returns null for partial date", () => {
      expect(_parseDate("04-2026")).toBeNull();
    });
  });
});

describe("zerodhaParser", () => {
  // -- detection --

  describe("detect", () => {
    it("returns true for valid Zerodha headers", () => {
      expect(zerodhaParser.detect(ZERODHA_HEADERS)).toBe(true);
    });

    it("returns true when extra headers are present", () => {
      expect(zerodhaParser.detect([...ZERODHA_HEADERS, "extra_col"])).toBe(true);
    });

    it("returns false for IBKR headers", () => {
      const ibkrHeaders = ["TradeID", "AccountID", "Symbol", "DateTime", "Buy/Sell"];
      expect(zerodhaParser.detect(ibkrHeaders)).toBe(false);
    });

    it("returns false for partial headers", () => {
      expect(zerodhaParser.detect(["symbol", "price"])).toBe(false);
    });

    it("returns false for empty headers", () => {
      expect(zerodhaParser.detect([])).toBe(false);
    });
  });

  // -- parsing: happy path --

  describe("parse – sample data", () => {
    it("returns 5 valid trades and 2 errors", () => {
      const { trades, errors } = zerodhaParser.parse(SAMPLE_ROWS);
      expect(trades).toHaveLength(5);
      expect(errors).toHaveLength(2);
    });

    it("sets broker to 'zerodha' on all trades", () => {
      const { trades } = zerodhaParser.parse(SAMPLE_ROWS);
      trades.forEach((t) => expect(t.broker).toBe("zerodha"));
    });

    it("normalizes trade_type to uppercase BUY/SELL", () => {
      const { trades } = zerodhaParser.parse(SAMPLE_ROWS);
      // row 0: "buy" → "BUY", row 1: "sell" → "SELL", row 4: "SELL" → "SELL"
      expect(trades[0].side).toBe("BUY");
      expect(trades[1].side).toBe("SELL");
      expect(trades[4].side).toBe("SELL");
    });

    it("infers INR currency for NSE/BSE exchanges", () => {
      const { trades } = zerodhaParser.parse(SAMPLE_ROWS);
      trades.forEach((t) => expect(t.currency).toBe("INR"));
    });

    it("parses DD-MM-YYYY dates to ISO 8601", () => {
      const { trades } = zerodhaParser.parse(SAMPLE_ROWS);
      expect(trades[0].executedAt).toBe("2026-04-01T00:00:00.000Z");
      expect(trades[2].executedAt).toBe("2026-04-02T00:00:00.000Z");
    });

    it("computes totalAmount = price * quantity (negative for SELL)", () => {
      const { trades } = zerodhaParser.parse(SAMPLE_ROWS);
      // RELIANCE: BUY 10 × 2450.50 = 24505
      expect(trades[0].totalAmount).toBeCloseTo(24505);
      // INFY: SELL 25 × 1520.75 = -38018.75
      expect(trades[1].totalAmount).toBeCloseTo(-38018.75);
    });

    it("preserves all original fields in rawData", () => {
      const { trades } = zerodhaParser.parse(SAMPLE_ROWS);
      expect(trades[0].rawData).toMatchObject({
        symbol: "RELIANCE",
        isin: "INE002A01018",
        trade_id: "TRD001",
        exchange: "NSE",
      });
    });

    it("handles empty isin field (row 4) as valid trade", () => {
      const { trades } = zerodhaParser.parse(SAMPLE_ROWS);
      const hdfcTrade = trades.find((t) => t.symbol === "HDFCBANK");
      expect(hdfcTrade).toBeDefined();
      expect(hdfcTrade!.rawData.isin).toBe("");
    });
  });

  // -- parsing: error rows --

  describe("parse – error handling", () => {
    it("skips row with invalid date and reports reason", () => {
      const { errors } = zerodhaParser.parse(SAMPLE_ROWS);
      const dateError = errors.find((e) => e.value === "invalid_date");
      expect(dateError).toBeDefined();
      expect(dateError!.field).toBe("executed_at");
      expect(dateError!.row).toBe(7); // index 5 + 2
    });

    it("skips row with negative quantity and reports reason", () => {
      const { errors } = zerodhaParser.parse(SAMPLE_ROWS);
      const qtyError = errors.find((e) => e.value === "-5");
      expect(qtyError).toBeDefined();
      expect(qtyError!.field).toBe("quantity");
      expect(qtyError!.row).toBe(8); // index 6 + 2
    });
  });

  // -- parsing: additional edge cases --

  describe("parse – edge cases", () => {
    it("handles a single valid row", () => {
      const { trades, errors } = zerodhaParser.parse([SAMPLE_ROWS[0]]);
      expect(trades).toHaveLength(1);
      expect(errors).toHaveLength(0);
    });

    it("returns zero trades when all rows are invalid", () => {
      const badRows = [SAMPLE_ROWS[5], SAMPLE_ROWS[6]]; // invalid date + negative qty
      const { trades, errors } = zerodhaParser.parse(badRows);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(2);
    });

    it("returns empty results for empty input array", () => {
      const { trades, errors } = zerodhaParser.parse([]);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it("skips row with zero quantity", () => {
      const row = { ...SAMPLE_ROWS[0], quantity: "0" };
      const { trades, errors } = zerodhaParser.parse([row]);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("quantity");
    });

    it("skips row with non-numeric quantity", () => {
      const row = { ...SAMPLE_ROWS[0], quantity: "abc" };
      const { trades, errors } = zerodhaParser.parse([row]);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(1);
    });

    it("skips row with zero price", () => {
      const row = { ...SAMPLE_ROWS[0], price: "0" };
      const { trades, errors } = zerodhaParser.parse([row]);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("price");
    });

    it("skips row with unrecognized trade_type", () => {
      const row = { ...SAMPLE_ROWS[0], trade_type: "SHORT" };
      const { trades, errors } = zerodhaParser.parse([row]);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("side");
    });

    it("falls back to USD for unknown exchange", () => {
      const row = { ...SAMPLE_ROWS[0], exchange: "NASDAQ" };
      const { trades } = zerodhaParser.parse([row]);
      expect(trades).toHaveLength(1);
      expect(trades[0].currency).toBe("USD");
    });
  });
});
