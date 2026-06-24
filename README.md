# router-sample

A tiny **client-side router built from scratch with vanilla JavaScript and
Custom Elements** — no framework, no dependencies. Routes are declared
right in your markup with custom tags, in a style similar to `react-router`.

Based on the guide
[_Declarative Router with Web Components_](https://medium.com/@jasim/declarative-router-with-web-components-43ddcebc9dbc)
by Jasim. This repository tracks that article's design and further builds on
present in its code listings (see [Notes](#notes--differences-from-the-guide)).

## How it works

Single-page-application routing is powered by the browser
[History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API).
When the URL changes (a link click or back/forward button), the router matches
the new path against the declared routes, clears the outlet, and injects the
custom element registered for that route — all without a full page reload.

## Features

- Declarative routes via `<wc-route>` custom elements
- Nested routes with shared layouts and relative child paths
- Index routes (a default child for a parent's exact path)
- Redirects via a `redirect` attribute (uses `replaceState`)
- Dynamic path parameters (e.g. `/users/:id`) passed to the view as attributes
- Wildcard `*` fallback route (404)
- Browser back/forward support via `popstate`
- Lazy-loaded routes through ES dynamic `import()`
- Optional hover/focus prefetching of lazy routes via `data-prefetch`
- A `route-changed` event for analytics, auth checks, and the like
- Delegated link handling — drop a `route="..."` attribute on any `<a>`
- Zero runtime dependencies, ES modules only

## Project structure

```
index.html              Markup: route declarations + nav links
css/style.css           Styling
js/
  router.js             <wc-router> custom element (the router)
  util.js               match() / matchRoutes() — the URL matching functions
  pages/
    index.js            Eagerly registers the page components
    home.js             <wc-home>
    about.js            <wc-about>
    contact.js          <wc-contact>  (loaded lazily, see below)
    users.js            <wc-users>     — layout: user list + nested <wc-outlet>
    userindex.js        <wc-userindex> — index child shown at /users
    userdetails.js      <wc-userdetails> — single user, reads :id
    notfound.js         <wc-notfound>  — 404 view
    userlist.js         Sample data
```

## The custom elements

| Element        | Role                                                                 |
| -------------- | ------------------------------------------------------------------- |
| `<wc-router>`  | The router. Reads its `<wc-route>` children and drives navigation.  |
| `<wc-route>`   | A single route definition (configuration only; renders nothing).    |
| `<wc-outlet>`  | Placeholder where the matched component is injected on each change. |

### `<wc-route>` attributes

| Attribute      | Required | Description                                                        |
| -------------- | -------- | ------------------------------------------------------------------ |
| `path`         | yes\*    | URL path to match. Supports `:param` segments and the `*` wildcard. **Relative to the parent route when nested.** Empty/omitted marks an index route. |
| `component`    | yes\*    | Tag name of the custom element to render for this route.           |
| `title`        | no       | Sets `document.title` when the route is active.                    |
| `resource-url` | no       | Module to dynamically `import()` before rendering (lazy loading).  |
| `redirect`     | no       | Redirect to this path instead of rendering (see [Redirects](#redirects)). A redirect route needs no `component`. |

> \* A redirect route needs only `path` + `redirect`; an index route uses an
> empty `path`. Otherwise `path` and `component` are required.

> Note: attribute names are lowercase/kebab-case (`resource-url`, not
> `resourceUrl`) because HTML lowercases attribute names.

## Defining routes

Declare routes as direct children of `<wc-router>`, and place a single
`<wc-outlet>` where views should render:

```html
<wc-router>
  <nav class="nav">
    <ul>
      <li><a route="/">Home</a></li>
      <li><a route="/about">About</a></li>
      <li><a route="/contact">Contact</a></li>
      <li><a route="/users">Users</a></li>
    </ul>
  </nav>

  <wc-route path="/" title="Home" component="wc-home"></wc-route>
  <wc-route path="/about" title="About Us" component="wc-about"></wc-route>
  <wc-route path="/users" title="Users" component="wc-users">
    <wc-route path="" component="wc-userindex"></wc-route>
    <wc-route path=":id" title="User Details" component="wc-userdetails"></wc-route>
  </wc-route>
  <wc-route path="*" title="404" component="wc-notfound"></wc-route>

  <wc-outlet></wc-outlet>
</wc-router>

<script type="module" src="./js/router.js"></script>
<script type="module" src="./js/pages/index.js"></script>
```

`type="module"` is required since the code uses ES modules.

## Navigation

**Links** — add a `route` attribute to any anchor inside the router. The
router mirrors it onto `href` (so the link is real and middle-click /
open-in-new-tab still work) and intercepts the click via a single delegated
listener to navigate without a page reload:

```html
<a route="/about">About</a>
```

This also works in dynamically rendered views — e.g. the users list links to
`/users/<id>`.

**Programmatically** — the router element exposes helpers:

```js
const router = document.querySelector("wc-router");
router.go("/about"); // navigate (pushes history)
router.back();       // history.go(-1)
```

## Dynamic route parameters

A `:name` segment captures part of the URL and is passed to the rendered
component as an attribute:

```html
<wc-route path="/users/:id" component="wc-userdetails"></wc-route>
```

Navigating to `/users/2` renders `<wc-userdetails id="2">`. The component reads
it in `connectedCallback`:

```js
connectedCallback() {
  const id = this.getAttribute("id");
  // ...look up and render the user
}
```

## Nested routes

Nest `<wc-route>` elements to share a layout between related routes. A child's
`path` is **relative** to its parent (parent `/users` + child `:id` matches
`/users/:id`), and the parent's component renders a `<wc-outlet>` where the
matched child mounts. The layout stays put while only the nested view changes:

```html
<wc-route path="/users" component="wc-users">
  <wc-route path="" component="wc-userindex"></wc-route>
  <wc-route path=":id" component="wc-userdetails"></wc-route>
</wc-route>
```

The layout component must render its own `<wc-outlet>`:

```js
// wc-users
connectedCallback() {
  // ...render the user list...
  this.appendChild(document.createElement("wc-outlet"));
}
```

Routing matches the deepest route and renders the whole chain outermost-first:
each component goes into the previous one's `<wc-outlet>`. Captured params
accumulate down the chain and are set as attributes on each level's component.

### Index routes

A child with an **empty (or omitted) `path`** is the *index* route — it renders
into the layout for the parent's exact path. Above, `/users` renders
`<wc-users>` with `<wc-userindex>` in its outlet, while `/users/2` swaps in
`<wc-userdetails id="2">`.

## Redirects

Give a route a `redirect` attribute to send navigation elsewhere instead of
rendering. The router resolves redirects before touching the DOM and uses
`history.replaceState`, so the redirect source never lands in the history stack
(Back works as expected). Redirect routes need no `component`:

```html
<wc-route path="/misc" redirect="/about"></wc-route>
```

This also works as a default for a nested section — point a parent (or its
index child) at a concrete child path. Redirect chains are followed and capped
(a loop is reported via `console.error` rather than hanging).

## Lazy loading routes

Heavy routes can be split out and fetched only when first visited, using
`resource-url`. The module is dynamically imported (and registers its custom
element) right before the view is rendered:

```html
<wc-route
  path="/contact"
  title="Contact Us"
  component="wc-contact"
  resource-url="./pages/contact.js"
></wc-route>
```

The path is resolved relative to `router.js` (the module that performs the
`import()`), so it works regardless of the base path the app is served from.
In this repo, `contact.js` is the one page loaded this way; the rest are
registered eagerly in `js/pages/index.js`.

### Prefetching lazy routes

Lazy routes only fetch their bundle on first visit, so that first navigation
pays a network round-trip. Add a `data-prefetch` attribute to a link to fetch
its route's module ahead of time — as soon as the user hovers or
keyboard-focuses the link:

```html
<a route="/contact" data-prefetch>Contact</a>
```

On hover/focus the router resolves the link's route, and if it's lazy
(`resource-url`) imports the module in the background and caches it. The later
click then renders instantly with no extra request. Prefetching is best-effort:
it's a no-op for non-lazy routes, repeated hovers don't re-fetch, and a failed
prefetch is silent (navigation simply retries the import).

## Listening for route changes

After a view is mounted the router dispatches a bubbling `route-changed`
`CustomEvent`. Listen on the router element or on `document` — handy for
analytics, auth checks, scroll handling, etc.:

```js
document.addEventListener("route-changed", e => {
  const { url, path, title, component, params } = e.detail;
  // e.g. send a page view, or redirect if not authenticated
  console.log("navigated to", url, params);
});
```

| `detail` field | Description                                      |
| -------------- | ------------------------------------------------ |
| `url`          | The path that was navigated to.                  |
| `path`         | The matched route's `path` (e.g. `/users/:id`).  |
| `title`        | The route's `title`, if any.                     |
| `component`    | Tag name of the rendered component.              |
| `params`       | Object of captured dynamic params.               |

The event fires for the initial render and every subsequent navigation,
including back/forward — and, for lazy routes, only once the module has loaded
and the view is in the DOM.

## 404 / fallback

A route whose `path` is `*` matches anything not matched earlier. Keep it last:

```html
<wc-route path="*" title="404" component="wc-notfound"></wc-route>
```

## Running the code

Serve the folder over any static HTTP server (ES modules don't load over
`file://`). With Node.js you can use the `http-server` module:

```
npm install -g http-server
```

Then, from the project folder:

```
cd <codeFolder>
http-server
```

`index.html` is served at `http://localhost:8080`.

## Testing

A small suite covers the `match()` function and the navigation flow using
Node's built-in test runner. The only dev dependency is
[linkedom](https://github.com/webreflection/linkedom), which provides a DOM for
the navigation tests (the router itself still ships with zero runtime
dependencies). Requires Node 18+.

```
npm install
npm test
```

- `test/match.test.js` — `match()` and `matchRoutes()`: static, dynamic,
  encoded, and wildcard paths, nested chains, index children, and accumulated
  params, plus edge cases.
- `test/navigation.test.js` — mounting, navigating, nested + index rendering,
  redirects (and loop detection), the `route-changed` event, and
  `data-prefetch` warming the lazy-route cache.

## Notes / differences from the guide

This implementation follows the linked article's architecture but corrects a
few issues found in its code listings:

- **Back/forward no longer corrupts history.** Navigation triggered by
  `popstate` re-renders the view *without* calling `pushState` again. Internally
  `navigate()` (pushes history) is split from `render()` (renders only).
- **Single delegated click handler** instead of rebinding `onclick` on every
  link on every render.
- **Kebab-case `resource-url`** with a base-path-safe relative import path.
- **XSS-safe views** — user data is rendered via DOM APIs / `textContent`
  rather than interpolated into `innerHTML` strings.
- Assorted fixes: correct `addEventListener` casing, correct `update()` block
  scoping, and a correctly computed root-URL guard in `match()`.

## Limitations

This is a learning-oriented router. It intentionally does **not** support
route guards, query-string parsing, or scroll restoration. For production use,
prefer a battle-tested library. The URL matcher in `util.js` is adapted from
[Reach Router](https://github.com/reach/router); libraries like
[`path-to-regexp`](https://github.com/pillarjs/path-to-regexp) handle the
trickier matching cases.

## License

See [LICENSE](./LICENSE).
