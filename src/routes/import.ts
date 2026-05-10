import { Hono } from "hono";
import Papa from "papaparse";
import { detectParser } from "../parsers/detectParser.js";

const importRoute = new Hono();

importRoute.post("/import", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!file || !(file instanceof File)) {
    return c.json({ error: "No file uploaded" }, 400);
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return c.json({ error: "File must be a CSV" }, 400);
  }

  const text = await file.text();
  if (!text.trim()) {
    return c.json({ error: "File is empty" }, 400);
  }

  const result = Papa.parse<Record<string, string>>(text, {
    header: true, // include headers
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(), // trim headers
    transform: (v) => v.trim(), // trim values
  });

  if (result.data.length === 0) {
    return c.json({ error: "CSV has no data rows" }, 400);
  }

  const headers = Object.keys(result.data[0]); // convert to string[]
  const parser = detectParser(headers);
  if (!parser) {
    return c.json({ error: "Unrecognized broker format" }, 400);
  }

  const { trades, errors } = parser.parse(result.data);

  return c.json({
    broker: parser.brokerName,
    summary: {
      total: trades.length + errors.length,
      valid: trades.length,
      skipped: errors.length,
    },
    trades,
    errors,
  });
});

export default importRoute;
