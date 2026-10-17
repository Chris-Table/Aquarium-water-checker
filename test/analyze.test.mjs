// Checks that the API rejects bad requests before calling Claude.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ANTHROPIC_API_KEY ??= "test-key";
const { default: handler, config } = await import("../netlify/functions/analyze.mjs");

const URL_ = "https://example.netlify.app/api/analyze";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]).toString("base64");

function post(body, headers = {}) {
  return new Request(URL_, {
    method: "POST",
    headers: { origin: "https://example.netlify.app", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("rejects other methods", async () => {
  assert.equal((await handler(new Request(URL_))).status, 405);
});

test("rejects requests from other sites or with no origin", async () => {
  assert.equal((await handler(post({ image: JPEG, mediaType: "image/jpeg" }, { origin: "https://evil.example" }))).status, 403);
  const noOrigin = new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal((await handler(noOrigin)).status, 403);
});

test("rejects non-JSON bodies", async () => {
  assert.equal((await handler(post("x", { "content-type": "text/plain" }))).status, 415);
  assert.equal((await handler(post("not json"))).status, 400);
  assert.equal((await handler(post("null"))).status, 400);
});

test("rejects bad or mislabeled images", async () => {
  assert.equal((await handler(post({ image: JPEG, mediaType: "image/svg+xml" }))).status, 400);
  assert.equal((await handler(post({ image: "not base64!", mediaType: "image/jpeg" }))).status, 400);
  assert.equal((await handler(post({ image: JPEG, mediaType: "image/png" }))).status, 400);
  assert.equal((await handler(post({ image: "A".repeat(5_600_000), mediaType: "image/jpeg" }))).status, 413);
});

test("is rate limited per visitor", () => {
  assert.ok(config.rateLimit.windowLimit > 0);
  assert.deepEqual(config.rateLimit.aggregateBy, ["ip", "domain"]);
});
