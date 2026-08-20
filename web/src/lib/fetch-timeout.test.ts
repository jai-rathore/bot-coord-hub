import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { fetchWithTimeout } from "./fetch-timeout";

/** A server that accepts the connection and then never answers. */
function hangingServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server: Server = createServer(() => {
      // deliberately no response
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

test("aborts a request that never answers", async () => {
  const server = await hangingServer();
  try {
    const startedAt = Date.now();
    await assert.rejects(
      () => fetchWithTimeout(server.url, {}, 150),
      (error: Error) => error.name === "TimeoutError" || error.name === "AbortError",
    );
    assert.ok(
      Date.now() - startedAt < 2_000,
      "should give up at the deadline, not hang",
    );
  } finally {
    await server.close();
  }
});

test("a caller's own signal still aborts before the deadline", async () => {
  const server = await hangingServer();
  const controller = new AbortController();
  try {
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(
      () => fetchWithTimeout(server.url, { signal: controller.signal }, 30_000),
      (error: Error) => error.name === "AbortError" || error.name === "TimeoutError",
    );
  } finally {
    await server.close();
  }
});

test("passes a normal response straight through", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const res = await fetchWithTimeout(`http://127.0.0.1:${port}`, {}, 5_000);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
});
