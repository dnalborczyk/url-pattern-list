import {describe as suite, test} from 'node:test';
import * as assert from 'node:assert';
import {parse, PartType, Modifier} from '../../lib/parse-pattern.js';

suite('parse-pattern', () => {
  suite('parse()', () => {
    test('parses a simple fixed path', () => {
      const result = parse('/foo/bar');
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result[0], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/foo',
        suffix: '',
        modifier: Modifier.None,
      });
      assert.deepStrictEqual(result[1], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/bar',
        suffix: '',
        modifier: Modifier.None,
      });
    });

    test('parses a path with a named parameter', () => {
      const result = parse('/users/:id');
      assert.strictEqual(result.length, 2);

      // First part: fixed "/users"
      assert.deepStrictEqual(result[0], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/users',
        suffix: '',
        modifier: Modifier.None,
      });

      // Second part: named parameter ":id"
      assert.deepStrictEqual(result[1], {
        type: PartType.SegmentWildcard,
        name: 'id',
        prefix: '/',
        value: '',
        suffix: '',
        modifier: Modifier.None,
      });
    });

    test('parses a path with multiple named parameters', () => {
      const result = parse('/users/:userId/posts/:postId');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/users',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'userId',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/posts',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'postId',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('parses a path with wildcard', () => {
      const result = parse('/files/*');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/files',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.FullWildcard,
          name: 0,
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('parses a path with named wildcard', () => {
      const result = parse('/files/:path*');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/files',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'path',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.ZeroOrMore,
        },
      ]);
    });

    test('parses a path with regex pattern', () => {
      const result = parse('/users/:id(\\d+)');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/users',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.Regex,
          name: 'id',
          prefix: '/',
          value: '\\d+',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('parses a path with optional parameter', () => {
      const result = parse('/users/:id?');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/users',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'id',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.Optional,
        },
      ]);
    });

    test('parses a path with zero-or-more modifier', () => {
      const result = parse('/files/:path*');
      // This should be the same as the named wildcard test
      assert.deepStrictEqual(result[1], {
        type: PartType.SegmentWildcard,
        name: 'path',
        prefix: '/',
        value: '',
        suffix: '',
        modifier: Modifier.ZeroOrMore,
      });
    });

    test('parses a path with one-or-more modifier', () => {
      const result = parse('/files/:path+');
      assert.deepStrictEqual(result[1], {
        type: PartType.SegmentWildcard,
        name: 'path',
        prefix: '/',
        value: '',
        suffix: '',
        modifier: Modifier.OneOrMore,
      });
    });

    test('parses a path with braced groups', () => {
      const result = parse('/users{/:id}');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/users',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'id',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('parses a path with optional braced groups', () => {
      const result = parse('/users{/:id}?');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/users',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'id',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.Optional,
        },
      ]);
    });

    test('parses a path with braced group containing fixed text', () => {
      const result = parse('/api{/v1}');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/api',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/v1',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('parses a path with braced group and parameters', () => {
      const result = parse('/files{/:dir}');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/files',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'dir',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('parses a path with escaped characters', () => {
      const result = parse('/files\\/:id');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/files',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'id',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('parses empty path', () => {
      const result = parse('');
      assert.strictEqual(result.length, 0);
    });

    test('parses root path', () => {
      const result = parse('/');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('parses path with only parameter', () => {
      const result = parse(':id');
      assert.deepStrictEqual(result, [
        {
          type: PartType.SegmentWildcard,
          name: 'id',
          prefix: '',
          value: '',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('parses path with anonymous regex', () => {
      const result = parse('/(\\d+)');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Regex,
          name: 0,
          prefix: '/',
          value: '\\d+',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('throws error for duplicate parameter names', () => {
      assert.throws(
        () => {
          parse('/users/:id/posts/:id');
        },
        {
          name: 'TypeError',
          message: "Duplicate name 'id'.",
        },
      );
    });

    test('throws error for missing parameter name', () => {
      assert.throws(
        () => {
          parse('/users/:/posts');
        },
        {
          name: 'TypeError',
          message: 'Missing parameter name at 7',
        },
      );
    });

    test('throws error for unbalanced parentheses', () => {
      assert.throws(
        () => {
          parse('/users/:id(\\d+');
        },
        {
          name: 'TypeError',
          message: 'Unbalanced pattern at 10',
        },
      );
    });

    test('throws error for empty regex pattern', () => {
      assert.throws(
        () => {
          parse('/users/:id()');
        },
        {
          name: 'TypeError',
          message: 'Missing pattern at 10',
        },
      );
    });

    test('throws error for regex starting with ?', () => {
      assert.throws(
        () => {
          parse('/users/:id(?:foo)');
        },
        {
          name: 'TypeError',
          message: 'Pattern cannot start with "?" at 11',
        },
      );
    });

    test('throws error for capturing groups', () => {
      assert.throws(
        () => {
          parse('/users/:id(foo(bar))');
        },
        {
          name: 'TypeError',
          message: 'Capturing groups are not allowed at 14',
        },
      );
    });

    test('throws error for non-ASCII characters in regex', () => {
      assert.throws(
        () => {
          parse('/users/:id(föö)');
        },
        {
          name: 'TypeError',
          message: "Invalid character 'ö' at 12.",
        },
      );
    });

    test('parses complex real-world patterns', () => {
      // API versioning pattern - simple version
      const apiResult = parse('/api/:version/:resource/:id?');
      assert.ok(apiResult.length > 0);

      // File serving pattern
      const fileResult = parse('/static/:path*');
      assert.ok(fileResult.length > 0);

      // User profile pattern with optional sections
      const profileResult = parse('/users/:userId{/profile}?');
      assert.ok(profileResult.length > 0);
    });

    test('handles consecutive fixed text correctly', () => {
      const result = parse('/api/v1/users');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/api',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/v1',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/users',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });

    test('handles mixed prefixes correctly', () => {
      const result = parse('/users.:format');
      assert.deepStrictEqual(result, [
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/users',
          suffix: '',
          modifier: Modifier.None,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'format',
          prefix: '.',
          value: '',
          suffix: '',
          modifier: Modifier.None,
        },
      ]);
    });
  });
});
