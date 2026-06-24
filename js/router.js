"use strict";
import { match } from "./util.js";

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
   * Read the route definitions from the direct wc-route children.
   * Routes are static after mount, so this is collected once in
   * connectedCallback and cached on this._routes.
   *
   * The document title can be updated by providing a title attribute
   * to the wc-route tag.
   */
  collectRoutes() {
    return Array.from(this.querySelectorAll("wc-route"))
      .filter(node => node.parentNode === this)
      .map(r => ({
        path: r.getAttribute("path"),
        // Optional: document title
        title: r.getAttribute("title"),
        // name of the web component that should be displayed
        component: r.getAttribute("component"),
        // Bundle path if lazy loading the component
        resourceUrl: r.getAttribute("resource-url")
      }));
  }

  connectedCallback() {
    this._routes = this.collectRoutes();
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
    const matched = match(this._routes, link.getAttribute("route"));
    if (matched && matched.resourceUrl) {
      this._loadResource(matched.resourceUrl).catch(() => {});
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

  navigate(url) {
    // Skip if we're already on this URL to avoid duplicate history entries.
    if (url === window.location.pathname) return;
    if (this.render(url)) {
      window.history.pushState(null, null, url);
    }
  }

  /**
   * Match the url against the registered routes and update the DOM.
   * Returns true when a route matched, false otherwise. This does not
   * touch the history stack, so it is safe to call from popstate.
   */
  render(url) {
    const matchedRoute = match(this._routes, url);
    if (matchedRoute !== null) {
      this.activeRoute = matchedRoute;
      // Record the resolved URL so update() can report it on route-changed.
      this.activeRoute.url = url;
      this.update();
      return true;
    }
    return false;
  }

  /**
   * Update the DOM under outlet based on the active
   * selected route.
   */
  update() {
    const {
      component,
      title,
      params = {},
      resourceUrl = null,
      path,
      url
    } = this.activeRoute;

    if (!component) return;

    const outlet = this.outlet;
    if (!outlet) {
      console.warn("wc-router: no <wc-outlet> element found; cannot render view.");
      return;
    }

    // Remove all child nodes under outlet element
    while (outlet.firstChild) {
      outlet.removeChild(outlet.firstChild);
    }

    const updateView = () => {
      const view = document.createElement(component);
      document.title = title || document.title;
      for (let key in params) {
        /**
         * all dynamic param value will be passed
         * as the attribute to the newly created element
         * except * value.
         */
        if (key !== "*") view.setAttribute(key, params[key]);
      }

      outlet.appendChild(view);
      // Update the route links once the DOM is updated
      this.updateLinks();
      // Notify listeners (analytics, auth checks, etc.) that the view for the
      // active route is now mounted. Bubbles so it can be observed from the
      // router element or from document.
      this.dispatchEvent(
        new CustomEvent("route-changed", {
          bubbles: true,
          detail: { url, path, title, component, params }
        })
      );
    };

    if (resourceUrl !== null) {
      this._loadResource(resourceUrl)
        .then(updateView)
        .catch(error => {
          console.error(`wc-router: failed to load "${resourceUrl}"`, error);
          const message = document.createElement("div");
          message.className = "page";
          message.textContent = "Failed to load this page. Please try again.";
          outlet.appendChild(message);
        });
    } else {
      updateView();
    }
  }

  go(url) {
    this.navigate(url);
  }

  back() {
    window.history.go(-1);
  }
}

customElements.define("wc-router", Router);
