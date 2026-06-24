"use strict";
import { matchRoutes } from "./util.js";

// Cap on how many redirects a single navigation may follow before we assume a
// loop and bail out.
const MAX_REDIRECTS = 10;

export default class Router extends HTMLElement {
  /**
   * Router looks for a wc-outlet tag for updating the views on history updates.
   * Example:
   *
   * <wc-router>
   *  <wc-outlet>
   *    <!-- All DOM update will be happening here on route change -->
   *  </wc-outlet>
   * </wc-router>
   */
  // Cache of in-flight / resolved lazy-route imports, keyed by resource-url.
  // Shared by prefetch and navigation so a hovered route isn't fetched twice.
  _resources = new Map();

  get outlet() {
    return this.querySelector("wc-outlet");
  }

  /**
   * Read the route definitions from the wc-route children as a tree, so nested
   * <wc-route> elements become nested routes whose paths are relative to their
   * parent. Routes are static after mount, so this is built once in
   * connectedCallback and cached on this._routes.
   *
   * The document title can be updated by providing a title attribute
   * to the wc-route tag.
   */
  buildRouteTree(parent) {
    return Array.from(parent.children)
      .filter(node => node.tagName === "WC-ROUTE")
      .map(r => ({
        // Path relative to the parent route ("" / omitted = index route).
        path: r.getAttribute("path"),
        // Optional: document title
        title: r.getAttribute("title"),
        // name of the web component that should be displayed
        component: r.getAttribute("component"),
        // Bundle path if lazy loading the component
        resourceUrl: r.getAttribute("resource-url"),
        // Optional: redirect target path (matched routes navigate here instead)
        redirect: r.getAttribute("redirect"),
        // Nested routes, rendered into this route's component's <wc-outlet>
        children: this.buildRouteTree(r)
      }));
  }

