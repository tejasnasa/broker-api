# broker-api

A trade normalization service that takes CSV exports from different brokers and converts them into a standardized format. Each broker uses different column names, date formats, and data layouts which is automatically mapped by this service.

Currently supported brokers:
- **Zerodha**: Indian equity broker (NSE/BSE)
- **Interactive Brokers (IBKR)**: International multi-asset broker

## Getting Started

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Run tests
npm test
```

The server runs at `http://localhost:3000`.

## API

### `POST /api/import`

Upload a broker CSV and get back normalized trades. The broker format is auto-detected from column headers.

```bash
curl -X POST http://localhost:3000/api/import \
  -F "file=@trades.csv"
```

#### Response

```json
{
  "broker": "zerodha",
  "summary": { "total": 7, "valid": 5, "skipped": 2 },
  "trades": [
    {
      "symbol": "RELIANCE",
      "side": "BUY",
      "quantity": 10,
      "price": 2450.5,
      "totalAmount": 24505,
      "currency": "INR",
      "executedAt": "2026-04-01T00:00:00.000Z",
      "broker": "zerodha",
      "rawData": { "..." }
    }
  ],
  "errors": [
    { "row": 7, "field": "executed_at", "value": "invalid_date", "reason": "Invalid date" }
  ]
}
```

| Status | Error | When |
|--------|-------|------|
| 400 | `No file uploaded` | Missing file field |
| 400 | `File must be a CSV` | Wrong file extension |
| 400 | `File is empty` | Empty file body |
| 400 | `CSV has no data rows` | Headers only, no data |
| 400 | `Unrecognized broker format` | Unknown column headers |

### `GET /healthz`

Returns `{ "status": "ok" }`.

## Testing

```bash
npm test          # single run
npm run test:watch  # watch mode
```

87 tests across 5 files:

| File | What it covers |
|------|---------------|
| `utils.test.ts` | Date parsing across ISO 8601, DD-MM-YYYY, MM/DD/YYYY formats |
| `zerodha.test.ts` | Zerodha parser: valid trades, error rows, edge cases |
| `ibkr.test.ts` | IBKR parser: BOT/SLD mapping, symbol normalization, edge cases |
| `detectParser.test.ts` | Broker auto-detection and unknown format handling |
| `import.test.ts` | Full API integration: file uploads, error responses, response shape |

## Design Decisions

**Adding a new broker**: Each broker implements a [`BrokerParser`](src/schemas/BrokerParserSchema.ts) interface (`detect` + `parse`). To add a new broker, create a parser file and register it in the `PARSERS` array in [`detectParser.ts`](src/parsers/detectParser.ts). No existing code needs to change.

**Row-level error handling**: Bad rows are skipped individually with detailed reasons (row number, field, value). A single bad row doesn't kill the entire import. This matters for financial data where partial imports are more useful than total failures.

**Currency inference**: Zerodha CSVs don't include currency, so it's inferred from the exchange (NSE/BSE -> INR). IBKR includes it directly.

**rawData preservation**: Every original CSV field is kept in `rawData`, including ones we don't use for normalization (Commission, NetAmount, etc.). Nothing is thrown away.

**totalAmount**: Positive for buys, negative for sells (`price × quantity × (+1/-1)`).

## Built With

- [Hono](https://hono.dev/) - HTTP framework
- [PapaParse](https://www.papaparse.com/) - CSV parsing
- [Zod](https://zod.dev/) - Schema validation
- [Vitest](https://vitest.dev/) - Testing
