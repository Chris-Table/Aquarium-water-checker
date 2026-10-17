import { test } from "node:test";
import assert from "node:assert/strict";
import { assess } from "../public/assess.js";

test("clean water needs no change", () => {
  const r = assess({ ammonia: 0, nitrite: 0, nitrate: 10, ph: 7.2 });
  assert.equal(r.verdict, "ok");
  assert.equal(r.actions.length, 0);
});

test("any ammonia means a change soon", () => {
  assert.equal(assess({ ammonia: 0.25, nitrite: 0, nitrate: 5 }).verdict, "change_soon");
});

test("toxic nitrite means a change today", () => {
  const r = assess({ ammonia: 0, nitrite: 1, nitrate: 10 });
  assert.equal(r.verdict, "change_now");
  assert.ok(r.actions.some((a) => a.includes("50%")));
});

test("nitrate thresholds", () => {
  assert.equal(assess({ nitrate: 20 }).verdict, "ok");
  assert.equal(assess({ nitrate: 40 }).verdict, "change_soon");
  assert.equal(assess({ nitrate: 50 }).verdict, "change_now");
});

test("slightly off pH is a watch, not a change", () => {
  assert.equal(assess({ ph: 6.2, ammonia: 0 }).verdict, "watch");
  assert.equal(assess({ ph: 5.5 }).verdict, "change_soon");
});

test("chlorine is urgent", () => {
  assert.equal(assess({ chlorine: 0.5 }).verdict, "change_now");
});

test("missing and empty readings are skipped", () => {
  const r = assess({ ammonia: null, nitrite: "", nitrate: "abc" });
  assert.equal(r.verdict, "unknown");
  assert.equal(assess({ ammonia: "0", nitrate: "15" }).verdict, "ok");
});

test("worst parameter wins and actions are ordered by severity", () => {
  const r = assess({ ph: 6.2, nitrate: 30, ammonia: 1 });
  assert.equal(r.verdict, "change_now");
  assert.match(r.actions[0], /Ammonia|ammonia|50%/);
});
