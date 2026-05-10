import { describe, it, expect } from "vitest";
import { ibkrParser, _parseDate } from "../ibkr.js";

// -- Sample data matching src/data/ibkr.csv --

const SAMPLE_ROWS: Record<string, string>[] = [
  { TradeID: "U1234-001", AccountID: "U1234567", Symbol: "AAPL", DateTime: "2026-04-01T14:30:00Z", "Buy/Sell": "BOT", Quantity: "100", TradePrice: "185.50", Currency: "USD", Commission: "-1.00", NetAmount: "18549.00", AssetClass: "STK" },
  { TradeID: "U1234-002", AccountID: "U1234567", Symbol: "MSFT", DateTime: "2026-04-01T15:45:00Z", "Buy/Sell": "SLD", Quantity: "50", TradePrice: "420.25", Currency: "USD", Commission: "-1.00", NetAmount: "-21011.50", AssetClass: "STK" },
  { TradeID: "U1234-003", AccountID: "U1234567", Symbol: "EUR.USD", DateTime: "2026-04-02T09:00:00Z", "Buy/Sell": "BOT", Quantity: "10000", TradePrice: "1.0850", Currency: "USD", Commission: "-2.00", NetAmount: "10848.00", AssetClass: "CASH" },
  { TradeID: "U1234-004", AccountID: "U1234567", Symbol: "TSLA", DateTime: "04/03/2026", "Buy/Sell": "BOT", Quantity: "25", TradePrice: "245.00", Currency: "USD", Commission: "-1.00", NetAmount: "6124.00", AssetClass: "STK" },
  { TradeID: "U1234-005", AccountID: "U1234567", Symbol: "AMZN", DateTime: "2026-04-03T16:20:00Z", "Buy/Sell": "SLD", Quantity: "0", TradePrice: "190.75", Currency: "USD", Commission: "-1.00", NetAmount: "0.00", AssetClass: "STK" },
  { TradeID: "U1234-006", AccountID: "U1234567", Symbol: "GOOGL", DateTime: "2026-04-04T10:15:00Z", "Buy/Sell": "BOT", Quantity: "30", TradePrice: "175.50", Currency: "USD", Commission: "", NetAmount: "5265.00", AssetClass: "STK" },
];

const IBKR_HEADERS = [
  "TradeID", "AccountID", "Symbol", "DateTime", "Buy/Sell",
  "Quantity", "TradePrice", "Currency", "Commission", "NetAmount", "AssetClass",
];

