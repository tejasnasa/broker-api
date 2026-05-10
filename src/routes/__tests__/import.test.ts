import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import importRoute from "../../routes/import.js";

// Build a test app with just the import route (avoids triggering serve() from index.ts)
const app = new Hono();
app.route("/api", importRoute);

// Helper to resolve paths relative to this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");

// Read the actual CSV files from src/data/
const ZERODHA_CSV = fs.readFileSync(path.join(dataDir, "zerodha.csv"), "utf-8");
const IBKR_CSV = fs.readFileSync(path.join(dataDir, "ibkr.csv"), "utf-8");

/** Helper: build a multipart/form-data request with a CSV file */
function buildUploadRequest(
  csvContent: string,
  filename = "test.csv",
): Request {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([csvContent], { type: "text/csv" }),
    filename,
  );
  return new Request("http://localhost/api/import", {
    method: "POST",
    body: formData,
  });
}

// -- Tests --

describe("POST /api/import", () => {
  // -- Zerodha CSV --

  describe("Zerodha CSV upload", () => {
    it("returns 200 with correct broker and summary", async () => {
      const res = await app.request(buildUploadRequest(ZERODHA_CSV));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.broker).toBe("zerodha");
      expect(body.summary).toEqual({ total: 7, valid: 5, skipped: 2 });
    });

    it("returns 5 valid trades", async () => {
      const res = await app.request(buildUploadRequest(ZERODHA_CSV));
      const body = await res.json();
      expect(body.trades).toHaveLength(5);
    });

    it("returns 2 errors with row numbers and reasons", async () => {
      const res = await app.request(buildUploadRequest(ZERODHA_CSV));
      const body = await res.json();
      expect(body.errors).toHaveLength(2);
      expect(body.errors[0].row).toBe(7);
      expect(body.errors[1].row).toBe(8);
    });
  });

  // -- IBKR CSV --

  describe("IBKR CSV upload", () => {
    it("returns 200 with correct broker and summary", async () => {
      const res = await app.request(buildUploadRequest(IBKR_CSV));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.broker).toBe("ibkr");
      expect(body.summary).toEqual({ total: 6, valid: 5, skipped: 1 });
    });

    it("returns 5 valid trades", async () => {
      const res = await app.request(buildUploadRequest(IBKR_CSV));
      const body = await res.json();
      expect(body.trades).toHaveLength(5);
    });

    it("returns 1 error for zero-quantity row", async () => {
      const res = await app.request(buildUploadRequest(IBKR_CSV));
      const body = await res.json();
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0].field).toBe("quantity");
    });
  });

  // -- Error scenarios --

  describe("error handling", () => {
    it("returns 400 when no file is uploaded", async () => {
      const formData = new FormData();
      const req = new Request("http://localhost/api/import", {
        method: "POST",
        body: formData,
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("No file uploaded");
    });

    it("returns 400 for non-CSV file", async () => {
      const formData = new FormData();
      formData.append(
        "file",
        new Blob(["hello world"], { type: "text/plain" }),
        "data.txt",
      );
      const req = new Request("http://localhost/api/import", {
        method: "POST",
        body: formData,
      });
      const res = await app.request(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("File must be a CSV");
    });

    it("returns 400 for empty CSV file", async () => {
      const res = await app.request(buildUploadRequest(""));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("File is empty");
    });

    it("returns 400 for whitespace-only CSV file", async () => {
      const res = await app.request(buildUploadRequest("   \n  \n  "));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("File is empty");
    });

    it("returns 400 for unrecognized broker format", async () => {
      const csv = "col1,col2,col3\nval1,val2,val3\n";
      const res = await app.request(buildUploadRequest(csv));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("Unrecognized broker format");
    });

    it("returns 400 for CSV with only headers and no data rows", async () => {
      const csv = "symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment\n";
      const res = await app.request(buildUploadRequest(csv));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe("CSV has no data rows");
    });
  });

  // -- Edge cases --

  describe("edge cases", () => {
    it("handles a single valid Zerodha row", async () => {
      const csv = [
        "symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment",
        "RELIANCE,INE002A01018,01-04-2026,buy,10,2450.50,TRD001,ORD001,NSE,EQ",
      ].join("\n");

      const res = await app.request(buildUploadRequest(csv));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.summary).toEqual({ total: 1, valid: 1, skipped: 0 });
      expect(body.trades[0].symbol).toBe("RELIANCE");
    });

    it("handles CSV where all rows are invalid", async () => {
      const csv = [
        "symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment",
        "RELIANCE,INE002A01018,invalid_date,buy,10,2450.50,TRD001,ORD001,NSE,EQ",
        "WIPRO,INE075A01022,05-04-2026,buy,-5,450.00,TRD007,ORD007,NSE,EQ",
      ].join("\n");

      const res = await app.request(buildUploadRequest(csv));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.summary.valid).toBe(0);
      expect(body.summary.skipped).toBe(2);
      expect(body.trades).toHaveLength(0);
      expect(body.errors).toHaveLength(2);
    });

    it("response shape matches expected structure", async () => {
      const res = await app.request(buildUploadRequest(ZERODHA_CSV));
      const body = await res.json();

      // verify top-level keys
      expect(body).toHaveProperty("broker");
      expect(body).toHaveProperty("summary");
      expect(body).toHaveProperty("trades");
      expect(body).toHaveProperty("errors");

      // verify summary shape
      expect(body.summary).toHaveProperty("total");
      expect(body.summary).toHaveProperty("valid");
      expect(body.summary).toHaveProperty("skipped");

      // verify trade shape
      const trade = body.trades[0];
      expect(trade).toHaveProperty("symbol");
      expect(trade).toHaveProperty("side");
      expect(trade).toHaveProperty("quantity");
      expect(trade).toHaveProperty("price");
      expect(trade).toHaveProperty("totalAmount");
      expect(trade).toHaveProperty("currency");
      expect(trade).toHaveProperty("executedAt");
      expect(trade).toHaveProperty("broker");
      expect(trade).toHaveProperty("rawData");

      // verify error shape
      const error = body.errors[0];
      expect(error).toHaveProperty("row");
      expect(error).toHaveProperty("field");
      expect(error).toHaveProperty("reason");
    });
  });
});
