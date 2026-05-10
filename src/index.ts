import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import importRoute from "./routes/import.js";

const app = new Hono();

app.use(cors());

app.use(logger());

app.get("/healthz", (c) => {
  return c.json({ status: "ok" });
});

app.route("/api", importRoute);

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

export default app;
