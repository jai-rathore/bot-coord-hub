import { createServer } from "node:http";
import { DEFAULT_PORT, startServer } from "./server.js";

const port = Number(process.env.PORT ?? DEFAULT_PORT);

if (
  process.env.NODE_ENV === "production" &&
  process.env.ENABLE_LEGACY_HUB !== "true"
) {
  createServer((_request, response) => {
    response.writeHead(410, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      JSON.stringify({
        error: "retired",
        message: "The legacy Bot Coord API has been retired. Use honeymatcha.io.",
        canonical: "https://honeymatcha.io",
      }),
    );
  }).listen(port, "0.0.0.0", () => {
    console.log(`legacy hub tombstone listening on 0.0.0.0:${port}`);
  });
} else {
  startServer(port);
}
