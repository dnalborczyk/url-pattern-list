import {parse, type Part, PartType, Modifier} from './lib/parse-pattern.js';

export interface URLPatternListItem<T> {
  readonly sequence: number;
  readonly pattern: URLPattern;
  readonly value: T;
}

export interface URLPatternListMatch<T> {
  result: URLPatternResult;
  value: T;
}

/**
 * Base class for prefix tree nodes. Each node type corresponds to a URL pattern
 * part type.
 *
 * @internal
 */
export abstract class PrefixTreeNode<T> {
  /**
   * Maximum sequence number for this node.
   */
  maxSequence: number = Number.MAX_SAFE_INTEGER;

  /**
   * Patterns that end at this node (for exact matches)
   */
  readonly patterns: Array<URLPatternListItem<T>> = [];

  /**
   * Child nodes stored as an array for iteration.
   */
  readonly children: Array<PrefixTreeNode<T>> = [];

  /**
   * Check if this tree node can match the given parsed pattern part.
   */
  abstract matchesPart(part: Part): boolean;

  /**
   * Match a path starting from this node, recursively checking children.
   * Returns the first successful match found.
   */
  abstract match(
    path: string,
    pathIndex: number,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null;

  /**
   * Try patterns that end at this node, then try matching children.
   * Returns the first successful match found.
   */
  protected tryPatternsAndChildren(
    path: string,
    pathIndex: number,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    let bestMatch: URLPatternListItem<T> | null = null;
    // First, try patterns that end at this node (only if we've consumed the
    // entire path)
    if (pathIndex >= path.length) {
      for (const item of this.patterns) {
        const matches = item.pattern.test(path, baseUrl);
        if (matches === true) {
          bestMatch = item;
          break;
        }
      }
    }

    // Then try each child node to see if it can match from the current position
    for (const childNode of this.children) {
      if (bestMatch !== null && childNode.maxSequence < bestMatch.sequence) {
        continue;
      }
      const newMatch = childNode.match(path, pathIndex, baseUrl);
      if (
        newMatch !== null &&
        (bestMatch === null || newMatch.sequence < bestMatch.sequence)
      ) {
        bestMatch = newMatch;
      }
    }

    return bestMatch;
  }
}

/**
 * Root node of the prefix tree.
 *
 * @internal
 */
export class RootPrefixTreeNode<T> extends PrefixTreeNode<T> {
  matchesPart(): boolean {
    return true; // Root can match anything
  }

  match(
    path: string,
    pathIndex: number,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    return this.tryPatternsAndChildren(path, pathIndex, baseUrl);
  }
}

/**
 * Node for fixed string segments like '/api' or '/users'.
 *
 * @internal
 */
export class FixedPrefixTreeNode<T> extends PrefixTreeNode<T> {
  readonly value: string;
  readonly modifier: Modifier;

  constructor(value: string, modifier: Modifier = Modifier.None) {
    super();
    this.value = value;
    this.modifier = modifier;
  }

  matchesPart(part: Part): boolean {
    return (
      part.type === PartType.Fixed &&
      part.value === this.value &&
      part.modifier === this.modifier
    );
  }

  match(
    path: string,
    pathIndex: number,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    const expectedText = this.value;

    // Handle OneOrMore and ZeroOrMore modifiers
    if (
      this.modifier === Modifier.OneOrMore ||
      this.modifier === Modifier.ZeroOrMore
    ) {
      let consumedLength = 0;
      let currentIndex = pathIndex;
      let matchCount = 0;

      // Keep matching the expectedText as many times as possible
      while (path.startsWith(expectedText, currentIndex)) {
        consumedLength += expectedText.length;
        currentIndex += expectedText.length;
        matchCount++;
      }

      // OneOrMore requires at least one match, ZeroOrMore allows zero
      const minimumMatches = this.modifier === Modifier.OneOrMore ? 1 : 0;
      if (matchCount >= minimumMatches) {
        return this.tryPatternsAndChildren(
          path,
          pathIndex + consumedLength,
          baseUrl,
        );
      }

      return null;
    }

    // Check if the expected text is present at the current position
    if (path.startsWith(expectedText, pathIndex)) {
      // Expected text is present - consume it and continue
      return this.tryPatternsAndChildren(
        path,
        pathIndex + expectedText.length,
        baseUrl,
      );
    }

    // Expected text is not present - check if this is optional
    if (this.modifier === Modifier.Optional) {
      // Optional part not present - skip it and continue
      return this.tryPatternsAndChildren(path, pathIndex, baseUrl);
    }

    // Required part not present - no match
    return null;
  }
}

/**
 * Node for wildcard segments like ':id' or ':userId'. Wildcards with different
 * names are semantically equivalent and can share nodes.
 *
 * @internal
 */
export class WildcardPrefixTreeNode<T> extends PrefixTreeNode<T> {
  readonly modifier: number;
  readonly prefix: string;
  readonly suffix: string;

