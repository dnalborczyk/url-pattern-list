import {describe as suite, test} from 'node:test';
import {URLPatternList, type URLPatternListMatch} from '../index.js';
import {
  NaiveURLPatternList,
  type URLPatternListLike,
} from './naive-url-pattern-list.js';
import * as assert from 'node:assert';

// Test implementations
const implementations: Array<{
  name: string;
  create: <T>() => URLPatternListLike<T>;
}> = [
  {
    name: 'URLPatternList (optimized)',
    create: <T>() => new URLPatternList<T>(),
  },
  {
    name: 'NaiveURLPatternList (linear)',
    create: <T>() => new NaiveURLPatternList<T>(),
  },
];

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * URLPatternList tests with dual implementation validation.
 *
 * This test suite validates both the optimized URLPatternList implementation
 * (which uses a prefix tree for efficient matching) and a naive linear
 * implementation (NaiveURLPatternList) to ensure both produce identical
 * results for all test cases.
 */
suite('URLPatternList implementations', () => {
  for (const impl of implementations) {
    /**
     * Creates a URLPatternList, adds patterns to it, matches a path, and
     * asserts partial deep equality of the match result.
     */
    const assertMatch = <T>(
      pathPatterns: Array<[string, T]>,
      path: string,
      expected: DeepPartial<URLPatternListMatch<T>> | null,
    ) => {
      const list = impl.create<T>();
      for (const [pattern, value] of pathPatterns) {
        list.addPattern(new URLPattern({pathname: pattern}), value);
      }
      const match = list.match(path, 'http://example.com');
      assert.partialDeepStrictEqual(match, expected);
    };

    /**
     * Asserts that the URLPatternList implementation behaves the same as
     * URLPatternList in terms of matching paths against patterns. Creates a
     * URLPatternList, adds a single pattern to it, matches a path, and asserts
     * that the result is the same as calling `URLPattern.exec()`.
     */
    const assertURLPatternBehavior = (
      input: string | URLPatternInit,
      path: string,
      baseURL = 'http://example.com',
    ): void => {
      let pattern: URLPattern;
      if (typeof input === 'string') {
        pattern = new URLPattern(input, baseURL);
      } else {
        pattern = new URLPattern(input);
      }
      const list = impl.create<undefined>();
      list.addPattern(pattern, undefined);
      const url = new URL(path, baseURL);
      const listMatch = list.match(url.toString(), baseURL);
      const urlPatternMatch = pattern.exec(url.toString(), baseURL);
      assert.deepStrictEqual(
        listMatch?.result ?? null,
        urlPatternMatch,
        `${input}, ${path}`,
      );
    };

    suite(impl.name, () => {
      test('matches a single pattern and returns a match', () => {
        assertMatch([['/foo/:bar', 'value-1']], '/foo/123', {
          result: {
            pathname: {
              groups: {bar: '123'},
            },
          },
          value: 'value-1',
        });
      });

      test('returns null when no patterns match', () => {
        assertMatch([['/foo', 1]], '/foo/123', null);
      });

      test('matches the behavior of URLPattern for pathname', () => {
        assertURLPatternBehavior('/foo', '/foo');
        assertURLPatternBehavior('/foo', '/bar');

        // Named parameters
        assertURLPatternBehavior('/foo/:bar', '/foo/123');
        assertURLPatternBehavior('/foo/:bar', '/foo');
        assertURLPatternBehavior('/foo/:bar/baz', '/foo/123/baz');
        assertURLPatternBehavior('/foo/:bar/baz', '/foo/123/456/baz');
        assertURLPatternBehavior('/foo/:bar/baz', '/foo/baz');
        assertURLPatternBehavior('/foo/:bar.txt', '/foo/123.txt');
        assertURLPatternBehavior('/post/:id-:title', '/post/123');
        assertURLPatternBehavior('/post/:id-:title', '/post/123-foo');
        assertURLPatternBehavior('/post/:id-:title', '/post/123-foo-bar');
        assertURLPatternBehavior('/post/:id!:title', '/post/123!foo');
        assertURLPatternBehavior(
          '/posts/:id-:slug-:category',
          '/posts/123-hello-world-tech',
        );

        // Trailing wildcards
        assertURLPatternBehavior('/foo/*', '/foo');
        assertURLPatternBehavior('/foo/*', '/foo/');
        assertURLPatternBehavior('/foo/*', '/foo/a');
        assertURLPatternBehavior('/foo/*', '/foo/a/b');

        // Wildcard in the middle
        assertURLPatternBehavior('/foo/*/bar', '/foo/bar');
        assertURLPatternBehavior('/foo/*/bar', '/foo/a/bar');
        assertURLPatternBehavior('/foo/*/bar', '/foo/a/b/bar');
        assertURLPatternBehavior('/foo/*.ext', '/foo/a/b');
        assertURLPatternBehavior('/foo/*.ext', '/foo/a/b.ext');
        assertURLPatternBehavior('/foo/*.ext', '/foo/a/b/c.ext');

        // Modifiers: *
        assertURLPatternBehavior('/foo/:id*/bar', '/foo/bar');
        assertURLPatternBehavior('/foo/:id*/bar', '/foo/a/bar');
        assertURLPatternBehavior('/foo/:id*/bar', '/foo/a/b/bar');

        // Modifiers: +
        assertURLPatternBehavior('/foo/:id+/bar', '/foo/bar');
        assertURLPatternBehavior('/foo/:id+/bar', '/foo/a/bar');
        assertURLPatternBehavior('/foo/:id+/bar', '/foo/a/b/bar');

        // Modifiers: ?
        assertURLPatternBehavior('/foo/:id?/bar', '/foo/bar');
        assertURLPatternBehavior('/foo/:id?/bar', '/foo/a/bar');
        assertURLPatternBehavior('/foo/:id?/bar', '/foo/a/b/bar');

        // Unnamed regex capturing groups
        assertURLPatternBehavior('/foo/(\\d+)/bar', '/foo/123/bar');
        assertURLPatternBehavior('/foo/(\\d+)/bar', '/foo/abc/bar');

        // Named regex capturing groups
        assertURLPatternBehavior('/foo/:id(\\d+)/bar', '/foo/123/bar');
        assertURLPatternBehavior('/foo/:id(\\d+)/bar', '/foo/abc/bar');

        // Unnamed regex capturing groups with alternation
        assertURLPatternBehavior('/foo/(a|b)/bar', '/foo/a/bar');
        assertURLPatternBehavior('/foo/(a|b)/bar', '/foo/b/bar');
        assertURLPatternBehavior('/foo/(a|b)/bar', '/foo/c/bar');

        // Regex capturing groups with inner unnamed groups
        assertURLPatternBehavior('/foo/(a(?:b|c))/bar', '/foo/ab/bar');
        assertURLPatternBehavior('/foo/(a(?:b|c))/bar', '/foo/ac/bar');
        assertURLPatternBehavior('/foo/(a(?:b|c))/bar', '/foo/ad/bar');

        // Regex capturing groups with inner named groups
        assertURLPatternBehavior('/foo/(a(?:b|c))/bar', '/foo/ab/bar');
        assertURLPatternBehavior('/foo/(a(?:b|c))/bar', '/foo/ac/bar');
        assertURLPatternBehavior('/foo/(a(?:b|c))/bar', '/foo/ad/bar');

        // Group delimiters
        assertURLPatternBehavior('/products{/}', '/products');
        assertURLPatternBehavior('/products{/}', '/products/');
        assertURLPatternBehavior('/book{s}', '/book');
        assertURLPatternBehavior('/book{s}', '/books');

        assertURLPatternBehavior('/book{s}?', '/book');
        assertURLPatternBehavior('/book{s}?', '/books');
        assertURLPatternBehavior('/book{s}?', '/booksss');

        assertURLPatternBehavior('/book{s}+', '/book');
        assertURLPatternBehavior('/book{s}+', '/books');
        assertURLPatternBehavior('/book{s}+', '/booksss');

        assertURLPatternBehavior('/book{s}*', '/book');
        assertURLPatternBehavior('/book{s}*', '/books');
        assertURLPatternBehavior('/book{s}*', '/booksss');

        assertURLPatternBehavior('/book{s}?/:id', '/book/123');
        assertURLPatternBehavior('/book{s}?/:id', '/books/123');
        assertURLPatternBehavior('/post/:id{-:title}', '/post/123');
        assertURLPatternBehavior('/post/:id{-:title}', '/post/123-foo');

        assertURLPatternBehavior('/post/:id{-:title}?', '/post/123');
        assertURLPatternBehavior('/post/:id{-:title}?', '/post/123-foo');

        assertURLPatternBehavior('/post/:id{-:title}+', '/post/123');
        assertURLPatternBehavior('/post/:id{-:title}+', '/post/123-foo');
        assertURLPatternBehavior('/post/:id{-:title}+', '/post/123-foo-bar');

        assertURLPatternBehavior('/post/:id{-:title}*', '/post/123');
        assertURLPatternBehavior('/post/:id{-:title}*', '/post/123-foo');
        assertURLPatternBehavior('/post/:id{-:title}*', '/post/123-foo-bar');

        assertURLPatternBehavior('/books/{:id}?', '/books/123');
        assertURLPatternBehavior('/books/{:id}?', '/books');
        assertURLPatternBehavior('/books/{:id}?', '/books/');
      });

      test('matches the behavior of URLPattern for search and hash', () => {
        assertURLPatternBehavior(
          {
            pathname: '/api',
            search: 'paths=:item+',
          },
          'https://example.com/api?paths=item1/subitem&other=value',
        );
        assertURLPatternBehavior(
          {
            pathname: '/docs',
            hash: 'route=:path*',
          },
          'https://example.com/docs#route=admin/users/permissions',
        );
        assertURLPatternBehavior(
          {
            pathname: '/files',
            search: 'download=:filepath',
          },
          'https://example.com/files?download=documents/2024/report.pdf',
        );
        assertURLPatternBehavior(
          {
            pathname: '/api',
            search: 'data=start-:content-end',
          },
          'https://example.com/api?data=start-path/to/resource-end',
        );
      });

      test('matches the first added pattern that tests true and returns its value', () => {
        const list = impl.create<string>();
        // Pattern 1: matches /books/:id
        list.addPattern(new URLPattern({pathname: '/books/:id'}), 'id');
        // Pattern 2: also matches /books/*, but with a different group name
        list.addPattern(new URLPattern({pathname: '/books/:bookId'}), 'bookId');

        const match = list.match('/books/123', 'http://example.com');
        assert.ok(match);
        // Assert that the first pattern was matched by checking its group name and
        // value
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, 'id');
      });

      test('matches a pattern with a base URL and returns its value', () => {
        const list = impl.create<boolean>();
        const patternValue = true;
        list.addPattern(new URLPattern({pathname: '/foo'}), patternValue);
        const match = list.match('/foo', 'http://localhost');
        assert.ok(match);
        assert.strictEqual(match?.value, patternValue);
      });

      test('matches a pattern with parameters and returns its value', () => {
        const list = impl.create<string>();
        const patternValue = 'userRoute';
        list.addPattern(new URLPattern({pathname: '/users/:id'}), patternValue);
        const match = list.match('/users/123', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, patternValue);
      });

      test('returns null when list is empty', () => {
        const list = impl.create<any>();
        const match = list.match('/foo', 'http://example.com');
        assert.strictEqual(match, null);
      });

      test('matches patterns in the order they were added and returns correct value', () => {
        const list = impl.create<string>();

        // More specific pattern by structure, but added first, so it takes
        // precedence for /items/:id type matches
        list.addPattern(new URLPattern({pathname: '/items/:id'}), 'id');
        list.addPattern(
          new URLPattern({pathname: '/items/special'}),
          'item-special',
        );

        let match = list.match('/items/123', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, 'id');

        match = list.match('/items/special', 'http://example.com');
        // The first pattern '/items/:id' will match '/items/special' and
        // capture {id: 'special'}
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: 'special'});
        assert.strictEqual(match?.value, 'id');
      });

      test('matches first pattern with backtracking', () => {
        const list = impl.create<string>();
        list.addPattern(
          new URLPattern({pathname: '/books/:id-:title'}),
          'id-title',
        );
        list.addPattern(new URLPattern({pathname: '/books/:id'}), 'id');

        const match = list.match('/books/123-foo', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match.value, 'id-title');
      });

      test('addPattern correctly adds a pattern and value that can be matched', () => {
        const list = impl.create<number>();
        const patternValue = 42;
        const pattern = new URLPattern({pathname: '/test-add'});
        list.addPattern(pattern, patternValue);
        const match = list.match('/test-add', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {});
        assert.strictEqual(match?.value, patternValue);
      });

      test('handles wildcard (*) correctly', () => {
        const list = impl.create<string>();
        const v1 = 'wildcard-files';
        list.addPattern(new URLPattern({pathname: '/files/*'}), v1);
        const match1 = list.match('/files/document.txt', 'http://example.com');
        assert.ok(match1);
        assert.deepStrictEqual(match1?.result.pathname.groups, {
          0: 'document.txt',
        });
        assert.strictEqual(match1?.value, v1);

        const match2 = list.match(
          '/files/archive/report.zip',
          'http://example.com',
        );
        assert.ok(match2);
        assert.deepStrictEqual(match2?.result.pathname.groups, {
          0: 'archive/report.zip',
        });
        assert.strictEqual(match2?.value, v1);

        const noMatch = list.match(
          '/documents/report.pdf',
          'http://example.com',
        );
        assert.strictEqual(noMatch, null);
      });

      test('handles named groups (:) correctly', () => {
        const list = impl.create<string>();
        const v1 = 'user-profile';
        list.addPattern(
          new URLPattern({pathname: '/users/:userId/profile/:section'}),
          v1,
        );
        const match = list.match(
          '/users/alice/profile/settings',
          'http://example.com',
        );
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {
          userId: 'alice',
          section: 'settings',
        });
        assert.strictEqual(match?.value, v1);

        const noMatch = list.match('/users/bob/settings', 'http://example.com');
        assert.strictEqual(noMatch, null);
      });

      test('handles optional named groups ({...}?) correctly', () => {
        const list = impl.create<string>();
        const v1 = 'optional-group';
        list.addPattern(
          new URLPattern({pathname: '/api/{v:version/}?data'}),
          v1,
        );

        const matchWithGroup = list.match('/api/v1/data', 'http://example.com');
        assert.ok(matchWithGroup);
        assert.deepStrictEqual(matchWithGroup?.result.pathname.groups, {
          version: '1',
        });
        assert.strictEqual(matchWithGroup?.value, v1);

        const matchWithoutGroup = list.match('/api/data', 'http://example.com');
        assert.ok(matchWithoutGroup);
        assert.deepStrictEqual(matchWithoutGroup?.result.pathname.groups, {
          version: undefined,
        });
        assert.strictEqual(matchWithoutGroup?.value, v1);
      });

      test('handles regex capturing groups with alternation correctly', () => {
        const list = impl.create<string>();
        const v1 = 'regex-alternation';
        // Pattern with regex alternation using capturing group
        list.addPattern(
          new URLPattern({pathname: '/img/(small|large)/:name.jpg'}),
          v1,
        );

        const matchSmall = list.match(
          '/img/small/cat.jpg',
          'http://example.com',
        );
        assert.ok(matchSmall);
        assert.deepStrictEqual(matchSmall?.result.pathname.groups, {
          '0': 'small',
          name: 'cat',
        });
        assert.strictEqual(matchSmall?.value, v1);

        const matchLarge = list.match(
          '/img/large/dog.jpg',
          'http://example.com',
        );
        assert.ok(matchLarge);
        assert.deepStrictEqual(matchLarge?.result.pathname.groups, {
          '0': 'large',
          name: 'dog',
        });
        assert.strictEqual(matchLarge?.value, v1);

        const noMatch = list.match('/img/medium/rat.jpg', 'http://example.com');
        assert.strictEqual(noMatch, null);
      });

      test('handles regex groups (...) correctly', () => {
        const list = impl.create<string>();
        const v1 = 'regex-group';
        // Example: /product/{id:\\d+}
        list.addPattern(new URLPattern({pathname: '/product/:id(\\d+)'}), v1);

        const match = list.match('/product/12345', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '12345'});
        assert.strictEqual(match?.value, v1);

        const noMatch = list.match('/product/abc', 'http://example.com');
        assert.strictEqual(noMatch, null);
      });

      test('handles full wildcard (/*) at the end of a segment', () => {
        const list = impl.create<string>();
        const v1 = 'segment-wildcard';
        list.addPattern(new URLPattern({pathname: '/data/:collection/*'}), v1);

        const match = list.match(
          '/data/items/item1/details',
          'http://example.com',
        );
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {
          collection: 'items',
          0: 'item1/details',
        });
        assert.strictEqual(match?.value, v1);

        // Wildcard expects something after /items/
        const noMatch = list.match('/data/items', 'http://example.com');
        assert.strictEqual(noMatch, null);
      });

      test('handles plus (+) quantifier for named groups correctly', () => {
        const list = impl.create<string>();
        const v1 = 'plus-quantifier';
        list.addPattern(new URLPattern({pathname: '/path/:segments+'}), v1);

        const matchOne = list.match('/path/a', 'http://example.com');
        assert.ok(matchOne);
        assert.deepStrictEqual(matchOne?.result.pathname.groups, {
          segments: 'a',
        });
        assert.strictEqual(matchOne?.value, v1);

        const matchMultiple = list.match('/path/a/b/c', 'http://example.com');
        assert.ok(matchMultiple);
        assert.deepStrictEqual(matchMultiple?.result.pathname.groups, {
          segments: 'a/b/c',
        });
        assert.strictEqual(matchMultiple?.value, v1);

        // + requires at least one segment
        const noMatch = list.match('/path/', 'http://example.com');
        assert.strictEqual(noMatch, null);
      });

      test('handles star (*) quantifier for named groups correctly', () => {
        const list = impl.create<string>();
        const v1 = 'star-quantifier';
        list.addPattern(new URLPattern({pathname: '/path/:segments*'}), v1);

        const matchZero = list.match('/path', 'http://example.com');
        assert.ok(matchZero);
        assert.deepStrictEqual(matchZero?.result.pathname.groups, {
          segments: undefined,
        }); // Or {} depending on URLPattern polyfill behavior for empty * group
        assert.strictEqual(matchZero?.value, v1);

        const matchOne = list.match('/path/a', 'http://example.com');
        assert.ok(matchOne);
        assert.deepStrictEqual(matchOne?.result.pathname.groups, {
          segments: 'a',
        });
        assert.strictEqual(matchOne?.value, v1);

        const matchMultiple = list.match('/path/a/b/c', 'http://example.com');
        assert.ok(matchMultiple);
        assert.deepStrictEqual(matchMultiple?.result.pathname.groups, {
          segments: 'a/b/c',
        });
        assert.strictEqual(matchMultiple?.value, v1);
      });

      test('matching with shared fixed prefixes', () => {
        const list = impl.create<string>();

        // Add patterns that share common prefixes - these should be organized
        // in the prefix tree to enable efficient matching. Order matters: more
        // specific patterns should come before general ones.
        list.addPattern(
          new URLPattern({pathname: '/api/users/profile'}),
          'user-profile',
        );
        list.addPattern(
          new URLPattern({pathname: '/api/users/:id'}),
          'user-detail',
        );
        list.addPattern(
          new URLPattern({pathname: '/api/posts/:id'}),
          'post-detail',
        );
        list.addPattern(
          new URLPattern({pathname: '/api/settings'}),
          'settings',
        );
        list.addPattern(
          new URLPattern({pathname: '/blog/archives'}),
          'blog-archives',
        );
        list.addPattern(new URLPattern({pathname: '/blog/:slug'}), 'blog-post');

        // Test patterns that share /api prefix
        let match = list.match('/api/users/profile', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {});
        assert.strictEqual(match?.value, 'user-profile');

        match = list.match('/api/users/123', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, 'user-detail');

        match = list.match('/api/posts/456', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '456'});
        assert.strictEqual(match?.value, 'post-detail');

        match = list.match('/api/settings', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {});
        assert.strictEqual(match?.value, 'settings');

        // Test patterns that share /blog prefix
        match = list.match('/blog/archives', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {});
        assert.strictEqual(match?.value, 'blog-archives');

        match = list.match('/blog/my-awesome-post', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {
          slug: 'my-awesome-post',
        });
        assert.strictEqual(match?.value, 'blog-post');

        // Test non-matching paths
        match = list.match('/other/path', 'http://example.com');
        assert.strictEqual(match, null);

        match = list.match('/api', 'http://example.com');
        assert.strictEqual(match, null);
      });

      test('handles deep nested shared prefixes', () => {
        const list = impl.create<string>();

        // Add patterns with multiple levels of shared prefixes
        list.addPattern(
          new URLPattern({pathname: '/api/v1/users/:id'}),
          'v1-user',
        );
        list.addPattern(
          new URLPattern({pathname: '/api/v1/users/:id/posts'}),
          'v1-user-posts',
        );
        list.addPattern(
          new URLPattern({pathname: '/api/v1/posts/:id'}),
          'v1-post',
        );
        list.addPattern(
          new URLPattern({pathname: '/api/v2/users/:id'}),
          'v2-user',
        );
        list.addPattern(
          new URLPattern({pathname: '/api/v2/posts/:id'}),
          'v2-post',
        );

        // Test v1 API endpoints
        let match = list.match('/api/v1/users/123', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, 'v1-user');

        match = list.match('/api/v1/users/123/posts', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, 'v1-user-posts');

        match = list.match('/api/v1/posts/456', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '456'});
        assert.strictEqual(match?.value, 'v1-post');

        // Test v2 API endpoints
        match = list.match('/api/v2/users/789', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '789'});
        assert.strictEqual(match?.value, 'v2-user');

        match = list.match('/api/v2/posts/101', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '101'});
        assert.strictEqual(match?.value, 'v2-post');
      });

      test('maintains correct matching order with mixed fixed and dynamic patterns', () => {
        const list = impl.create<string>();

        // Add patterns in a specific order to test prefix tree organization
        // doesn't break the first-match-wins behavior
        list.addPattern(
          new URLPattern({pathname: '/items/:id'}),
          'dynamic-item',
        );
        list.addPattern(
          new URLPattern({pathname: '/items/special'}),
          'special-item',
        );
        list.addPattern(
          new URLPattern({pathname: '/items/featured/:id'}),
          'featured-item',
        );
        list.addPattern(
          new URLPattern({pathname: '/items/featured/top'}),
          'top-featured',
        );

        // The dynamic pattern should match first for generic items
        let match = list.match('/items/123', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, 'dynamic-item');

        // The first pattern should also match 'special' since it was added first
        match = list.match('/items/special', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: 'special'});
        assert.strictEqual(match?.value, 'dynamic-item');

        // Test the nested patterns
        match = list.match('/items/featured/456', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '456'});
        assert.strictEqual(match?.value, 'featured-item');

        match = list.match('/items/featured/top', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {id: 'top'});
        assert.strictEqual(match?.value, 'featured-item');
      });

      test('matching with mixed fixed and dynamic prefixes', () => {
        const list = impl.create<string>();

        // NOTE: Order matters for first-match-wins semantics - more specific
        // patterns should be added first
        list.addPattern(
          new URLPattern({pathname: '/users/:userId/posts/drafts'}),
          'user-drafts',
        );
        list.addPattern(
          new URLPattern({pathname: '/users/:userId/posts/:postId'}),
          'user-post',
        );
        list.addPattern(
          new URLPattern({pathname: '/users/:userId/comments/:commentId'}),
          'user-comment',
        );
        list.addPattern(
          new URLPattern({pathname: '/users/:userId/settings'}),
          'user-settings',
        );
        list.addPattern(
          new URLPattern({pathname: '/admin/:adminId/posts/drafts'}),
          'admin-drafts',
        );
        list.addPattern(
          new URLPattern({pathname: '/admin/:adminId/posts/:postId'}),
          'admin-post',
        );

        // Test user patterns - should share the '/users/:userId/' prefix
        // structure
        let match = list.match('/users/123/posts/456', 'http://example.com');
        assert.ok(match, 'should match /users/:userId/posts/:postId');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          userId: '123',
          postId: '456',
        });
        assert.strictEqual(match?.value, 'user-post');

        match = list.match('/users/123/posts/drafts', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {userId: '123'});
        assert.strictEqual(match?.value, 'user-drafts');

        match = list.match('/users/123/comments/789', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {
          userId: '123',
          commentId: '789',
        });
        assert.strictEqual(match?.value, 'user-comment');

        match = list.match('/users/123/settings', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {userId: '123'});
        assert.strictEqual(match?.value, 'user-settings');

        // Test admin patterns - should share the '/admin/:adminId/' prefix
        // structure
        match = list.match('/admin/456/posts/789', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {
          adminId: '456',
          postId: '789',
        });
        assert.strictEqual(match?.value, 'admin-post');

        match = list.match('/admin/456/posts/drafts', 'http://example.com');
        assert.ok(match);
        assert.deepStrictEqual(match?.result.pathname.groups, {adminId: '456'});
        assert.strictEqual(match?.value, 'admin-drafts');

        // Test non-matching paths
        match = list.match('/users/123/invalid', 'http://example.com');
        assert.strictEqual(match, null);

        match = list.match('/other/123/posts/456', 'http://example.com');
        assert.strictEqual(match, null);
      });

      test('handles OneOrMore wildcard modifiers to match URLPattern semantics exactly', () => {
        const list = impl.create<string>();

        // Test case 1: OneOrMore wildcard with path separator
        // URLPattern considers /api/*+ to match /api/ (capturing empty string)
        list.addPattern(new URLPattern({pathname: '/api/*+'}), 'api-oneormore');

        let match = list.match('/api/', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'api-oneormore');

        match = list.match('/api/something', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'api-oneormore');

        // Test case 2: OneOrMore wildcard without path separator
        const list2 = impl.create<string>();
        list2.addPattern(
          new URLPattern({pathname: '/test*+'}),
          'test-oneormore',
        );

        // Verify direct URLPattern behavior first
        const directPattern = new URLPattern({pathname: '/test*+'});
        const directResult = directPattern.exec('/test', 'http://example.com');
        assert.ok(directResult);

        // Our implementation should match URLPattern behavior
        match = list2.match('/test', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'test-oneormore');

        match = list2.match('/testcontent', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'test-oneormore');
      });

      test('handles zero-consumption patterns correctly', () => {
        const list = impl.create<string>();

        // Test patterns that can match with zero consumption
        list.addPattern(
          new URLPattern({pathname: '/path/:optional?'}),
          'optional-param',
        );
        list.addPattern(
          new URLPattern({pathname: '/path/:zeroOrMore*'}),
          'zero-or-more',
        );

        // These should match even when the optional/zero-or-more parts consume nothing
        let match = list.match('/path', 'http://example.com');
        assert.ok(match);

        // Test precedence - first pattern should win
        assert.strictEqual(match?.value, 'optional-param');
      });

      test('eliminates redundant FullWildcard matching loops', () => {
        const list = impl.create<string>();

        // Add patterns that would trigger both loops in the old implementation
        list.addPattern(
          new URLPattern({pathname: '/api/users/:id'}),
          'specific',
        );
        list.addPattern(new URLPattern({pathname: '/api/*'}), 'wildcard');

        // Specific pattern should win due to first-match-wins semantics
        let match = list.match('/api/users/123', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'specific');

        // Wildcard should match other paths
        match = list.match('/api/other/path', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'wildcard');

        // Test edge case: wildcard at path boundary
        match = list.match('/api/', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'wildcard');
      });

      test('handles multiple competing wildcard patterns with first-match semantics', () => {
        const list = impl.create<string>();

        // Add multiple wildcard patterns that could all match the same path
        list.addPattern(
          new URLPattern({pathname: '/files/*'}),
          'files-catch-all',
        );
        list.addPattern(
          new URLPattern({pathname: '/files/:type/*'}),
          'files-typed',
        );
        list.addPattern(
          new URLPattern({pathname: '/files/images/*'}),
          'files-images',
        );

        // First pattern should win
        let match = list.match('/files/images/photo.jpg', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'files-catch-all');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          0: 'images/photo.jpg',
        });

        // Test with different path - still first pattern wins
        match = list.match('/files/documents/report.pdf', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'files-catch-all');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          0: 'documents/report.pdf',
        });
      });

      // TODO (justinfagnani): fix first-match semantics
      test('handles complex backtracking scenarios with multiple patterns', () => {
        const list = impl.create<string>();

        // Patterns that require proper backtracking to find the right match
        list.addPattern(
          new URLPattern({pathname: '/posts/:id-:slug-:category'}),
          'three-part',
        );
        list.addPattern(
          new URLPattern({pathname: '/posts/:id-:slug'}),
          'two-part',
        );
        list.addPattern(new URLPattern({pathname: '/posts/:id'}), 'one-part');

        // Should match the most specific pattern that works
        let match = list.match(
          '/posts/123-hello-world-tech',
          'http://example.com',
        );
        assert.ok(match);
        assert.strictEqual(match?.value, 'three-part');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          id: '123',
          slug: 'hello',
          category: 'world-tech',
        });

        // Should match two-part pattern when three-part fails
        match = list.match('/posts/123-hello', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'two-part');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          id: '123',
          slug: 'hello',
        });

        // Should match one-part pattern when others fail
        match = list.match('/posts/123', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'one-part');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          id: '123',
        });
      });

      test('handles regex patterns with overlapping matches', () => {
        const list = impl.create<string>();

        // Multiple regex patterns that could potentially match similar inputs
        list.addPattern(
          new URLPattern({pathname: '/api/:version(v\\d+)/:resource'}),
          'versioned-api',
        );
        list.addPattern(
          new URLPattern({pathname: '/api/:category([a-z]+)/:resource'}),
          'category-api',
        );
        list.addPattern(
          new URLPattern({pathname: '/api/:anything/:resource'}),
          'generic-api',
        );

        // Version pattern should match
        let match = list.match('/api/v1/users', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'versioned-api');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          version: 'v1',
          resource: 'users',
        });

        // Category pattern should match when version doesn't
        match = list.match('/api/admin/users', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'category-api');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          category: 'admin',
          resource: 'users',
        });

        // Generic should match when others don't
        match = list.match('/api/123abc/users', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'generic-api');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          anything: '123abc',
          resource: 'users',
        });
      });

      test('handles patterns with multiple optional segments and precedence', () => {
        const list = impl.create<string>();

        // Patterns with different levels of optional segments
        list.addPattern(
          new URLPattern({pathname: '/shop/:category?/:subcategory?/:item?'}),
          'shop-flexible',
        );
        list.addPattern(
          new URLPattern({pathname: '/shop/:category/:item'}),
          'shop-specific',
        );
        list.addPattern(
          new URLPattern({pathname: '/shop/special'}),
          'shop-special',
        );

        // First pattern should match due to first-match-wins
        let match = list.match(
          '/shop/electronics/phones',
          'http://example.com',
        );
        assert.ok(match);
        assert.strictEqual(match?.value, 'shop-flexible');

        // Should still match first pattern for special case
        match = list.match('/shop/special', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'shop-flexible');

        // Test different levels of the flexible pattern
        match = list.match('/shop', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'shop-flexible');

        match = list.match('/shop/electronics', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'shop-flexible');
      });

      test('stress test with many patterns sharing prefixes', () => {
        const list = impl.create<number>();

        // Add many patterns with shared prefixes to test performance and correctness
        const patterns = [
          '/api/v1/users',
          '/api/v1/users/:id',
          '/api/v1/users/:id/posts',
          '/api/v1/users/:id/posts/:postId',
          '/api/v1/posts',
          '/api/v1/posts/:id',
          '/api/v1/comments',
          '/api/v1/comments/:id',
          '/api/v2/users',
          '/api/v2/users/:id',
          '/api/v2/posts',
          '/api/v2/posts/:id',
          '/blog/posts',
          '/blog/posts/:slug',
          '/blog/categories',
          '/blog/categories/:name',
          '/shop/products',
          '/shop/products/:id',
          '/shop/categories',
          '/shop/cart',
        ];

        patterns.forEach((pattern, index) => {
          list.addPattern(new URLPattern({pathname: pattern}), index);
        });

        // Test that first-match behavior is preserved even with many patterns
        let match = list.match('/api/v1/users/123', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 1); // Second pattern: '/api/v1/users/:id'

        match = list.match('/blog/posts/my-post', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 13); // Pattern: '/blog/posts/:slug'

        // Test unmatched path
        match = list.match('/unmatched/path', 'http://example.com');
        assert.strictEqual(match, null);
      });

      test('handles edge case with competing quantifiers', () => {
        const list = impl.create<string>();

        // Patterns with different quantifiers that could match the same path
        list.addPattern(
          new URLPattern({pathname: '/path/:segments+/end'}),
          'one-or-more',
        );
        list.addPattern(
          new URLPattern({pathname: '/path/:segments*/end'}),
          'zero-or-more',
        );
        list.addPattern(
          new URLPattern({pathname: '/path/:segment?/end'}),
          'optional',
        );

        // First pattern should win when it can match
        let match = list.match('/path/a/b/end', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'one-or-more');

        match = list.match('/path/a/end', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'one-or-more');

        // When + pattern can't match (needs at least one segment)
        match = list.match('/path/end', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'zero-or-more');
      });

      test('handles root path and empty segment edge cases', () => {
        const list = impl.create<string>();

        // Test root path and paths with empty segments
        // Note: Order matters for first-match-wins behavior
        list.addPattern(new URLPattern({pathname: '/'}), 'root');
        list.addPattern(new URLPattern({pathname: '/api'}), 'api-no-slash');
        list.addPattern(
          new URLPattern({pathname: '/api/'}),
          'api-trailing-slash',
        );
        list.addPattern(new URLPattern({pathname: '/:param'}), 'root-param');

        // Root path should match first pattern
        let match = list.match('/', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'root');

        // /api should match the specific api pattern, not the param pattern
        match = list.match('/api', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'api-no-slash');

        // Trailing slash behavior
        match = list.match('/api/', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'api-trailing-slash');

        // Other single segments should match the param pattern
        match = list.match('/test', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'root-param');
        assert.deepStrictEqual(match?.result.pathname.groups, {param: 'test'});
      });

      test('handles patterns with special characters and escaping', () => {
        const list = impl.create<string>();

        // Patterns with special characters that need proper handling
        list.addPattern(
          new URLPattern({pathname: '/files/:name\\.pdf'}),
          'pdf-literal-dot',
        );
        list.addPattern(
          new URLPattern({pathname: '/path\\(:id\\)'}),
          'literal-parens',
        );
        list.addPattern(
          new URLPattern({pathname: '/api\\+plus/:id'}),
          'literal-plus',
        );

        // These should match literal characters, not regex patterns
        let match = list.match('/files/document.pdf', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'pdf-literal-dot');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          name: 'document',
        });

        // Should not match without the literal dot
        match = list.match('/files/documentXpdf', 'http://example.com');
        assert.strictEqual(match, null);

        match = list.match('/path(123)', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'literal-parens');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});

        match = list.match('/api+plus/456', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'literal-plus');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '456'});
      });

      test('handles empty list and null/undefined edge cases', () => {
        const list = impl.create<string>();

        // Empty list should return null for any path
        let match = list.match('/', 'http://example.com');
        assert.strictEqual(match, null);

        match = list.match('/any/path', 'http://example.com');
        assert.strictEqual(match, null);

        // After adding and removing patterns (if supported), should behave correctly
        list.addPattern(new URLPattern({pathname: '/test'}), 'test-value');
        match = list.match('/test', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'test-value');
      });

      test('maintains first-match semantics despite tree insertion order optimization', () => {
        const list = impl.create<string>();

        // Pattern A: Doesn't match our test path, but establishes a wildcard
        // prefix first in the tree.
        list.addPattern(
          new URLPattern({pathname: '/:section/:title.txt'}),
          'A',
        );

        // Pattern B: Matches our test path, but does not share a prefix with
        // pattern A, so it's inserted as a later sibling.
        list.addPattern(
          new URLPattern({pathname: '/special/:title.html'}),
          'B',
        );

        // Pattern C: Also matches our test path, but shares the wildcard prefix
        // with pattern A, so it's inserted earlier in the tree than pattern B.
        list.addPattern(
          new URLPattern({pathname: '/:section/:title.html'}),
          'C',
        );

        // Test path '/special/foo.html' should match pattern B (second added),
        // NOT pattern C (third added), even though pattern C might be found
        // earlier in tree traversal due to sharing the wildcard prefix with
        // pattern A.
        const match = list.match('/special/foo.html', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match.value, 'B');
        assert.deepStrictEqual(match.result.pathname.groups, {title: 'foo'});

        // Verify that Pattern A still works for its intended path
        const matchA = list.match('/docs/readme.txt', 'http://example.com');
        assert.ok(matchA);
        assert.strictEqual(matchA.value, 'A');
        assert.deepStrictEqual(matchA.result.pathname.groups, {
          section: 'docs',
          title: 'readme',
        });

        // Verify that Pattern C works when Pattern B doesn't match
        const matchC = list.match('/blog/post.html', 'http://example.com');
        assert.ok(matchC);
        assert.strictEqual(matchC.value, 'C');
        assert.deepStrictEqual(matchC.result.pathname.groups, {
          section: 'blog',
          title: 'post',
        });
      });

      test('handles complex nested group patterns with first-match semantics', () => {
        const list = impl.create<string>();

        // Complex patterns with alternation
        list.addPattern(
          new URLPattern({pathname: '/api/(v1|v2)/:resource/:id'}),
          'complex-versioned',
        );
        list.addPattern(
          new URLPattern({pathname: '/api/:version/:resource/:id'}),
          'simple-api',
        );
        list.addPattern(new URLPattern({pathname: '/api/*'}), 'api-fallback');

        // First pattern should match when it can
        let match = list.match('/api/v1/users/123', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'complex-versioned');

        // Test with v2
        match = list.match('/api/v2/posts/456', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'complex-versioned');

        // When complex pattern doesn't match, should fall back to simple
        match = list.match('/api/v3/comments/789', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'simple-api');

        // When neither matches proper structure, should fall back to wildcard
        match = list.match('/api/invalid/structure', 'http://example.com');
        assert.ok(match);
        assert.strictEqual(match?.value, 'api-fallback');
      });

      suite('match() - Full URL Pattern Matching', () => {
        test('matches protocol-specific patterns', () => {
          const list = impl.create<string>();
          list.addPattern(
            new URLPattern({
              protocol: 'https',
              hostname: 'api.example.com',
              pathname: '/users/:id',
            }),
            'secure-api',
          );
          list.addPattern(
            new URLPattern({
              protocol: 'http',
              hostname: 'api.example.com',
              pathname: '/users/:id',
            }),
            'insecure-api',
          );
          list.addPattern(
            new URLPattern({
              pathname: '/users/:id',
            }),
            'any-protocol',
          );

          // Should match specific protocols first
          let match = list.match('https://api.example.com/users/123');
          assert.strictEqual(match?.value, 'secure-api');
          assert.strictEqual(match?.result.pathname.groups.id, '123');

          match = list.match('http://api.example.com/users/123');
          assert.strictEqual(match?.value, 'insecure-api');
          assert.strictEqual(match?.result.pathname.groups.id, '123');

          // Different hostname should match fallback
          match = list.match('https://other.example.com/users/456');
          assert.strictEqual(match?.value, 'any-protocol');
          assert.strictEqual(match?.result.pathname.groups.id, '456');
        });

        test('matches hostname-specific patterns', () => {
          const list = impl.create<string>();
          list.addPattern(
            new URLPattern({
              hostname: 'api.example.com',
              pathname: '/data',
            }),
            'api-host',
          );
          list.addPattern(
            new URLPattern({
              hostname: 'cdn.example.com',
              pathname: '/data',
            }),
            'cdn-host',
          );
          list.addPattern(
            new URLPattern({
              pathname: '/data',
            }),
            'any-host',
          );

          let match = list.match('https://api.example.com/data');
          assert.strictEqual(match?.value, 'api-host');

          match = list.match('https://cdn.example.com/data');
          assert.strictEqual(match?.value, 'cdn-host');

          match = list.match('https://unknown.example.com/data');
          assert.strictEqual(match?.value, 'any-host');
        });

        test('matches patterns with hostname parameters', () => {
          const list = impl.create<string>();
          list.addPattern(
            new URLPattern({
              hostname: ':subdomain.api.example.com',
              pathname: '/service',
            }),
            'subdomain-api',
          );
          list.addPattern(
            new URLPattern({
              hostname: 'static.example.com',
              pathname: '/service',
            }),
            'static-host',
          );

          let match = list.match('https://v1.api.example.com/service');
          assert.strictEqual(match?.value, 'subdomain-api');
          assert.strictEqual(match?.result.hostname.groups.subdomain, 'v1');

          match = list.match('https://v2.api.example.com/service');
          assert.strictEqual(match?.value, 'subdomain-api');
          assert.strictEqual(match?.result.hostname.groups.subdomain, 'v2');

          match = list.match('https://static.example.com/service');
          assert.strictEqual(match?.value, 'static-host');
        });

        test('matches patterns with port specifications', () => {
          const list = impl.create<string>();
          list.addPattern(
            new URLPattern({
              hostname: 'localhost',
              port: '3000',
              pathname: '/api/:endpoint',
            }),
            'dev-server',
          );
          list.addPattern(
            new URLPattern({
              hostname: 'localhost',
              port: ':port',
              pathname: '/api/:endpoint',
            }),
            'any-port',
          );

          let match = list.match('http://localhost:3000/api/users');
          assert.strictEqual(match?.value, 'dev-server');
          assert.strictEqual(match?.result.pathname.groups.endpoint, 'users');

          match = list.match('http://localhost:8080/api/posts');
          assert.strictEqual(match?.value, 'any-port');
          assert.strictEqual(match?.result.port.groups.port, '8080');
          assert.strictEqual(match?.result.pathname.groups.endpoint, 'posts');
        });

        test('matches patterns with search parameters', () => {
          const list = impl.create<string>();
          list.addPattern(
            new URLPattern({
              pathname: '/search',
              search: 'q=:query&type=product',
            }),
            'product-search',
          );
          list.addPattern(
            new URLPattern({
              pathname: '/search',
              search: 'q=:query&type=:type',
            }),
            'general-search',
          );
          list.addPattern(
            new URLPattern({
              pathname: '/search',
            }),
            'any-search',
          );

          let match = list.match(
            'https://example.com/search?q=laptop&type=product',
          );
          assert.strictEqual(match?.value, 'product-search');
          assert.strictEqual(match?.result.search.groups.query, 'laptop');

          match = list.match('https://example.com/search?q=book&type=media');
          assert.strictEqual(match?.value, 'general-search');
          assert.strictEqual(match?.result.search.groups.query, 'book');
          assert.strictEqual(match?.result.search.groups.type, 'media');

          match = list.match('https://example.com/search?page=1');
          assert.strictEqual(match?.value, 'any-search');
        });

        test('matches patterns with hash fragments', () => {
          const list = impl.create<string>();
          list.addPattern(
            new URLPattern({
              pathname: '/docs/:page',
              hash: 'section-:section',
            }),
            'docs-section',
          );
          list.addPattern(
            new URLPattern({
              pathname: '/docs/:page',
            }),
            'docs-page',
          );

          let match = list.match('https://example.com/docs/api#section-auth');
          assert.strictEqual(match?.value, 'docs-section');
          assert.strictEqual(match?.result.pathname.groups.page, 'api');
          assert.strictEqual(match?.result.hash.groups.section, 'auth');

          match = list.match('https://example.com/docs/guide#overview');
          assert.strictEqual(match?.value, 'docs-page');
          assert.strictEqual(match?.result.pathname.groups.page, 'guide');
        });

        test('maintains first-match semantics with mixed specificity', () => {
          const list = impl.create<string>();
          // Add in order: specific → general → more specific
          list.addPattern(
            new URLPattern({
              protocol: 'https',
              hostname: 'api.example.com',
              pathname: '/v1/:resource',
            }),
            'first-specific',
          );
          list.addPattern(
            new URLPattern({
              pathname: '/v1/:resource',
            }),
            'general',
          );
          list.addPattern(
            new URLPattern({
              protocol: 'https',
              hostname: 'api.example.com',
              pathname: '/v1/users',
            }),
            'more-specific',
          );

          // First matching pattern should win, even if a more specific pattern was added later
          let match = list.match('https://api.example.com/v1/users');
          assert.strictEqual(match?.value, 'first-specific');
          assert.strictEqual(match?.result.pathname.groups.resource, 'users');

          // General pattern should match other hosts
          match = list.match('https://other.example.com/v1/posts');
          assert.strictEqual(match?.value, 'general');
          assert.strictEqual(match?.result.pathname.groups.resource, 'posts');
        });

        test('handles URL object input', () => {
          const list = impl.create<string>();
          list.addPattern(
            new URLPattern({
              protocol: 'https',
              hostname: 'api.example.com',
              pathname: '/users/:id',
            }),
            'api-user',
          );

          const url = new URL('https://api.example.com/users/123');
          const match = list.match(url.toString());
          assert.strictEqual(match?.value, 'api-user');
          assert.strictEqual(match?.result.pathname.groups.id, '123');
        });

        test('handles complex real-world patterns', () => {
          const list = impl.create<string>();
          // GitHub-like API patterns
          list.addPattern(
            new URLPattern({
              protocol: 'https',
              hostname: 'api.github.com',
              pathname: '/repos/:owner/:repo/issues/:number',
            }),
            'github-issue',
          );
          list.addPattern(
            new URLPattern({
              protocol: 'https',
              hostname: 'api.github.com',
              pathname: '/repos/:owner/:repo/:endpoint*',
            }),
            'github-repo',
          );
          list.addPattern(
            new URLPattern({
              protocol: 'https',
              hostname: ':subdomain.github.com',
              pathname: '/:path*',
            }),
            'github-subdomain',
          );

          let match = list.match(
            'https://api.github.com/repos/microsoft/vscode/issues/123',
          );
          assert.strictEqual(match?.value, 'github-issue');
          assert.strictEqual(match?.result.pathname.groups.owner, 'microsoft');
          assert.strictEqual(match?.result.pathname.groups.repo, 'vscode');
          assert.strictEqual(match?.result.pathname.groups.number, '123');

          match = list.match(
            'https://api.github.com/repos/microsoft/vscode/pulls',
          );
          assert.strictEqual(match?.value, 'github-repo');
          assert.strictEqual(match?.result.pathname.groups.owner, 'microsoft');
          assert.strictEqual(match?.result.pathname.groups.repo, 'vscode');

          match = list.match('https://docs.github.com/en/api');
          assert.strictEqual(match?.value, 'github-subdomain');
          assert.strictEqual(match?.result.hostname.groups.subdomain, 'docs');
        });

        test('returns null when no patterns match', () => {
          const list = impl.create<string>();
          list.addPattern(
            new URLPattern({
              protocol: 'https',
              hostname: 'api.example.com',
              pathname: '/users/:id',
            }),
            'api-user',
          );

          // Different protocol
          let match = list.match('http://api.example.com/users/123');
          assert.strictEqual(match, null);

          // Different hostname
          match = list.match('https://other.example.com/users/123');
          assert.strictEqual(match, null);

          // Different pathname
          match = list.match('https://api.example.com/posts/123');
          assert.strictEqual(match, null);
        });

        test('handles authentication URLs', () => {
          const list = impl.create<string>();
          list.addPattern(
            new URLPattern({
              protocol: 'https',
              username: ':user',
              password: ':pass',
              hostname: 'secure.example.com',
              pathname: '/api/data',
            }),
            'authenticated-api',
          );
          list.addPattern(
            new URLPattern({
              protocol: 'https',
              hostname: 'secure.example.com',
              pathname: '/api/data',
            }),
            'public-api',
          );

          let match = list.match(
            'https://admin:secret@secure.example.com/api/data',
          );
          assert.strictEqual(match?.value, 'authenticated-api');
          assert.strictEqual(match?.result.username.groups.user, 'admin');
          assert.strictEqual(match?.result.password.groups.pass, 'secret');

          match = list.match('https://secure.example.com/api/data');
          assert.strictEqual(match?.value, 'public-api');
        });
      });
    });
  }
});
