import { test } from "node:test";
import assert from "node:assert/strict";
import { match } from "../js/util.js";

// Route table mirroring index.html (order matters: the "*" fallback is last).
const routes = [
  { path: "/", component: "wc-home" },
  { path: "/about", component: "wc-about" },
  { path: "/contact", component: "wc-contact", resourceUrl: "./pages/contact.js" },
  { path: "/users", component: "wc-users" },
  { path: "/users/:id", component: "wc-userdetails" },
  { path: "*", component: "wc-notfound" }
];

test("matches the root path", () => {
  const m = match(routes, "/");
  assert.equal(m.component, "wc-home");
});

test("matches a static path", () => {
  assert.equal(match(routes, "/about").component, "wc-about");
  assert.equal(match(routes, "/users").component, "wc-users");
});

test("carries resourceUrl through on the matched route", () => {
  assert.equal(match(routes, "/contact").resourceUrl, "./pages/contact.js");
});

test("extracts dynamic params", () => {
  const m = match(routes, "/users/42");
  assert.equal(m.component, "wc-userdetails");
  assert.deepEqual(m.params, { id: "42" });
});

test("decodes percent-encoded dynamic segments", () => {
  assert.equal(match(routes, "/users/john%20doe").params.id, "john doe");
});

test("falls back to the raw segment on malformed encoding", () => {
  // decodeURIComponent("%") throws; safeDecode returns the raw segment.
  assert.equal(match(routes, "/users/%").params.id, "%");
});

test("strips the query string before matching", () => {
  assert.equal(match(routes, "/about?ref=nav").component, "wc-about");
});

test("does not treat the root path as a dynamic match", () => {
  // The isRootUri guard prevents "/" from matching "/:id".
  const dynamicOnly = [{ path: "/:id", component: "wc-thing" }];
  assert.equal(match(dynamicOnly, "/"), null);
});

test("matches the wildcard for unknown paths", () => {
  const m = match(routes, "/nope/here");
  assert.equal(m.component, "wc-notfound");
  assert.equal(m.params["*"], "nope/here");
});

test("returns null when nothing matches and there is no wildcard", () => {
  const noFallback = [{ path: "/about", component: "wc-about" }];
  assert.equal(match(noFallback, "/missing"), null);
});
