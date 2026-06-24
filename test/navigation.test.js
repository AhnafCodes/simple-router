import { test } from "node:test";
import assert from "node:assert/strict";
import { mountRouter, pushCalls, DomEvent, document } from "./setup.js";

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

test("renders dynamic params onto the view element", () => {
  const router = mountRouter("/");
  router.navigate("/users/42");
  const view = router.outlet.firstChild;
  assert.equal(tag(view), "wc-userdetails");
  assert.equal(view.getAttribute("id"), "42");
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
  assert.equal(detail.component, "wc-users");
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