  connectedCallback() {
    this._routes = this.buildRouteTree(this);
    // Click and prefetch handling are delegated from the router, so handlers
    // are bound once here rather than re-bound on every render. pointerover /
    // focusin are used (not mouseenter / focus) because they bubble.
    this.addEventListener("click", this._handleLinkClick);
    this.addEventListener("pointerover", this._handlePrefetch);
    this.addEventListener("focusin", this._handlePrefetch);
    this.updateLinks();
    // Initial render: the browser already has a history entry for this URL,
    // so render in place rather than pushing a duplicate.
    this.render(window.location.pathname);

    window.addEventListener("popstate", this._handlePopstate);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this._handleLinkClick);
    this.removeEventListener("pointerover", this._handlePrefetch);
    this.removeEventListener("focusin", this._handlePrefetch);
    window.removeEventListener("popstate", this._handlePopstate);
  }

  _handleLinkClick = e => {
    // Let the browser handle modified / non-primary clicks (open in new
    // tab/window, download, etc.) since the links have real href values.
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    const link = e.target.closest("a[route]");
    if (!link || !this.contains(link)) return;
    e.preventDefault();
    this.navigate(link.getAttribute("route"));
  };

  _handlePopstate = () => {
    // History already moved; just re-render without pushing a new entry.
    this.render(window.location.pathname);
  };

  /**
   * Prefetch a lazy route's bundle when the user signals intent toward it by
   * hovering or keyboard-focusing a link marked with data-prefetch. Best
   * effort: only lazy routes (those with a resource-url) have anything to
   * fetch, and failures are swallowed so navigation can retry later.
   */
  _handlePrefetch = e => {
    const link = e.target.closest("a[route][data-prefetch]");
    if (!link || !this.contains(link)) return;
    const chain = matchRoutes(this._routes, link.getAttribute("route"));
    if (!chain) return;
    // Prefetch every lazy module in the chain (layout + nested children).
    for (const { route } of chain) {
      if (route.resourceUrl) this._loadResource(route.resourceUrl).catch(() => {});
    }
  };

  /**
   * Import a lazy route's module, caching the promise so a prefetch and the
   * later navigation share a single import. A failed import is evicted from
   * the cache so a subsequent attempt can retry rather than reuse the
   * rejected promise.
   */
  _loadResource(url) {
    if (!this._resources.has(url)) {
      const p = import(url).catch(error => {
        this._resources.delete(url);
        throw error;
      });
      this._resources.set(url, p);
    }
    return this._resources.get(url);
  }

  updateLinks() {
    /**
     * Mirror the route attribute onto href so links render as real,
     * navigable anchors (hover, middle-click, open-in-new-tab).
     * Click handling is delegated from the router, so no per-link
     * handlers are bound here.
     */
    this.querySelectorAll("a[route]").forEach(link => {
      link.setAttribute("href", link.getAttribute("route"));
    });
  }

  /**
   * Match a url against the route tree, following any redirects, and return
   * the final { url, chain } to render — or null if nothing matches or a
   * redirect loop is detected. Pure: touches neither history nor the DOM.
   */
  resolve(url, depth = 0) {
    const chain = matchRoutes(this._routes, url);
    if (chain === null) return null;

    const leaf = chain[chain.length - 1].route;
    if (leaf.redirect != null) {
      if (depth >= MAX_REDIRECTS) {
        console.error(`wc-router: redirect loop detected at "${url}"`);
        return null;
      }
      return this.resolve(leaf.redirect, depth + 1);
    }

    return { url, chain };
  }

  navigate(url) {
    // Skip if we're already on this URL to avoid duplicate history entries.
    if (url === window.location.pathname) return;
    const resolved = this.resolve(url);
    if (resolved === null) return;
    // A redirect may have resolved us back onto the current URL; don't push a
    // duplicate entry in that case.
    if (resolved.url === window.location.pathname) return;
    // Push the final (post-redirect) URL so history never holds the
    // intermediate redirect source.
    window.history.pushState(null, null, resolved.url);
    this._apply(resolved);
  }

  /**
   * Match the url against the registered routes and update the DOM. Returns
   * true when a route matched, false otherwise. Used for the initial render
   * and popstate, so it does not push history — but it will replaceState to
   * correct the address bar if a redirect changed the URL.
   */
  render(url) {
    const resolved = this.resolve(url);
    if (resolved === null) return false;
    if (resolved.url !== url) {
      window.history.replaceState(null, null, resolved.url);
    }
    this._apply(resolved);
    return true;
  }

  _apply(resolved) {
    this.activeChain = resolved.chain;
    this.activeUrl = resolved.url;
    this.update();
  }

  /**
   * Render the active route chain into nested outlets: the first route's
   * component goes in the router's <wc-outlet>, the next renders into that
   * component's own <wc-outlet>, and so on.
   */
  update() {
    const outlet = this.outlet;
    if (!outlet) {
      console.warn("wc-router: no <wc-outlet> element found; cannot render view.");
      return;
    }

    // Remove all child nodes under the outlet element.
    while (outlet.firstChild) {
      outlet.removeChild(outlet.firstChild);
    }

    this._renderChainFrom(this.activeChain, 0, outlet);
  }

  _renderChainFrom(chain, index, outlet) {
    if (index >= chain.length) {
      this._finishRender(chain);
      return;
    }

    const { route, params } = chain[index];

    // A route with no component (e.g. a pure grouping route) renders nothing
    // itself; its children mount into the same outlet.
    if (!route.component) {
      this._renderChainFrom(chain, index + 1, outlet);
      return;
    }

    const mount = () => {
      const view = document.createElement(route.component);
      document.title = route.title || document.title;
      for (let key in params) {
        // Dynamic param values are passed as attributes, except the * capture.
        if (key !== "*") view.setAttribute(key, params[key]);
      }
      outlet.appendChild(view);

      // Descend into this component's own <wc-outlet> for the next level.
      const nestedOutlet = view.querySelector("wc-outlet");
      if (index + 1 < chain.length && !nestedOutlet) {
        console.warn(
          `wc-router: <${route.component}> has no <wc-outlet>; cannot render nested route.`
        );
        this._finishRender(chain);
        return;
      }
      this._renderChainFrom(chain, index + 1, nestedOutlet);
    };

    if (route.resourceUrl != null) {
      this._loadResource(route.resourceUrl)
        .then(mount)
        .catch(error => {
          console.error(`wc-router: failed to load "${route.resourceUrl}"`, error);
          const message = document.createElement("div");
          message.className = "page";
          message.textContent = "Failed to load this page. Please try again.";
          outlet.appendChild(message);
        });
    } else {
      mount();
    }
  }

  _finishRender(chain) {
    // Update the route links once the DOM is updated.
    this.updateLinks();
    // Notify listeners (analytics, auth checks, etc.) that the view for the
    // active route is now mounted. Bubbles so it can be observed from the
    // router element or from document. Reports the leaf route's details.
    const { route, params } = chain[chain.length - 1];
    this.dispatchEvent(
      new CustomEvent("route-changed", {
        bubbles: true,
        detail: {
          url: this.activeUrl,
          path: route.path,
          title: route.title,
          component: route.component,
          params
        }
      })
    );
  }

  go(url) {
    this.navigate(url);
  }

  back() {
    window.history.go(-1);
  }
}

customElements.define("wc-router", Router);
