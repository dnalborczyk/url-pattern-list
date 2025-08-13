import {describe as suite, test} from 'node:test';
import * as assert from 'node:assert';
import {
  parse,
  parseFullURL,
  PartType,
  Modifier,
  URLComponentType,
} from '../../lib/parse-pattern.js';

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
        urlComponentType: URLComponentType.Pathname,
      });
      assert.deepStrictEqual(result[1], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/bar',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
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
        urlComponentType: URLComponentType.Pathname,
      });

      // Second part: named parameter ":id"
      assert.deepStrictEqual(result[1], {
        type: PartType.SegmentWildcard,
        name: 'id',
        prefix: '/',
        value: '',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'userId',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/posts',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'postId',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.FullWildcard,
          name: 0,
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'path',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.ZeroOrMore,
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.Regex,
          name: 'id',
          prefix: '/',
          value: '\\d+',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'id',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.Optional,
          urlComponentType: URLComponentType.Pathname,
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
        urlComponentType: URLComponentType.Pathname,
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
        urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'id',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'id',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.Optional,
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/v1',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'dir',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'id',
          prefix: '/',
          value: '',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/v1',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/users',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
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
          urlComponentType: URLComponentType.Pathname,
        },
        {
          type: PartType.SegmentWildcard,
          name: 'format',
          prefix: '.',
          value: '',
          suffix: '',
          modifier: Modifier.None,
          urlComponentType: URLComponentType.Pathname,
        },
      ]);
    });
  });

  suite('parseFullURL()', () => {
    test('parses a pathname-only pattern', () => {
      const pattern = new URLPattern({ pathname: '/users/:id' });
      const result = parseFullURL(pattern);
      
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result[0], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/users',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
      assert.deepStrictEqual(result[1], {
        type: PartType.SegmentWildcard,
        name: 'id',
        prefix: '/',
        value: '',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
    });

    test('parses a pattern with protocol and hostname', () => {
      const pattern = new URLPattern({
        protocol: 'https',
        hostname: 'api.example.com',
        pathname: '/v1/users/:id'
      });
      const result = parseFullURL(pattern);
      
      assert.strictEqual(result.length, 5);
      
      // Protocol part
      assert.deepStrictEqual(result[0], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: 'https',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Protocol,
      });
      
      // Hostname part
      assert.deepStrictEqual(result[1], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: 'api.example.com',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Hostname,
      });
      
      // Pathname parts (split by parser)
      assert.deepStrictEqual(result[2], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/v1',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
      assert.deepStrictEqual(result[3], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/users',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
      assert.deepStrictEqual(result[4], {
        type: PartType.SegmentWildcard,
        name: 'id',
        prefix: '/',
        value: '',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
    });

    test('parses a pattern with hostname parameters', () => {
      const pattern = new URLPattern({
        hostname: ':subdomain.example.com',
        pathname: '/api/data'
      });
      const result = parseFullURL(pattern);
      
      assert.strictEqual(result.length, 4);
      
      // Hostname parts (split by parser)
      assert.deepStrictEqual(result[0], {
        type: PartType.SegmentWildcard,
        name: 'subdomain',
        prefix: '',
        value: '',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Hostname,
      });
      assert.deepStrictEqual(result[1], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '.example.com',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Hostname,
      });
      
      // Pathname parts (split by parser)
      assert.deepStrictEqual(result[2], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/api',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
      assert.deepStrictEqual(result[3], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/data',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
    });

    test('parses a pattern with search parameters', () => {
      const pattern = new URLPattern({
        pathname: '/search',
        search: 'q=:query&type=:type'
      });
      const result = parseFullURL(pattern);
      
      assert.strictEqual(result.length, 5);
      
      // Pathname
      assert.deepStrictEqual(result[0], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/search',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
      
      // Search parameters (split by parser)
      assert.deepStrictEqual(result[1], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: 'q=',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Search,
      });
      assert.deepStrictEqual(result[2], {
        type: PartType.SegmentWildcard,
        name: 'query',
        prefix: '',
        value: '',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Search,
      });
      assert.deepStrictEqual(result[3], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '&type=',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Search,
      });
      assert.deepStrictEqual(result[4], {
        type: PartType.SegmentWildcard,
        name: 'type',
        prefix: '',
        value: '',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Search,
      });
    });

    test('parses a pattern with port', () => {
      const pattern = new URLPattern({
        hostname: 'localhost',
        port: ':port',
        pathname: '/api'
      });
      const result = parseFullURL(pattern);
      
      assert.strictEqual(result.length, 3);
      
      // Hostname
      assert.deepStrictEqual(result[0], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: 'localhost',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Hostname,
      });
      
      // Port parameter
      assert.deepStrictEqual(result[1], {
        type: PartType.SegmentWildcard,
        name: 'port',
        prefix: '',
        value: '',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Port,
      });
      
      // Pathname
      assert.deepStrictEqual(result[2], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/api',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
    });

    test('parses a pattern with username and password', () => {
      const pattern = new URLPattern({
        username: ':user',
        password: ':pass',
        hostname: 'example.com',
        pathname: '/secure'
      });
      const result = parseFullURL(pattern);
      
      assert.strictEqual(result.length, 4);
      
      // Username
      assert.deepStrictEqual(result[0], {
        type: PartType.SegmentWildcard,
        name: 'user',
        prefix: '',
        value: '',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Username,
      });
      
      // Password
      assert.deepStrictEqual(result[1], {
        type: PartType.SegmentWildcard,
        name: 'pass',
        prefix: '',
        value: '',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Password,
      });
      
      // Hostname
      assert.deepStrictEqual(result[2], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: 'example.com',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Hostname,
      });
      
      // Pathname
      assert.deepStrictEqual(result[3], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/secure',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
    });

    test('parses a pattern with hash', () => {
      const pattern = new URLPattern({
        pathname: '/page',
        hash: 'section-:id'
      });
      const result = parseFullURL(pattern);
      
      assert.strictEqual(result.length, 3);
      
      // Pathname
      assert.deepStrictEqual(result[0], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/page',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Pathname,
      });
      
      // Hash parts (split by parser)
      assert.deepStrictEqual(result[1], {
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: 'section-',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Hash,
      });
      assert.deepStrictEqual(result[2], {
        type: PartType.SegmentWildcard,
        name: 'id',
        prefix: '',
        value: '',
        suffix: '',
        modifier: Modifier.None,
        urlComponentType: URLComponentType.Hash,
      });
    });

    test('skips wildcard components', () => {
      const pattern = new URLPattern({
        protocol: '*',  // Should be skipped
        hostname: 'api.example.com',
        port: '*',      // Should be skipped
        pathname: '/v1/users/:id',
        search: '*',    // Should be skipped
        hash: '*'       // Should be skipped
      });
      const result = parseFullURL(pattern);
      
      assert.strictEqual(result.length, 4);
      
      // Only hostname and pathname parts should be present
      assert.strictEqual(result[0].urlComponentType, URLComponentType.Hostname);
      assert.strictEqual(result[1].urlComponentType, URLComponentType.Pathname);
      assert.strictEqual(result[2].urlComponentType, URLComponentType.Pathname);
      assert.strictEqual(result[3].urlComponentType, URLComponentType.Pathname);
    });

    test('parses complex pattern with all components', () => {
      const pattern = new URLPattern({
        protocol: 'https',
        username: 'admin',
        password: ':pass',
        hostname: ':env.api.example.com',
        port: '8080',
        pathname: '/v:version/users/:id',
        search: 'format=:format&limit=:limit?',
        hash: 'section-:section'
      });
      const result = parseFullURL(pattern);
      
      // Should have parts for all non-wildcard components
      assert.ok(result.length > 5);
      
      // Verify we have parts for each URL component type
      const partTypes = result.map(p => p.urlComponentType);
      assert.ok(partTypes.includes(URLComponentType.Protocol));
      assert.ok(partTypes.includes(URLComponentType.Username));
      assert.ok(partTypes.includes(URLComponentType.Password));
      assert.ok(partTypes.includes(URLComponentType.Hostname));
      assert.ok(partTypes.includes(URLComponentType.Port));
      assert.ok(partTypes.includes(URLComponentType.Pathname));
      assert.ok(partTypes.includes(URLComponentType.Search));
      assert.ok(partTypes.includes(URLComponentType.Hash));
    });

    test('handles empty pathname pattern', () => {
      const pattern = new URLPattern({
        protocol: 'https',
        hostname: 'example.com',
        pathname: ''
      });
      const result = parseFullURL(pattern);
      
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].urlComponentType, URLComponentType.Protocol);
      assert.strictEqual(result[1].urlComponentType, URLComponentType.Hostname);
      // Empty pathname should not create any parts
    });
  });
});
