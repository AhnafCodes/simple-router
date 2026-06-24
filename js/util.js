let paramRe = /^:(.+)/;

function segmentize(uri) {
  return uri.replace(/(^\/+|\/+$)/g, "").split("/");
}

/**
 * Split a URL into path segments, normalizing root / empty paths to an empty
 * array so "no segments" is unambiguous. segmentize("/") would otherwise
 * yield [""].
 */
function toSegments(uri) {
  const [pathname] = uri.split("?");
  const segments = segmentize(pathname);
  if (segments.length === 1 && segments[0] === "") return [];
  return segments;
}

/**
 * decodeURIComponent throws a URIError on malformed percent-encoding
 * (e.g. "/users/%"). Fall back to the raw segment so a bad URL can never
 * crash route matching.
 */
function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Match a single route's own (relative) path segments against the leading
 * segments of the URL. Fills `params` for `:name` segments and, for a `*`
 * wildcard, captures the remainder. Returns the number of URL segments
 * consumed, or -1 if the route does not match the leading segments.
 */
function consume(routeSegments, uriSegments, params) {
  let i = 0;
  for (; i < routeSegments.length; i++) {
    const routeSegment = routeSegments[i];

    if (routeSegment === "*") {
      params["*"] = uriSegments
        .slice(i)
        .map(safeDecode)
        .join("/");
      return uriSegments.length;
    }

    const uriSegment = uriSegments[i];
    if (uriSegment === undefined) return -1;

    const dynamicMatch = paramRe.exec(routeSegment);
    if (dynamicMatch) {
      params[dynamicMatch[1]] = safeDecode(uriSegment);
    } else if (routeSegment !== uriSegment) {
      return -1;
    }
  }
  return i;
}

function isIndexRoute(route) {
  return route.path == null || route.path === "";
}

/**
 * Walk a route tree and return the matched chain from the outermost route down
 * to the leaf, as `[{ route, params }, ...]`, or null if nothing matches.
 *
 * Child route paths are relative to their parent (e.g. parent "/users" with a
 * child ":id" matches "/users/2"). Params accumulate down the chain. Routes are
 * tried in declaration order, so — as before — declare static paths before
 * dynamic ones and keep a "*" fallback last.
 *
 * @param {Array} routes - Route tree (each route may have a `children` array)
 * @param {string} uri - Url to match
 */
export function matchRoutes(routes, uri) {
  return matchInto(routes, toSegments(uri), {});
}

function matchInto(routes, uriSegments, parentParams) {
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];

    // An index route matches only the parent's exact path (no segments left).
    if (isIndexRoute(route)) {
      if (uriSegments.length === 0) {
        return [{ route, params: { ...parentParams } }];
      }
      continue;
    }

    const params = { ...parentParams };
    let routeSegments = segmentize(route.path);
    // A leading-slash path like "/" segmentizes to [""]; treat as no segments.
    if (routeSegments.length === 1 && routeSegments[0] === "") routeSegments = [];

    const consumed = consume(routeSegments, uriSegments, params);
    if (consumed < 0) continue;

    const remaining = uriSegments.slice(consumed);
    const isWildcard = routeSegments[routeSegments.length - 1] === "*";
    const children = route.children || [];

    if (remaining.length === 0 || isWildcard) {
      // Exact match (or wildcard catch-all). Prefer descending into a child
      // (typically an index route) when the URL is fully consumed.
      if (remaining.length === 0 && children.length) {
        const childChain = matchInto(children, remaining, params);
        if (childChain) return [{ route, params }, ...childChain];
      }
      return [{ route, params }];
    }

    // Segments remain: the match can only continue through children.
    if (children.length) {
      const childChain = matchInto(children, remaining, params);
      if (childChain) return [{ route, params }, ...childChain];
    }
    // Matched a prefix but couldn't place the rest — fall through to siblings
    // (e.g. a top-level "*" route).
  }

  return null;
}

/**
 * Match the url against a flat list of route definitions and return the single
 * matched definition (with `params`), or null. A flat array is just a route
 * tree of depth one, so this is the leaf of matchRoutes().
 *
 * Code is extracted from Reach router path match implementation
 * https://github.com/reach/router/blob/master/src/lib/utils.js
 *
 * @param {Array} routes - Route definitions
 * @param {string} uri - Url to match
 */
export function match(routes, uri) {
  const chain = matchRoutes(routes, uri);
  if (chain === null) return null;
  const { route, params } = chain[chain.length - 1];
  return { params, ...route };
}