  constructor(
    modifier: number = Modifier.None,
    prefix: string = '',
    suffix: string = '',
  ) {
    super();
    this.modifier = modifier;
    this.prefix = prefix;
    this.suffix = suffix;
  }

  matchesPart(part: Part): boolean {
    return (
      part.type === PartType.SegmentWildcard &&
      part.modifier === this.modifier &&
      part.prefix === this.prefix &&
      part.suffix === this.suffix
    );
  }

  match(
    path: string,
    pathIndex: number,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    // Handle ZeroOrMore modifier with children using backtracking
    if (this.modifier === Modifier.ZeroOrMore && this.children.length > 0) {
      const remaining = path.slice(pathIndex);

      // First try zero consumption (ZeroOrMore allows consuming nothing)
      const zeroMatch = this.tryPatternsAndChildren(path, pathIndex, baseUrl);
      if (zeroMatch !== null) {
        return zeroMatch;
      }

      // Then try consuming different amounts, from most to least
      // This allows children to match whatever remains
      if (remaining.length > 0 && remaining.startsWith('/')) {
        const segments = remaining.split('/').slice(1); // Remove empty first element

        // Try consuming 1, 2, 3, ... segments
        for (
          let segmentCount = 1;
          segmentCount <= segments.length;
          segmentCount++
        ) {
          let consumedLength = 1; // leading slash
          for (let i = 0; i < segmentCount; i++) {
            consumedLength += segments[i].length;
            if (i < segmentCount - 1) {
              consumedLength += 1; // slash between segments
            }
          }

          const newPathIndex = pathIndex + consumedLength;
          const match = this.tryPatternsAndChildren(
            path,
            newPathIndex,
            baseUrl,
          );
          if (match !== null) {
            return match;
          }
        }
      }

      return null;
    }

    // Handle OneOrMore modifier with children using backtracking
    if (this.modifier === Modifier.OneOrMore && this.children.length > 0) {
      const remaining = path.slice(pathIndex);

      // OneOrMore requires at least one segment, so don't try zero consumption
      // Try consuming different amounts, from 1 segment to all segments
      if (remaining.length > 0 && remaining.startsWith('/')) {
        const segments = remaining.split('/').slice(1); // Remove empty first element

        // Try consuming 1, 2, 3, ... segments
        for (
          let segmentCount = 1;
          segmentCount <= segments.length;
          segmentCount++
        ) {
          let consumedLength = 1; // leading slash
          for (let i = 0; i < segmentCount; i++) {
            consumedLength += segments[i].length;
            if (i < segmentCount - 1) {
              consumedLength += 1; // slash between segments
            }
          }

          const newPathIndex = pathIndex + consumedLength;
          const match = this.tryPatternsAndChildren(
            path,
            newPathIndex,
            baseUrl,
          );
          if (match !== null) {
            return match;
          }
        }
      }

      return null;
    }

    // Handle Modifier.None with backtracking when we have children
    if (this.modifier === Modifier.None && this.children.length > 0) {
      const remaining = path.slice(pathIndex);

      // For wildcards with prefix/suffix, we need to be more careful about backtracking
      if (this.prefix || this.suffix) {
        // For prefix-based wildcards, try character-by-character consumption
        // to allow subsequent Fixed parts to match
        if (!remaining.startsWith(this.prefix)) {
          return null;
        }

        const afterPrefix = remaining.slice(this.prefix.length);
        if (afterPrefix.length === 0) {
          return null; // Must have content after prefix
        }

        // Try different consumption amounts, from minimal to maximal
        for (
          let contentLength = 1;
          contentLength <= afterPrefix.length;
          contentLength++
        ) {
          const consumption = this.prefix.length + contentLength;
          const newPathIndex = pathIndex + consumption;
          const match = this.tryPatternsAndChildren(
            path,
            newPathIndex,
            baseUrl,
          );
          if (match !== null) {
            return match;
          }
        }

        return null;
      } else {
        // For wildcards without prefix/suffix, use character-by-character backtracking
        // This handles cases like :slug in /posts/:id-:slug-:category
        if (remaining.length === 0) {
          return null;
        }

        // Try different consumption amounts, from minimal to maximal
        for (
          let contentLength = 1;
          contentLength <= remaining.length;
          contentLength++
        ) {
          const newPathIndex = pathIndex + contentLength;
          const match = this.tryPatternsAndChildren(
            path,
            newPathIndex,
            baseUrl,
          );
          if (match !== null) {
            return match;
          }
        }

        return null;
      }
    }

    // For other cases, use the original logic
    const remaining = path.slice(pathIndex);
    let consumedChars: number;

    switch (this.modifier) {
      case Modifier.None:
        consumedChars = this.#matchSingleSegment(remaining);
        break;
      case Modifier.ZeroOrMore:
        // Already handled above if we have children
        if (this.prefix && this.prefix !== '/') {
          // Custom prefix (like '-' in group delimiters) - use prefix-based matching
          consumedChars = this.#matchWithPrefixSuffix(remaining, false);
        } else {
          // Standard '/' prefix or no prefix - use traditional multi-segment matching
          consumedChars = this.#matchMultipleSegments(remaining, false);
        }
        break;
      case Modifier.OneOrMore:
        if (this.prefix && this.prefix !== '/') {
          // Custom prefix (like '-' in group delimiters) - use prefix-based matching
          consumedChars = this.#matchOneOrMoreWithPrefix(remaining);
        } else {
          // Standard '/' prefix or no prefix - use traditional multi-segment matching
          consumedChars = this.#matchMultipleSegments(remaining, true);
        }
        break;
      case Modifier.Optional:
        consumedChars = this.#matchOptionalSegment(remaining);
        break;
      default:
        consumedChars = 0;
    }

    // For modifiers that support zero-match, try zero consumption first
    if (
      this.modifier === Modifier.ZeroOrMore ||
      this.modifier === Modifier.Optional
    ) {
      const zeroMatch = this.tryPatternsAndChildren(path, pathIndex, baseUrl);
      if (zeroMatch !== null) {
        return zeroMatch;
      }
    }

    // Try normal consumption if we matched something
    if (consumedChars > 0) {
      const newPathIndex = pathIndex + consumedChars;
      return this.tryPatternsAndChildren(path, newPathIndex, baseUrl);
    }

    // For OneOrMore, if we couldn't consume anything, we still need to check
    // if zero-consumption is valid according to URLPattern semantics
    if (this.modifier === Modifier.OneOrMore && consumedChars === 0) {
      // Try zero consumption for OneOrMore to match URLPattern behavior
      const zeroMatch = this.tryPatternsAndChildren(path, pathIndex, baseUrl);
      if (zeroMatch !== null) {
        return zeroMatch;
      }
    }

    return null;
  }

