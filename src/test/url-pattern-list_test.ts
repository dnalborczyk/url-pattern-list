import {describe as suite, test} from 'node:test';
import {URLPatternList} from '../index.js';
import {NaiveURLPatternList} from './naive-url-pattern-list.js';
import * as assert from 'node:assert';

interface URLPatternListLike<T> {
  addPattern(pattern: URLPattern, value: T): void;
  match(
    path: string,
    baseUrl?: string,
  ): {result: URLPatternResult; value: T} | null;
}

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
    suite(impl.name, () => {
      test('matches a single pattern and returns its value', () => {
        const list = impl.create<string>();
        const patternValue = 'testValue1';
        list.addPattern(new URLPattern({pathname: '/foo'}), patternValue);
        const match = list.match('/foo', 'http://example.com');
        assert.ok(match, 'should match');
        assert.deepStrictEqual(match?.result.pathname.groups, {});
        assert.strictEqual(
          match?.value,
          patternValue,
          'should return the correct value',
        );
      });

      test('returns null when no patterns match', () => {
        const list = impl.create<number>();
        list.addPattern(new URLPattern({pathname: '/foo'}), 1);
        const match = list.match('/bar', 'http://example.com');
        assert.strictEqual(match, null, 'should not match');
      });

      test('matches the first added pattern that tests true and returns its value', () => {
        const list = impl.create<{type: string}>();
        const value1 = {type: 'id'};
        const value2 = {type: 'bookId'};
        // Pattern 1: matches /books/:id
        list.addPattern(new URLPattern({pathname: '/books/:id'}), value1);
        // Pattern 2: also matches /books/*, but with a different group name
        list.addPattern(new URLPattern({pathname: '/books/:bookId'}), value2);

        const match = list.match('/books/123', 'http://example.com');
        assert.ok(match, 'should match');
        // Assert that the first pattern was matched by checking its group name and
        // value
        assert.deepStrictEqual(
          match?.result.pathname.groups,
          {id: '123'},
          'Should match the first pattern and capture its group',
        );
        assert.strictEqual(
          match?.value,
          value1,
          'Should return the value of the first matched pattern',
        );
      });

      test('matches a pattern with a base URL and returns its value', () => {
        const list = impl.create<boolean>();
        const patternValue = true;
        list.addPattern(new URLPattern({pathname: '/foo'}), patternValue);
        const match = list.match('/foo', 'http://localhost');
        assert.ok(match, 'should match with base URL');
        assert.strictEqual(match?.value, patternValue);
      });

      test('matches a pattern with parameters and returns its value', () => {
        const list = impl.create<string>();
        const patternValue = 'userRoute';
        list.addPattern(new URLPattern({pathname: '/users/:id'}), patternValue);
        const match = list.match('/users/123', 'http://example.com');
        assert.ok(match, 'should match');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, patternValue);
      });

      test('returns null when list is empty', () => {
        const list = impl.create<any>();
        const match = list.match('/foo', 'http://example.com');
        assert.strictEqual(match, null, 'should not match an empty list');
      });

      test('matches patterns in the order they were added and returns correct value', () => {
        const list = impl.create<string>();
        const valueSpecific = 'item-id';
        // This value won't be matched in the second case due to order
        const valueGeneral = 'item-special';

        // More specific pattern by structure, but added first, so it takes
        // precedence for /items/:id type matches
        list.addPattern(
          new URLPattern({pathname: '/items/:id'}),
          valueSpecific,
        );
        list.addPattern(
          new URLPattern({pathname: '/items/special'}),
          valueGeneral,
        );

        let match = list.match('/items/123', 'http://example.com');
        assert.ok(match, 'should match /items/:id');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, valueSpecific);

        match = list.match('/items/special', 'http://example.com');
        // The first pattern '/items/:id' will match '/items/special' and
        // capture {id: 'special'}
        assert.ok(
          match,
          'should match /items/:id for /items/special due to order',
        );
        assert.deepStrictEqual(match?.result.pathname.groups, {id: 'special'});
        assert.strictEqual(
          match?.value,
          valueSpecific,
          'Should return value of the first pattern that matched',
        );
      });

      test('addPattern correctly adds a pattern and value that can be matched', () => {
        const list = impl.create<number>();
        const patternValue = 42;
        const pattern = new URLPattern({pathname: '/test-add'});
        list.addPattern(pattern, patternValue);
        const match = list.match('/test-add', 'http://example.com');
        assert.ok(match, 'Pattern added via addPattern should be matchable');
        assert.deepStrictEqual(match?.result.pathname.groups, {});
        assert.strictEqual(match?.value, patternValue);
      });

      test('handles wildcard (*) correctly', () => {
        const list = impl.create<string>();
        const v1 = 'wildcard-files';
        list.addPattern(new URLPattern({pathname: '/files/*'}), v1);
        const match1 = list.match('/files/document.txt', 'http://example.com');
        assert.ok(match1, 'should match /files/document.txt');
        assert.deepStrictEqual(match1?.result.pathname.groups, {
          0: 'document.txt',
        });
        assert.strictEqual(match1?.value, v1);

        const match2 = list.match(
          '/files/archive/report.zip',
          'http://example.com',
        );
        assert.ok(match2, 'should match /files/archive/report.zip');
        assert.deepStrictEqual(match2?.result.pathname.groups, {
          0: 'archive/report.zip',
        });
        assert.strictEqual(match2?.value, v1);

        const noMatch = list.match(
          '/documents/report.pdf',
          'http://example.com',
        );
        assert.strictEqual(
          noMatch,
          null,
          'should not match /documents/report.pdf',
        );
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
        assert.ok(match, 'should match with named groups');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          userId: 'alice',
          section: 'settings',
        });
        assert.strictEqual(match?.value, v1);

        const noMatch = list.match('/users/bob/settings', 'http://example.com');
        assert.strictEqual(
          noMatch,
          null,
          'should not match with missing group',
        );
      });

      test('handles optional named groups ({...}?) correctly', () => {
        const list = impl.create<string>();
        const v1 = 'optional-group';
        list.addPattern(
          new URLPattern({pathname: '/api/{v:version/}?data'}),
          v1,
        );

        const matchWithGroup = list.match('/api/v1/data', 'http://example.com');
        assert.ok(matchWithGroup, 'should match with optional group present');
        assert.deepStrictEqual(matchWithGroup?.result.pathname.groups, {
          version: '1',
        });
        assert.strictEqual(matchWithGroup?.value, v1);

        const matchWithoutGroup = list.match('/api/data', 'http://example.com');
        assert.ok(matchWithoutGroup, 'should match with optional group absent');
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
        assert.ok(matchSmall, 'should match /img/small/cat.jpg');
        assert.deepStrictEqual(matchSmall?.result.pathname.groups, {
          '0': 'small',
          name: 'cat',
        });
        assert.strictEqual(matchSmall?.value, v1);

        const matchLarge = list.match(
          '/img/large/dog.jpg',
          'http://example.com',
        );
        assert.ok(matchLarge, 'should match /img/large/dog.jpg');
        assert.deepStrictEqual(matchLarge?.result.pathname.groups, {
          '0': 'large',
          name: 'dog',
        });
        assert.strictEqual(matchLarge?.value, v1);

        const noMatch = list.match('/img/medium/rat.jpg', 'http://example.com');
        assert.strictEqual(
          noMatch,
          null,
          'should not match /img/medium/rat.jpg',
        );
      });

      test('handles regex groups (...) correctly', () => {
        const list = impl.create<string>();
        const v1 = 'regex-group';
        // Example: /product/{id:\\d+}
        list.addPattern(new URLPattern({pathname: '/product/:id(\\d+)'}), v1);

        const match = list.match('/product/12345', 'http://example.com');
        assert.ok(match, 'should match /product/12345 with regex group');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '12345'});
        assert.strictEqual(match?.value, v1);

        const noMatch = list.match('/product/abc', 'http://example.com');
        assert.strictEqual(
          noMatch,
          null,
          'should not match /product/abc with regex group',
        );
      });

      test('handles full wildcard (/*) at the end of a segment', () => {
        const list = impl.create<string>();
        const v1 = 'segment-wildcard';
        list.addPattern(new URLPattern({pathname: '/data/:collection/*'}), v1);

        const match = list.match(
          '/data/items/item1/details',
          'http://example.com',
        );
        assert.ok(match, 'should match path with wildcard segment');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          collection: 'items',
          0: 'item1/details',
        });
        assert.strictEqual(match?.value, v1);

        // Wildcard expects something after /items/
        const noMatch = list.match('/data/items', 'http://example.com');
        assert.strictEqual(
          noMatch,
          null,
          'should not match if wildcard part is empty and pattern expects content',
        );
      });

      test('handles plus (+) quantifier for named groups correctly', () => {
        const list = impl.create<string>();
        const v1 = 'plus-quantifier';
        list.addPattern(new URLPattern({pathname: '/path/:segments+'}), v1);

        const matchOne = list.match('/path/a', 'http://example.com');
        assert.ok(matchOne, 'should match one segment with +');
        assert.deepStrictEqual(matchOne?.result.pathname.groups, {
          segments: 'a',
        });
        assert.strictEqual(matchOne?.value, v1);

        const matchMultiple = list.match('/path/a/b/c', 'http://example.com');
        assert.ok(matchMultiple, 'should match multiple segments with +');
        assert.deepStrictEqual(matchMultiple?.result.pathname.groups, {
          segments: 'a/b/c',
        });
        assert.strictEqual(matchMultiple?.value, v1);

        // + requires at least one segment
        const noMatch = list.match('/path/', 'http://example.com');
        assert.strictEqual(
          noMatch,
          null,
          'should not match empty segments with +',
        );
      });

      test('handles star (*) quantifier for named groups correctly', () => {
        const list = impl.create<string>();
        const v1 = 'star-quantifier';
        list.addPattern(new URLPattern({pathname: '/path/:segments*'}), v1);

        const matchZero = list.match('/path', 'http://example.com');
        assert.ok(matchZero, 'should match zero segments with *');
        assert.deepStrictEqual(matchZero?.result.pathname.groups, {
          segments: undefined,
        }); // Or {} depending on URLPattern polyfill behavior for empty * group
        assert.strictEqual(matchZero?.value, v1);

        const matchOne = list.match('/path/a', 'http://example.com');
        assert.ok(matchOne, 'should match one segment with *');
        assert.deepStrictEqual(matchOne?.result.pathname.groups, {
          segments: 'a',
        });
        assert.strictEqual(matchOne?.value, v1);

        const matchMultiple = list.match('/path/a/b/c', 'http://example.com');
        assert.ok(matchMultiple, 'should match multiple segments with *');
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
        assert.ok(match, 'should match /api/users/profile');
        assert.deepStrictEqual(match?.result.pathname.groups, {});
        assert.strictEqual(match?.value, 'user-profile');

        match = list.match('/api/users/123', 'http://example.com');
        assert.ok(match, 'should match /api/users/:id');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, 'user-detail');

        match = list.match('/api/posts/456', 'http://example.com');
        assert.ok(match, 'should match /api/posts/:id');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '456'});
        assert.strictEqual(match?.value, 'post-detail');

        match = list.match('/api/settings', 'http://example.com');
        assert.ok(match, 'should match /api/settings');
        assert.deepStrictEqual(match?.result.pathname.groups, {});
        assert.strictEqual(match?.value, 'settings');

        // Test patterns that share /blog prefix
        match = list.match('/blog/archives', 'http://example.com');
        assert.ok(match, 'should match /blog/archives');
        assert.deepStrictEqual(match?.result.pathname.groups, {});
        assert.strictEqual(match?.value, 'blog-archives');

        match = list.match('/blog/my-awesome-post', 'http://example.com');
        assert.ok(match, 'should match /blog/:slug');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          slug: 'my-awesome-post',
        });
        assert.strictEqual(match?.value, 'blog-post');

        // Test non-matching paths
        match = list.match('/other/path', 'http://example.com');
        assert.strictEqual(match, null, 'should not match unregistered paths');

        match = list.match('/api', 'http://example.com');
        assert.strictEqual(match, null, 'should not match incomplete paths');
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
        assert.ok(match, 'should match /api/v1/users/:id');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, 'v1-user');

        match = list.match('/api/v1/users/123/posts', 'http://example.com');
        assert.ok(match, 'should match /api/v1/users/:id/posts');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, 'v1-user-posts');

        match = list.match('/api/v1/posts/456', 'http://example.com');
        assert.ok(match, 'should match /api/v1/posts/:id');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '456'});
        assert.strictEqual(match?.value, 'v1-post');

        // Test v2 API endpoints
        match = list.match('/api/v2/users/789', 'http://example.com');
        assert.ok(match, 'should match /api/v2/users/:id');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '789'});
        assert.strictEqual(match?.value, 'v2-user');

        match = list.match('/api/v2/posts/101', 'http://example.com');
        assert.ok(match, 'should match /api/v2/posts/:id');
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
        assert.ok(match, 'should match /items/:id');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '123'});
        assert.strictEqual(match?.value, 'dynamic-item');

        // The first pattern should also match 'special' since it was added first
        match = list.match('/items/special', 'http://example.com');
        assert.ok(match, 'should match first pattern for /items/special');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: 'special'});
        assert.strictEqual(match?.value, 'dynamic-item');

        // Test the nested patterns
        match = list.match('/items/featured/456', 'http://example.com');
        assert.ok(match, 'should match /items/featured/:id');
        assert.deepStrictEqual(match?.result.pathname.groups, {id: '456'});
        assert.strictEqual(match?.value, 'featured-item');

        match = list.match('/items/featured/top', 'http://example.com');
        assert.ok(match, 'should match /items/featured/:id for top');
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
        assert.ok(match, 'should match /users/:userId/posts/drafts');
        assert.deepStrictEqual(match?.result.pathname.groups, {userId: '123'});
        assert.strictEqual(match?.value, 'user-drafts');

        match = list.match('/users/123/comments/789', 'http://example.com');
        assert.ok(match, 'should match /users/:userId/comments/:commentId');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          userId: '123',
          commentId: '789',
        });
        assert.strictEqual(match?.value, 'user-comment');

        match = list.match('/users/123/settings', 'http://example.com');
        assert.ok(match, 'should match /users/:userId/settings');
        assert.deepStrictEqual(match?.result.pathname.groups, {userId: '123'});
        assert.strictEqual(match?.value, 'user-settings');

        // Test admin patterns - should share the '/admin/:adminId/' prefix
        // structure
        match = list.match('/admin/456/posts/789', 'http://example.com');
        assert.ok(match, 'should match /admin/:adminId/posts/:postId');
        assert.deepStrictEqual(match?.result.pathname.groups, {
          adminId: '456',
          postId: '789',
        });
        assert.strictEqual(match?.value, 'admin-post');

        match = list.match('/admin/456/posts/drafts', 'http://example.com');
        assert.ok(match, 'should match /admin/:adminId/posts/drafts');
        assert.deepStrictEqual(match?.result.pathname.groups, {adminId: '456'});
        assert.strictEqual(match?.value, 'admin-drafts');

        // Test non-matching paths
        match = list.match('/users/123/invalid', 'http://example.com');
        assert.strictEqual(match, null, 'should not match invalid user paths');

        match = list.match('/other/123/posts/456', 'http://example.com');
        assert.strictEqual(
          match,
          null,
          'should not match non-user/admin paths',
        );
      });

      test('handles OneOrMore wildcard modifiers to match URLPattern semantics exactly', () => {
        const list = impl.create<string>();

        // Test case 1: OneOrMore wildcard with path separator
        // URLPattern considers /api/*+ to match /api/ (capturing empty string)
        list.addPattern(new URLPattern({pathname: '/api/*+'}), 'api-oneormore');

        let match = list.match('/api/', 'http://example.com');
        assert.ok(match, 'should match /api/ with OneOrMore wildcard');
        assert.strictEqual(match?.value, 'api-oneormore');

        match = list.match('/api/something', 'http://example.com');
        assert.ok(match, 'should match /api/something with OneOrMore wildcard');
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
        assert.ok(
          directResult,
          'URLPattern should match /test*+ against /test',
        );

        // Our implementation should match URLPattern behavior
        match = list2.match('/test', 'http://example.com');
        assert.ok(
          match,
          'should match /test with OneOrMore wildcard to match URLPattern semantics',
        );
        assert.strictEqual(match?.value, 'test-oneormore');

        match = list2.match('/testcontent', 'http://example.com');
        assert.ok(match, 'should match /testcontent with OneOrMore wildcard');
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
        assert.ok(
          match,
          'should match pattern with optional parameter consuming nothing',
        );

        // Test precedence - first pattern should win
        assert.strictEqual(
          match?.value,
          'optional-param',
          'first pattern should match',
        );
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
        assert.ok(match, 'should match specific pattern');
        assert.strictEqual(match?.value, 'specific');

        // Wildcard should match other paths
        match = list.match('/api/other/path', 'http://example.com');
        assert.ok(match, 'should match wildcard pattern');
        assert.strictEqual(match?.value, 'wildcard');

        // Test edge case: wildcard at path boundary
        match = list.match('/api/', 'http://example.com');
        assert.ok(match, 'should match wildcard at path boundary');
        assert.strictEqual(match?.value, 'wildcard');
      });
    });
  }
});
