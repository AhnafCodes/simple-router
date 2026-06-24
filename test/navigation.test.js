import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mountRouter,
  pushCalls,
  replaceCalls,
  DomEvent,
  document
} from "./setup.js";

const tag = el => el && el.tagName.toLowerCase();

test("renders the initial route on mount", () => {
  const router = mountRouter("/");
  assert.equal(tag(router.outlet.firstChild), "wc-home");
  // Initial render reuses the existing history entry; nothing is pushed.
  assert.equal(pushCalls.length, 0);
});

test("navigate swaps the view and pushes a history entry", () => {
  const router = mountRouter("/");
  router.navigate("/about");
  assert.equal(tag(router.outlet.firstChild), "wc-about");
  assert.deepEqual(pushCalls, ["/about"]);
});

test("navigate to the current URL is a no-op", () => {
  const router = mountRouter("/about");
  router.navigate("/about");
  assert.equal(pushCalls.length, 0);
});

test("renders a nested route into the layout's outlet with params", () => {
  const router = mountRouter("/");
  router.navigate("/users/42");
  // The layout mounts in the router's outlet...
  assert.equal(tag(router.outlet.firstChild), "wc-users");
  // ...and the child mounts in the layout's nested outlet, with its param.
  const details = router.outlet.querySelector("wc-userdetails");
  assert.ok(details, "expected wc-userdetails nested in the layout");
  assert.equal(details.getAttribute("id"), "42");
});

test("renders the index child for the parent's exact path", () => {
  const router = mountRouter("/");
  router.navigate("/users");
  assert.equal(tag(router.outlet.firstChild), "wc-users");
  assert.ok(
    router.outlet.querySelector("wc-userindex"),
    "expected the index child to render in the layout"
  );
  // The detail child should not be present at the parent path.
  assert.equal(router.outlet.querySelector("wc-userdetails"), null);
});

test("falls back to the wildcard route for unknown paths", () => {
  const router = mountRouter("/");
  router.navigate("/no/such/page");
  assert.equal(tag(router.outlet.firstChild), "wc-notfound");
});

test("emits route-changed with the matched route detail", () => {
  const router = mountRouter("/");
  const events = [];
  router.addEventListener("route-changed", e => events.push(e.detail));
  router.navigate("/about");

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    url: "/about",
    path: "/about",
    title: "About Us",
    component: "wc-about",
    params: {}
  });
});

test("route-changed bubbles to the document", () => {
  const router = mountRouter("/");
  let detail = null;
  const onChange = e => (detail = e.detail);
  document.addEventListener("route-changed", onChange);
  router.navigate("/users");
  document.removeEventListener("route-changed", onChange);
  // The event reports the leaf of the matched chain (the index child).
  assert.equal(detail.component, "wc-userindex");
});

test("data-prefetch link warms the lazy resource cache on hover", () => {
  const router = mountRouter("/");
  const link = router.querySelector("a[route='/contact'][data-prefetch]");
  assert.equal(router._resources.has("./pages/contact.js"), false);

  link.dispatchEvent(new DomEvent("pointerover", { bubbles: true }));
  assert.equal(router._resources.has("./pages/contact.js"), true);
});

test("data-prefetch warms the cache on keyboard focus too", () => {
  const router = mountRouter("/");
  const link = router.querySelector("a[route='/contact'][data-prefetch]");
  link.dispatchEvent(new DomEvent("focusin", { bubbles: true }));
  assert.equal(router._resources.has("./pages/contact.js"), true);
});

test("plain links without data-prefetch do not prefetch", () => {
  const router = mountRouter("/");
  const link = router.querySelector("a[route='/about']");
  link.dispatchEvent(new DomEvent("pointerover", { bubbles: true }));
  // /about isn't lazy and isn't marked, so nothing is cached.
  assert.equal(router._resources.size, 0);
});

test("navigate to a redirect lands on the target with one history entry", () => {
  const router = mountRouter("/");
  router.navigate("/misc");
  assert.equal(tag(router.outlet.firstChild), "wc-about");
  // History holds the destination only — never the /misc source.
  assert.deepEqual(pushCalls, ["/about"]);
});

test("loading a redirect URL directly rewrites the bar via replaceState", () => {
  const router = mountRouter("/misc");
  assert.equal(tag(router.outlet.firstChild), "wc-about");
  assert.deepEqual(replaceCalls, ["/about"]);
  assert.equal(pushCalls.length, 0);
});

test("a redirect loop is detected rather than hanging", () => {
  const router = mountRouter("/");
  const originalError = console.error;
  console.error = () => {}; // silence the expected loop warning
  try {
    assert.equal(router.render("/loop-a"), false);
  } finally {
    console.error = originalError;
  }
});