  #matchSingleSegment(remaining: string): number {
    if (this.prefix || this.suffix) {
      return this.#matchWithPrefixSuffix(remaining, true);
    }

    // Handle case where wildcard has no prefix and remaining doesn't start with /
    // This happens in direct separation cases like /post/:id-:title where
    // :title needs to match "foo" directly (not "/foo")
    if (remaining.length === 0) {
      return 0;
    }

    if (remaining.startsWith('/')) {
      // Standard case: wildcard with implicit / prefix
      const segmentContent = remaining.slice(1);
      if (segmentContent.length === 0) {
        return 0;
      }

      // When there are no children to match, consume the entire remaining content
      return 1 + segmentContent.length;
    } else {
      // Special case: wildcard with no prefix matching remaining content directly
      // This happens after Fixed parts consume their content
      return remaining.length;
    }
  }

  #matchMultipleSegments(
    remaining: string,
    requireAtLeastOne: boolean,
  ): number {
    if (remaining.length === 0 || !remaining.startsWith('/')) {
      return requireAtLeastOne ? -1 : 0; // Return -1 to indicate failure for OneOrMore
    }

    // For WildcardPrefixTreeNode with children, backtracking is handled
    // in the main match() method above. This method is only used when
    // there are no children.
    return remaining.length;
  }

  #matchOptionalSegment(remaining: string): number {
    if (this.prefix || this.suffix) {
      return this.#matchWithPrefixSuffix(remaining, false);
    }

    if (remaining.length === 0) {
      return 0;
    }

    if (remaining.startsWith('/')) {
      // Standard case: wildcard with implicit / prefix
      const segmentContent = remaining.slice(1);
      if (segmentContent.length === 0) {
        return 0;
      }

      // When there are no children to match, consume the entire remaining content
      return 1 + segmentContent.length;
    } else {
      // Special case: wildcard with no prefix matching remaining content directly
      // This happens after Fixed parts consume their content
      return remaining.length;
    }
  }

  #matchWithPrefixSuffix(remaining: string, required: boolean): number {
    // Check if remaining path starts with the prefix
    if (remaining.length > 0 && remaining.startsWith(this.prefix)) {
      const afterPrefix = remaining.slice(this.prefix.length);

      if (this.suffix) {
        // Find the suffix position
        const suffixIndex = afterPrefix.indexOf(this.suffix);
        if (suffixIndex > 0) {
          // Must have content between prefix and suffix
          // We found content between prefix and suffix
          const content = afterPrefix.slice(0, suffixIndex);
          // Validate that content doesn't contain path separators (it's a
          // single segment)
          if (!content.includes('/')) {
            // Return: prefix + content + suffix
            return this.prefix.length + content.length + this.suffix.length;
          }
        }
      } else {
        // No suffix - consume until end of current segment (up to next '/')
        let contentLength = 0;
        for (let i = 0; i < afterPrefix.length; i++) {
          if (afterPrefix[i] === '/') {
            break;
          }
          contentLength++;
        }
        if (contentLength > 0) {
          // Return: prefix + content
          return this.prefix.length + contentLength;
        }
      }
    }

    // Optional pattern - can match zero (no consumption) if not required
    return required ? 0 : 0;
  }

  #matchOneOrMoreWithPrefix(remaining: string): number {
    // For OneOrMore with prefix, we need to find all occurrences of the prefix
    // and match as much as possible
    if (!remaining.startsWith(this.prefix)) {
      return -1; // OneOrMore requires at least one match
    }

    let totalConsumed = 0;
    let currentRemaining = remaining;

    // Keep matching prefix-based segments until we can't anymore
    while (currentRemaining.startsWith(this.prefix)) {
      const afterPrefix = currentRemaining.slice(this.prefix.length);

      if (afterPrefix.length === 0) {
        // Prefix at end of string - consume it
        totalConsumed += this.prefix.length;
        break;
      }

      // Find content until next '/' (end of segment)
      let contentLength = 0;
      for (let i = 0; i < afterPrefix.length; i++) {
        const char = afterPrefix[i];
        if (char === '/') {
          break;
        }
        contentLength++;
      }

      if (contentLength > 0) {
        // Consume prefix + content
        const segmentLength = this.prefix.length + contentLength;
        totalConsumed += segmentLength;
        currentRemaining = currentRemaining.slice(segmentLength);
      } else {
        // No content after prefix, stop
        break;
      }
    }

    return totalConsumed > 0 ? totalConsumed : -1;
  }
}