describe("_parseDate (IBKR)", () => {
  describe("ISO 8601 format", () => {
    it("parses full ISO 8601 with Z timezone", () => {
      expect(_parseDate("2026-04-01T14:30:00Z")).toBe(
        "2026-04-01T14:30:00.000Z",
      );
    });

    it("parses ISO 8601 with timezone offset", () => {
      expect(_parseDate("2026-04-01T14:30:00+05:30")).toBe(
        "2026-04-01T09:00:00.000Z",
      );
    });

    it("parses ISO 8601 without timezone (treated as local time)", () => {
      const result = _parseDate("2026-04-01T14:30:00");
      expect(result).not.toBeNull();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it("returns null for invalid ISO-like string", () => {
      expect(_parseDate("not-a-dateT00:00:00Z")).toBeNull();
    });
  });

  describe("MM/DD/YYYY format", () => {
    it("parses valid MM/DD/YYYY date", () => {
      expect(_parseDate("04/03/2026")).toBe("2026-04-03T00:00:00.000Z");
    });

    it("parses January 1st", () => {
      expect(_parseDate("01/01/2026")).toBe("2026-01-01T00:00:00.000Z");
    });

    it("parses December 31st", () => {
      expect(_parseDate("12/31/2026")).toBe("2026-12-31T00:00:00.000Z");
    });
  });

  describe("invalid inputs", () => {
    it("returns null for garbage string", () => {
      expect(_parseDate("invalid_date")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(_parseDate("")).toBeNull();
    });

    it("returns null for plain number", () => {
      expect(_parseDate("12345")).toBeNull();
    });
  });
});

describe("ibkrParser", () => {
  // -- detection --

  describe("detect", () => {
    it("returns true for valid IBKR headers", () => {
      expect(ibkrParser.detect(IBKR_HEADERS)).toBe(true);
    });

    it("returns true when extra headers are present", () => {
      expect(ibkrParser.detect([...IBKR_HEADERS, "ExtraCol"])).toBe(true);
    });

    it("returns false for Zerodha headers", () => {
      const zerodhaHeaders = ["symbol", "isin", "trade_date", "trade_type", "quantity"];
      expect(ibkrParser.detect(zerodhaHeaders)).toBe(false);
    });

    it("returns false for partial headers", () => {
      expect(ibkrParser.detect(["TradeID", "Symbol"])).toBe(false);
    });

    it("returns false for empty headers", () => {
      expect(ibkrParser.detect([])).toBe(false);
    });
  });

  // -- parsing: happy path --

  describe("parse – sample data", () => {
    it("returns 5 valid trades and 1 error", () => {
      const { trades, errors } = ibkrParser.parse(SAMPLE_ROWS);
      expect(trades).toHaveLength(5);
      expect(errors).toHaveLength(1);
    });

    it("sets broker to 'ibkr' on all trades", () => {
      const { trades } = ibkrParser.parse(SAMPLE_ROWS);
      trades.forEach((t) => expect(t.broker).toBe("ibkr"));
    });

    it("maps BOT to BUY and SLD to SELL", () => {
      const { trades } = ibkrParser.parse(SAMPLE_ROWS);
      expect(trades[0].side).toBe("BUY"); // BOT
      expect(trades[1].side).toBe("SELL"); // SLD
    });

    it("normalizes forex symbol EUR.USD to EUR/USD", () => {
      const { trades } = ibkrParser.parse(SAMPLE_ROWS);
      const forexTrade = trades.find((t) => t.symbol === "EUR/USD");
      expect(forexTrade).toBeDefined();
    });

    it("uses currency directly from CSV", () => {
      const { trades } = ibkrParser.parse(SAMPLE_ROWS);
      trades.forEach((t) => expect(t.currency).toBe("USD"));
    });

    it("parses ISO 8601 dates correctly", () => {
      const { trades } = ibkrParser.parse(SAMPLE_ROWS);
      expect(trades[0].executedAt).toBe("2026-04-01T14:30:00.000Z");
      expect(trades[1].executedAt).toBe("2026-04-01T15:45:00.000Z");
    });

    it("parses MM/DD/YYYY fallback date format (row 4)", () => {
      const { trades } = ibkrParser.parse(SAMPLE_ROWS);
      const tslaTrade = trades.find((t) => t.symbol === "TSLA");
      expect(tslaTrade).toBeDefined();
      expect(tslaTrade!.executedAt).toBe("2026-04-03T00:00:00.000Z");
    });

    it("computes totalAmount = price * quantity (negative for SELL)", () => {
      const { trades } = ibkrParser.parse(SAMPLE_ROWS);
      // AAPL: BUY 100 × 185.50 = 18550
      expect(trades[0].totalAmount).toBeCloseTo(18550);
      // MSFT: SELL 50 × 420.25 = -21012.5
      expect(trades[1].totalAmount).toBeCloseTo(-21012.5);
    });

    it("preserves extra fields in rawData (Commission, NetAmount, AccountID, AssetClass)", () => {
      const { trades } = ibkrParser.parse(SAMPLE_ROWS);
      expect(trades[0].rawData).toMatchObject({
        TradeID: "U1234-001",
        AccountID: "U1234567",
        Commission: "-1.00",
        NetAmount: "18549.00",
        AssetClass: "STK",
      });
    });

    it("handles empty Commission field (row 6) as valid trade", () => {
      const { trades } = ibkrParser.parse(SAMPLE_ROWS);
      const googlTrade = trades.find((t) => t.symbol === "GOOGL");
      expect(googlTrade).toBeDefined();
      expect(googlTrade!.rawData.Commission).toBe("");
    });
  });

  // -- parsing: error rows --

  describe("parse – error handling", () => {
    it("skips row with zero quantity and reports reason", () => {
      const { errors } = ibkrParser.parse(SAMPLE_ROWS);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("quantity");
      expect(errors[0].value).toBe("0");
      expect(errors[0].row).toBe(6); // index 4 + 2
    });
  });

  // -- parsing: additional edge cases --

  describe("parse – edge cases", () => {
    it("handles a single valid row", () => {
      const { trades, errors } = ibkrParser.parse([SAMPLE_ROWS[0]]);
      expect(trades).toHaveLength(1);
      expect(errors).toHaveLength(0);
    });

    it("returns empty results for empty input array", () => {
      const { trades, errors } = ibkrParser.parse([]);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it("skips row with unknown Buy/Sell value", () => {
      const row = { ...SAMPLE_ROWS[0], "Buy/Sell": "BOUGHT" };
      const { trades, errors } = ibkrParser.parse([row]);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("side");
    });

    it("skips row with non-numeric price", () => {
      const row = { ...SAMPLE_ROWS[0], TradePrice: "N/A" };
      const { trades, errors } = ibkrParser.parse([row]);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("price");
    });

    it("skips row with negative quantity", () => {
      const row = { ...SAMPLE_ROWS[0], Quantity: "-10" };
      const { trades, errors } = ibkrParser.parse([row]);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("quantity");
    });

    it("skips row with non-numeric quantity", () => {
      const row = { ...SAMPLE_ROWS[0], Quantity: "abc" };
      const { trades, errors } = ibkrParser.parse([row]);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(1);
    });

    it("returns zero trades when all rows are invalid", () => {
      const badRows = [
        { ...SAMPLE_ROWS[0], Quantity: "0" },
        { ...SAMPLE_ROWS[0], "Buy/Sell": "UNKNOWN" },
      ];
      const { trades, errors } = ibkrParser.parse(badRows);
      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(2);
    });
  });
});
