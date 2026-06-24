// Test harness for the DOM-driven router tests.
//
// router.js and the page components read browser globals (window, document,
// customElements, HTMLElement, CustomEvent) at module-load time, so we build a
// linkedom DOM and assign those globals BEFORE dynamically importing them.
// linkedom upgrades custom elements and fires connectedCallback on append, but
// it provides no window.location / window.history, so we stub those.
import { parseHTML } from "linkedom";

const dom = parseHTML("<!doctype html><html><body></body></html>");
const { window, document } = dom;

// History / location stubs. pushState records its calls and updates the
// fake pathname so navigate()'s "already here" guard behaves like a browser.
export const pushCalls = [];
export const replaceCalls = [];
window.location = { pathname: "/" };
window.history = {
  pushState: (state, title, url) => {
    pushCalls.push(url);
    window.location.pathname = url;
  },
  replaceState: (state, title, url) => {
    replaceCalls.push(url);
    window.location.pathname = url;
  },
  go: () => {}
};
if (typeof window.addEventListener !== "function") window.addEventListener = () => {};
if (typeof window.removeEventListener !== "function") window.removeEventListener = () => {};

// Expose the globals router.js + components expect.
globalThis.window = window;
globalThis.document = document;
globalThis.customElements = dom.customElements;
globalThis.HTMLElement = dom.HTMLElement;
globalThis.CustomEvent = dom.CustomEvent;
export const DomEvent = dom.Event;

// Register the page components and the router (defines <wc-router>). Dynamic
// import so the globals above are in place first.
await import("../js/pages/index.js");
await import("../js/router.js");

// Inner markup of <wc-router>, mirroring index.html.
const ROUTER_MARKUP = `
  <nav class="nav">
    <ul>
      <li><a route="/">Home</a></li>
      <li><a route="/about">About</a></li>
      <li><a route="/contact" data-prefetch>Contact</a></li>
      <li><a route="/users">Users</a></li>
    </ul>
  </nav>
  <wc-route path="/" title="Home" component="wc-home"></wc-route>
  <wc-route path="/about" title="About Us" component="wc-about"></wc-route>
  <wc-route path="/contact" title="Contact Us" component="wc-contact" resource-url="./pages/contact.js"></wc-route>
  <wc-route path="/users" title="Users" component="wc-users">
    <wc-route path="" component="wc-userindex"></wc-route>
    <wc-route path=":id" title="User Details" component="wc-userdetails"></wc-route>
  </wc-route>
  <wc-route path="/misc" redirect="/about"></wc-route>
  <wc-route path="/loop-a" redirect="/loop-b"></wc-route>
  <wc-route path="/loop-b" redirect="/loop-a"></wc-route>
  <wc-route path="*" title="404" component="wc-notfound"></wc-route>
  <wc-outlet></wc-outlet>
`;

/**
 * Mount a fresh <wc-router> at the given path. Resets the shared location and
 * pushState log so each test starts clean. Appending the element fires
 * connectedCallback, which renders the initial route.
 */
export function mountRouter(initialPath = "/") {
  const existing = document.querySelector("wc-router");
  if (existing) existing.remove();
  pushCalls.length = 0;
  replaceCalls.length = 0;
  window.location.pathname = initialPath;

  const router = document.createElement("wc-router");
  router.innerHTML = ROUTER_MARKUP;
  document.body.appendChild(router);
  return router;
}

export { dom, document, window };
