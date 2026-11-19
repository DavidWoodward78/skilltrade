import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySlackSignature } from "../../lib/slack/verify.ts";
import { decryptToken, encryptToken } from "../../lib/slack/crypto.ts";

const SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const NOW = 1_763_500_000_000;
const ts = String(Math.floor(NOW / 1000));
const body = "payload=%7B%22type%22%3A%22block_actions%22%7D";
const FIVE_MIN = 300; // the spec, not the implementation constant
const sign = (t: string, b: string, secret = SECRET) => "v0=" + createHmac("sha256", secret).update(`v0:${t}:${b}`).digest("hex");

test("accepts a correctly signed, fresh request", () => {
  assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature: sign(ts, body), rawBody: body, nowMs: NOW }), true);
});

test("rejects a tampered body", () => {
  assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature: sign(ts, body), rawBody: body + "x", nowMs: NOW }), false);
});

test("rejects a signature made with another secret", () => {
  assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature: sign(ts, body, "other"), rawBody: body, nowMs: NOW }), false);
});

test("rejects requests older than 5 minutes (replay)", () => {
  const old = String(Math.floor(NOW / 1000) - FIVE_MIN - 1);
  assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: old, signature: sign(old, body), rawBody: body, nowMs: NOW }), false);
});

test("accepts a request just inside the 5-minute window", () => {
  const edge = String(Math.floor(NOW / 1000) - FIVE_MIN);
  assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: edge, signature: sign(edge, body), rawBody: body, nowMs: NOW }), true);
});

test("rejects timestamps far in the future", () => {
  const future = String(Math.floor(NOW / 1000) + FIVE_MIN + 1);
  assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: future, signature: sign(future, body), rawBody: body, nowMs: NOW }), false);
});

test("rejects missing headers, missing secret and junk timestamps", () => {
  assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: null, signature: sign(ts, body), rawBody: body, nowMs: NOW }), false);
  assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature: null, rawBody: body, nowMs: NOW }), false);
  assert.equal(verifySlackSignature({ signingSecret: undefined, timestamp: ts, signature: sign(ts, body), rawBody: body, nowMs: NOW }), false);
  assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: "12abc", signature: sign("12abc", body), rawBody: body, nowMs: NOW }), false);
  assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature: "v0=short", rawBody: body, nowMs: NOW }), false);
});

test("bot tokens round-trip through encryption and fail with the wrong key or tampering", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const other = Buffer.alloc(32, 9).toString("base64");
  const enc = encryptToken("xoxb-123-secret", key);
  assert.ok(enc.startsWith("v1.") && !enc.includes("xoxb"));
  assert.equal(decryptToken(enc, key), "xoxb-123-secret");
  assert.throws(() => decryptToken(enc, other));
  const parts = enc.split(".");
  parts[3] = Buffer.from("xoxb-999-forged").toString("base64url");
  assert.throws(() => decryptToken(parts.join("."), key));
  assert.throws(() => encryptToken("x", "too-short"));
});