/**
 * Node for full wildcard segments like '*'.
 *
 * @internal
 */
export class FullWildcardPrefixTreeNode<T> extends PrefixTreeNode<T> {
  readonly modifier: number;

  constructor(modifier: number) {
    super();
    this.modifier = modifier;
  }

  matchesPart(part: Part): boolean {
    return (
      part.type === PartType.FullWildcard && part.modifier === this.modifier
    );
  }

  match(
    path: string,
    pathIndex: number,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    // For modifiers that support zero-match, try zero consumption first
    if (
      this.modifier === Modifier.ZeroOrMore ||
      this.modifier === Modifier.Optional ||
      this.modifier === Modifier.OneOrMore
    ) {
      const zeroMatch = this.tryPatternsAndChildren(path, pathIndex, baseUrl);
      if (zeroMatch !== null) {
        return zeroMatch;
      }
    }

    // For normal consumption, we need to be smart about how much to consume
    // If we have children, we need to find the right consumption point
    if (this.children.length > 0) {
      // We have children, so we need to find all possible consumption points
      // and try matching children at each point
      const remaining = path.slice(pathIndex);

      // Try different consumption lengths, from greedy (longest) to minimal
      for (
        let consumeLength = remaining.length;
        consumeLength >= 0;
        consumeLength--
      ) {
        const newPathIndex = pathIndex + consumeLength;
        const match = this.tryPatternsAndChildren(path, newPathIndex, baseUrl);
        if (match !== null) {
          return match;
        }
      }
    } else {
      // No children, consume everything remaining (original behavior)
      if (path.length > pathIndex) {
        return this.tryPatternsAndChildren(path, path.length, baseUrl);
      }
    }

    return null;
  }
}

