/**
 * Naive URLPatternList implementation for testing.
 *
 * This is a simple, linear-search implementation of URLPatternList that serves
 * as a reference implementation for testing the optimized version. It provides
 * the same interface but uses a straightforward O(n) linear search approach
 * instead of the optimized prefix tree structure.
 *
 * This implementation is used in tests to verify that the optimized
 * URLPatternList produces identical results while providing better performance.
 */
import type {URLPatternListItem, URLPatternListMatch} from '../index.js';

/**
 * A naive implementation of URLPatternList that uses linear search.
 * This serves as a reference implementation to test against the optimized version.
 */
export class NaiveURLPatternList<T> {
  #patterns: URLPatternListItem<T>[] = [];

  /**
   * Add a URL pattern to the collection.
   */
  addPattern(pattern: URLPattern, value: T): void {
    this.#patterns.push({sequence: 0, pattern, value});
  }

  /**
   * Match a path against the patterns using linear search.
   * Returns the first pattern that matches (preserving order).
   */
  match(path: string, baseUrl?: string): URLPatternListMatch<T> | null {
    for (const item of this.#patterns) {
      if (item.pattern.test(path, baseUrl)) {
        const result = item.pattern.exec(path, baseUrl);
        if (result !== null) {
          return {result, value: item.value};
        }
      }
    }
    return null;
  }
}
