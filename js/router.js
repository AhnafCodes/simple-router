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
    // Click handling is delegated from the router, so handlers are bound
    // once here rather than re-bound on every render.
    this.addEventListener("click", this._handleLinkClick);
    this.updateLinks();
    // Initial render: the browser already has a history entry for this URL,
    // so render in place rather than pushing a duplicate.
    this.render(window.location.pathname);

    window.addEventListener("popstate", this._handlePopstate);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this._handleLinkClick);
    window.removeEventListener("popstate", this._handlePopstate);
  }

  _handleLinkClick = e => {
    const link = e.target.closest("a[route]");
    if (!link || !this.contains(link)) return;
    e.preventDefault();
    this.navigate(link.getAttribute("route"));
  };

  _handlePopstate = () => {
    // History already moved; just re-render without pushing a new entry.
    this.render(window.location.pathname);
  };

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
      resourceUrl = null
    } = this.activeRoute;

    if (component) {
      // Remove all child nodes under outlet element
      while (this.outlet.firstChild) {
        this.outlet.removeChild(this.outlet.firstChild);
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

        this.outlet.appendChild(view);
        // Update the route links once the DOM is updated
        this.updateLinks();
      };

      if (resourceUrl !== null) {
        import(resourceUrl).then(updateView);
      } else {
        updateView();
      }
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
