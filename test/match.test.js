import { test } from "node:test";
import assert from "node:assert/strict";
import { match, matchRoutes } from "../js/util.js";

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

// --- matchRoutes(): nested route trees ---------------------------------------

const tree = [
  { path: "/", component: "wc-home" },
  {
    path: "/users",
    component: "wc-users",
    children: [
      { path: "", component: "wc-userindex" },
      { path: ":id", component: "wc-userdetails" }
    ]
  },
  { path: "/misc", redirect: "/about" },
  { path: "*", component: "wc-notfound" }
];

const components = chain => chain.map(c => c.route.component);
const leaf = chain => chain[chain.length - 1];

test("matchRoutes returns the chain down to an index child", () => {
  const chain = matchRoutes(tree, "/users");
  assert.deepEqual(components(chain), ["wc-users", "wc-userindex"]);
  assert.deepEqual(leaf(chain).params, {});
});

test("matchRoutes matches a nested dynamic child with relative path", () => {
  const chain = matchRoutes(tree, "/users/2");
  assert.deepEqual(components(chain), ["wc-users", "wc-userdetails"]);
  assert.deepEqual(leaf(chain).params, { id: "2" });
});

test("matchRoutes accumulates params across nesting levels", () => {
  const teams = [
    {
      path: "/teams/:teamId",
      component: "wc-team",
      children: [{ path: ":userId", component: "wc-member" }]
    }
  ];
  const chain = matchRoutes(teams, "/teams/9/3");
  assert.deepEqual(components(chain), ["wc-team", "wc-member"]);
  assert.deepEqual(leaf(chain).params, { teamId: "9", userId: "3" });
});

test("matchRoutes surfaces a redirect route as a single-entry chain", () => {
  const chain = matchRoutes(tree, "/misc");
  assert.equal(chain.length, 1);
  assert.equal(leaf(chain).route.redirect, "/about");
});

test("matchRoutes falls back to the wildcard for unknown paths", () => {
  const chain = matchRoutes(tree, "/nope/here");
  assert.deepEqual(components(chain), ["wc-notfound"]);
  assert.equal(leaf(chain).params["*"], "nope/here");
});

test("matchRoutes returns null when nothing matches", () => {
  const chain = matchRoutes(
    [{ path: "/about", component: "wc-about" }],
    "/missing"
  );
  assert.equal(chain, null);
});
