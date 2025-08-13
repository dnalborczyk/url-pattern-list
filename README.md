# url-pattern-list

Efficiently match URL paths against a collection of URL patterns using an
optimized prefix tree data structure.

## Overview

`url-pattern-list` is a JavaScript library that provides an optimized way to
match URLs against multiple
[URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern)
instances. Instead of matching URLs by linearly testing URLs against a list of
patterns, `URLPatternList` uses a prefix tree to share common pattern prefixes
and reduce the number of checks that need to be performed to find a match.

`URLPatternList` has the same matching semantics as scanning a linear list of
patterns, and it tested against such a linear list to ensure correctness. The
first `URLPattern` (in the order patterns were added to the list) that matches a
URL is returned as the match.

Patterns are added to the list along with an additional value that is returned
with the match. This makes it easy to associate a URLPattern with metadata or an
object like a server route handler.

## Installation

```sh
npm i url-pattern-list
```

## Quick Start

```typescript
import {URLPatternList} from 'url-pattern-list';

// Create a new pattern list
const routes = new URLPatternList<string>();

// Add patterns with associated values
routes.addPattern(new URLPattern({pathname: '/api/users/:id'}), 'user-detail');
routes.addPattern(new URLPattern({pathname: '/api/users'}), 'user-list');
routes.addPattern(new URLPattern({pathname: '/api/posts/:id'}), 'post-detail');

// Match against a URL
const match = routes.match('/api/users/123');
if (match) {
  console.log('Route:', match.value); // 'user-detail'
  console.log('User ID:', match.result.pathname.groups.id); // '123'
}
```

## Performance

Benchmarks show that the prefix tree-based URLPatternList is significantly
faster than linear scanning. The optimized version is 2-3x faster to match for
small (10) sets of patterns, and up to 20-30x faster for large (2000) sets of
patterns.

To run the benchmark on your machine:

```sh
npm run benchmark
```

### Prefix Tree Optimization for All URL Components

URLPatternList builds prefix trees not just for pathname components, but for all
URL components including search parameters and hash fragments. To enable prefix
sharing across all components, the parser splits fixed text by `/` even in
search and hash components.

This design choice optimizes for common real-world patterns where path-like
structures appear in search parameters (e.g., `?path=/api/users/123`) and hash
fragments (e.g., `#/admin/dashboard/settings`). By splitting these components
by `/`, the prefix tree can share common prefixes like `/api` or `/admin`
across different patterns, leading to better performance.

While this means search/hash patterns like `path=/admin/users` are stored as
multiple tree nodes rather than a single node, the prefix sharing benefits
typically outweigh this cost in realistic usage scenarios.

## API Reference

### URLPatternList&lt;T&gt;

The main class for managing and matching URL patterns.

```ts
import {URLPatternList} from 'url-pattern-list';
```

#### Methods

##### `addPattern(pattern: URLPattern, value: T): void`

Add a URL pattern to the collection with an associated value.

```typescript
const list = new URLPatternList<RouteHandler>();
list.addPattern(new URLPattern({pathname: '/users/:id'}), handleUserDetail);
```

##### `match(url: string | URL, baseUrl?: string): URLPatternListMatch<T> | null`

Match a URL against all patterns, returning the first match found.

```typescript
const match = list.match('/users/123', 'https://example.com');
if (match) {
  // match.result contains the URLPatternResult
  // match.value contains your associated value
}
```

### Types

#### URLPatternListMatch&lt;T&gt;

```typescript
interface URLPatternListMatch<T> {
  result: URLPatternResult; // Standard URLPattern match result
  value: T; // Your associated value
}
```

## Browser Support

This library requires
[URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern)
support:

- Chrome 95+
- Firefox 142+ (Preview support)
- Safari 26.0+ (Preview support)

For older browsers, you can use a [URLPattern
polyfill](https://github.com/kenchris/urlpattern-polyfill).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License. See [LICENSE](LICENSE) file for details.

## Related

- [URLPattern on
  MDN](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern)
- [URLPattern Specification](https://urlpattern.spec.whatwg.org/)
- [URLPattern Polyfill](https://github.com/kenchris/urlpattern-polyfill)
