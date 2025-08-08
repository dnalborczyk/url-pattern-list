# url-pattern-list

Efficiently match URL paths against a collection of URL patterns using an
optimized prefix tree data structure.

## Overview

`url-pattern-list` is a JavaScript library that provides an optimized way to
match URL paths against multiple
[URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern)
instances. Instead of matching URLs by linearly testing URLs against a list of
patterns, `URLPatternList` uses a prefix tree to share common pattern prefixes
and reduce the number of checks that need to be performed to find a match.

`URLPatternList` has the same matching semantics as scanning a linear list of
patterns, and it tested against such a linear list to ensure correctness. The
first `URLPattern` (in the order patterns were added to the list) that matches a
path is returned as the match.

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

## Limitations

`URLPatternList` currently only supports matching URL pathnames. In the future
it may support matching other URL parts.

## Performance

Benchmarks show that the prefix tree-based URLPatternList is significantly
faster than linear scanning. The optimized version is roughly 3x faster to match
for small (10) sets of patterns, and up to 25-30x faster for large (2000) sets
of patterns.

To run the benchmark on your machine:
```sh
npm run benchmark
```

## API Reference

### URLPatternList&lt;T&gt;

The main class for managing and matching URL patterns.

#### Methods

##### `addPattern(pattern: URLPattern, value: T): void`

Add a URL pattern to the collection with an associated value.

```typescript
const list = new URLPatternList<RouteHandler>();
list.addPattern(new URLPattern({pathname: '/users/:id'}), handleUserDetail);
```

##### `match(path: string, baseUrl?: string): URLPatternListMatch<T> | null`

Match a path against all patterns, returning the first match found.

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

#### URLPatternListItem&lt;T&gt;

```typescript
interface URLPatternListItem<T> {
  pattern: URLPattern;
  value: T;
}
```

## Browser Support

This library requires
[URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern)
support:

- Chrome 95+
- Firefox 106+
- Safari 17.0+

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