/**
 * Node for regex segments. These are treated as leaves since regex patterns
 * can be complex and may not be easily shareable.
 *
 * @internal
 */
export class RegexPrefixTreeNode<T> extends PrefixTreeNode<T> {
  readonly regexValue: string;

  constructor(regexValue: string) {
    super();
    this.regexValue = regexValue;
  }

  matchesPart(part: Part): boolean {
    // We don't attempt to do any complex sharing of regex patterns, so we just
    // check if the regex is exactly the same. Prefix sharing is therefore much
    // worse for regexes, and the main optimization is for fixed and wildcard
    // segments.
    return part.type === PartType.Regex && part.value === this.regexValue;
  }

  match(
    path: string,
    pathIndex: number,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    const remaining = path.slice(pathIndex);

    if (remaining.length === 0) {
      return null;
    }

    // Extract the segment to test
    let segmentToTest: string;
    let consumedChars: number;

    if (remaining.startsWith('/')) {
      // Regex with prefix "/" - extract segment after the "/"
      const segmentContent = remaining.slice(1);
      const nextSlashIndex = segmentContent.indexOf('/');
      segmentToTest =
        nextSlashIndex === -1
          ? segmentContent
          : segmentContent.slice(0, nextSlashIndex);

      if (segmentToTest.length === 0) {
        return null; // Must have content after "/"
      }

      // Test the segment against the regex
      if (this.#testRegexPattern(segmentToTest)) {
        consumedChars = 1 + segmentToTest.length; // "/" + segment length
      } else {
        return null;
      }
    } else {
      // Regex without prefix - test remaining path segment
      const nextSlashIndex = remaining.indexOf('/');
      segmentToTest =
        nextSlashIndex === -1 ? remaining : remaining.slice(0, nextSlashIndex);

      if (segmentToTest.length === 0) {
        return null;
      }

      // Test the segment against the regex
      if (this.#testRegexPattern(segmentToTest)) {
        consumedChars = segmentToTest.length;
      } else {
        return null;
      }
    }

    const newPathIndex = pathIndex + consumedChars;
    return this.tryPatternsAndChildren(path, newPathIndex, baseUrl);
  }

  /**
   * Test if a segment matches this regex pattern
   */
  #testRegexPattern(segment: string): boolean {
    try {
      // The regex value should already be a complete regex pattern
      // For alternation like 'small|large', we need to wrap in a group
      let pattern = this.regexValue;

      // If the pattern contains alternation (|) but is not wrapped in
      // parentheses, we need to wrap it to ensure the alternation is scoped
      // correctly
      if (pattern.includes('|') && !pattern.startsWith('(')) {
        pattern = `(${pattern})`;
      }

      const regex = new RegExp(`^${pattern}$`);
      return regex.test(segment);
    } catch (error: any) {
      // If regex is invalid, fall back to allowing any content
      // This ensures we don't break on malformed patterns
      return true;
    }
  }
}

