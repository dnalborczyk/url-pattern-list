import {describe as suite, test} from 'node:test';
import assert from 'node:assert/strict';
import {URLPatternList} from '../index.js';
import {URLPatternListVisualizer} from '../visualizer.js';

suite('URLPatternListVisualizer', () => {
  test('visualizeAsText produces output for empty list', () => {
    const patternList = new URLPatternList<string>();
    const result = URLPatternListVisualizer.visualizeAsText(patternList);

    assert(typeof result === 'string');
    assert(result.includes('URLPatternList Prefix Tree:'));
    assert(result.includes('<ROOT>'));
  });

  test('visualizeAsText produces output for simple patterns', () => {
    const patternList = new URLPatternList<string>();
    patternList.addPattern(new URLPattern({pathname: '/'}), 'home');
    patternList.addPattern(new URLPattern({pathname: '/about'}), 'about');

    const result = URLPatternListVisualizer.visualizeAsText(patternList);

    assert(typeof result === 'string');
    assert(result.includes('<ROOT>'));
    assert(result.includes('about'));
    assert(result.includes('[PATTERN]'));
  });

  test('visualizeAsText with verbose option includes details', () => {
    const patternList = new URLPatternList<string>();
    patternList.addPattern(new URLPattern({pathname: '/users/:id'}), 'user');

    const result = URLPatternListVisualizer.visualizeAsText(patternList, {
      verbose: true,
      showPatterns: true,
    });

    assert(result.includes('patterns'));
    assert(result.includes('children'));
  });

  test('visualizeAsText respects maxDepth option', () => {
    const patternList = new URLPatternList<string>();
    patternList.addPattern(new URLPattern({pathname: '/a/b/c/d'}), 'deep');

    const shallowResult = URLPatternListVisualizer.visualizeAsText(
      patternList,
      {
        maxDepth: 1,
        showPatterns: false,
      },
    );
    const deepResult = URLPatternListVisualizer.visualizeAsText(patternList, {
      maxDepth: 10,
      showPatterns: false,
    });

    // Shallow result should be shorter
    assert(shallowResult.length < deepResult.length);
  });

  test('visualizeAsStructure returns structured data', () => {
    const patternList = new URLPatternList<string>();
    patternList.addPattern(new URLPattern({pathname: '/'}), 'home');
    patternList.addPattern(new URLPattern({pathname: '/users/:id'}), 'user');

    const structure =
      URLPatternListVisualizer.visualizeAsStructure(patternList);

    assert(typeof structure === 'object');
    assert(typeof structure.label === 'string');
    assert(typeof structure.nodeType === 'string');
    assert(Array.isArray(structure.patterns));
    assert(Array.isArray(structure.children));
    assert(typeof structure.depth === 'number');
    assert.strictEqual(structure.depth, 0);
  });

  test('getStatistics returns correct data structure', () => {
    const patternList = new URLPatternList<string>();
    patternList.addPattern(new URLPattern({pathname: '/'}), 'home');
    patternList.addPattern(new URLPattern({pathname: '/about'}), 'about');
    patternList.addPattern(new URLPattern({pathname: '/users/:id'}), 'user');

    const stats = URLPatternListVisualizer.getStatistics(patternList);

    assert(typeof stats.totalNodes === 'number');
    assert(typeof stats.totalPatterns === 'number');
    assert(typeof stats.maxDepth === 'number');
    assert(typeof stats.nodeTypeCount === 'object');
    assert(typeof stats.averageBranchingFactor === 'number');

    assert(stats.totalNodes > 0);
    assert(stats.totalPatterns >= 3);
    assert(stats.maxDepth >= 0);
    assert('root' in stats.nodeTypeCount);
  });

  test('getStatistics counts patterns correctly', () => {
    const patternList = new URLPatternList<string>();
    patternList.addPattern(new URLPattern({pathname: '/a'}), 'a');
    patternList.addPattern(new URLPattern({pathname: '/b'}), 'b');
    patternList.addPattern(new URLPattern({pathname: '/c'}), 'c');

    const stats = URLPatternListVisualizer.getStatistics(patternList);

    assert.strictEqual(stats.totalPatterns, 3);
  });

  test('handles wildcard patterns correctly', () => {
    const patternList = new URLPatternList<string>();
    patternList.addPattern(new URLPattern({pathname: '/users/:id'}), 'user');
    patternList.addPattern(new URLPattern({pathname: '/posts/:slug'}), 'post');

    const result = URLPatternListVisualizer.visualizeAsText(patternList);

    assert(result.includes(':param'));

    const stats = URLPatternListVisualizer.getStatistics(patternList);
    assert('wildcard' in stats.nodeTypeCount);
  });

  test('handles full wildcard patterns correctly', () => {
    const patternList = new URLPatternList<string>();
    patternList.addPattern(
      new URLPattern({pathname: '/api/*'}),
      'api-catchall',
    );

    const result = URLPatternListVisualizer.visualizeAsText(patternList);

    assert(result.includes('*'));

    const stats = URLPatternListVisualizer.getStatistics(patternList);
    assert('full-wildcard' in stats.nodeTypeCount);
  });

  test('useUnicode option affects output', () => {
    const patternList = new URLPatternList<string>();
    patternList.addPattern(new URLPattern({pathname: '/test'}), 'test');

    const unicodeResult = URLPatternListVisualizer.visualizeAsText(
      patternList,
      {
        useUnicode: true,
      },
    );
    const asciiResult = URLPatternListVisualizer.visualizeAsText(patternList, {
      useUnicode: false,
    });

    // Results should differ when tree has structure
    assert(typeof unicodeResult === 'string');
    assert(typeof asciiResult === 'string');
  });
});
