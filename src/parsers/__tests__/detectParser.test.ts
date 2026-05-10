import { describe, it, expect } from "vitest";
import { detectParser } from "../detectParser.js";

const ZERODHA_HEADERS = [
  "symbol", "isin", "trade_date", "trade_type", "quantity",
  "price", "trade_id", "order_id", "exchange", "segment",
];

const IBKR_HEADERS = [
  "TradeID", "AccountID", "Symbol", "DateTime", "Buy/Sell",
  "Quantity", "TradePrice", "Currency", "Commission", "NetAmount", "AssetClass",
];

describe("detectParser", () => {
  it("detects Zerodha format from headers", () => {
    const parser = detectParser(ZERODHA_HEADERS);
    expect(parser).not.toBeNull();
    expect(parser!.brokerName).toBe("zerodha");
  });

  it("detects IBKR format from headers", () => {
    const parser = detectParser(IBKR_HEADERS);
    expect(parser).not.toBeNull();
    expect(parser!.brokerName).toBe("ibkr");
  });

  it("detects Zerodha even with extra columns", () => {
    const parser = detectParser([...ZERODHA_HEADERS, "notes", "category"]);
    expect(parser).not.toBeNull();
    expect(parser!.brokerName).toBe("zerodha");
  });

  it("detects IBKR even with extra columns", () => {
    const parser = detectParser([...IBKR_HEADERS, "ExtraField"]);
    expect(parser).not.toBeNull();
    expect(parser!.brokerName).toBe("ibkr");
  });

  it("returns null for unrecognized headers", () => {
    expect(detectParser(["col1", "col2", "col3"])).toBeNull();
  });

  it("returns null for empty headers array", () => {
    expect(detectParser([])).toBeNull();
  });

  it("returns null for partially matching Zerodha headers", () => {
    expect(detectParser(["symbol", "price", "quantity"])).toBeNull();
  });

  it("returns null for partially matching IBKR headers", () => {
    expect(detectParser(["TradeID", "Symbol", "Currency"])).toBeNull();
  });

  it("returns the first matching parser (Zerodha is checked first)", () => {
    // if headers somehow match both, Zerodha should win since it's first in the array
    const combined = [...ZERODHA_HEADERS, ...IBKR_HEADERS];
    const parser = detectParser(combined);
    expect(parser).not.toBeNull();
    expect(parser!.brokerName).toBe("zerodha");
  });
});