/**
 * A collection of URL patterns and associated values, with methods for adding
 * patterns and matching URLs against those patterns.
 *
 * This is an optimized collection where patterns are stored in a prefix
 * tree instead of a flat list.
 *
 * This enables several optimizations:
 *
 * 1. **Shared Fixed Prefixes**: Patterns like '/api/users/:id' and
 *    '/api/posts/:id' share the '/api' node.
 *
 * 2. **Mixed-type Prefixes**: Patterns like '/users/:userId/posts/:postId' and
 *    '/users/:userId/posts/drafts' share structure even after dynamic parts.
 *    They both follow the path: Fixed('/users') → Wildcard → Fixed('/posts') →
 *    ...
 *
 * 3. **Semantic Equivalence**: Wildcards with different names (e.g., ':id' vs
 *    ':userId') are treated as equivalent for tree structure purposes, allowing
 *    better sharing.
 *
 * The implementation maintains first-match-wins semantics - patterns are tested
 * in the order they were added to the collection.
 */
export class URLPatternList<T> {
  #root: RootPrefixTreeNode<T>;
  #sequenceCounter: number = 0;

  constructor() {
    this.#root = new RootPrefixTreeNode<T>();
  }

  /**
   * Add a URL pattern to the collection.
   */
  addPattern(pattern: URLPattern, value: T) {
    const parts = parse(pattern.pathname);
    const item: URLPatternListItem<T> = {
      sequence: this.#sequenceCounter++,
      pattern,
      value,
    };
    this.#addPatternToTree(this.#root, parts, 0, item);
  }

  /**
   * Recursively add a pattern to the tree, creating nodes as needed.
   */
  #addPatternToTree(
    currentNode: PrefixTreeNode<T>,
    parts: Array<Part>,
    partIndex: number,
    item: URLPatternListItem<T>,
  ): void {
    if (item.sequence > currentNode.maxSequence) {
      currentNode.maxSequence = item.sequence;
    }

    // If we've consumed all parts, this pattern ends at this node
    if (partIndex >= parts.length) {
      currentNode.patterns.push(item);
      return;
    }

    const part = parts[partIndex];
    const childNode = this.#getOrCreateChildNode(currentNode, part);

    // Continue building the tree with the next part
    this.#addPatternToTree(childNode, parts, partIndex + 1, item);
  }

  /**
   * Get or create a child node for the given part. Returns an existing node
   * if it matches the part, or creates a new node if not found.
   */
  #getOrCreateChildNode(
    parent: PrefixTreeNode<T>,
    part: Part,
  ): PrefixTreeNode<T> {
    const existingNode = parent.children.find((child) =>
      child.matchesPart(part),
    );

    if (existingNode) {
      return existingNode;
    }

    let node: PrefixTreeNode<T>;

    switch (part.type) {
      case PartType.Fixed:
        node = new FixedPrefixTreeNode<T>(part.value, part.modifier);
        break;
      case PartType.SegmentWildcard:
        node = new WildcardPrefixTreeNode<T>(
          part.modifier,
          part.prefix,
          part.suffix,
        );
        break;
      case PartType.FullWildcard:
        node = new FullWildcardPrefixTreeNode<T>(part.modifier);
        break;
      case PartType.Regex:
        node = new RegexPrefixTreeNode<T>(part.value);
        break;
      default:
        throw new Error(`Unsupported part type: ${part.type}`);
    }

    parent.children.push(node);
    return node;
  }

  /**
   * Match a path against the URLPatterns, returning the first match found and
   * its associated value.
   *
   * TODO (justinfagnani): Consider accepting URL objects and full URL strings.
   */
  match(path: string, baseUrl?: string): URLPatternListMatch<T> | null {
    const match = this.#root.match(path, 0, baseUrl);
    if (match !== null) {
      const result = match.pattern.exec(path, baseUrl);
      if (result === null) {
        throw new Error('Pattern execution failed');
      }
      return {
        result,
        value: match.value,
      };
    }
    return null;
  }

  /**
   * @internal
   *
   * Access the prefix tree root for debugging and visualization.
   *
   * This method is not part of the public API and may change without notice.
   */
  get _treeRoot(): PrefixTreeNode<T> {
    return this.#root;
  }
}
