import {parse, PartType, Modifier} from './lib/parse-pattern.js';

export interface URLPatternListItem<T> {
  pattern: URLPattern;
  value: T;
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
   * Patterns that end at this node (for exact matches)
   */
  readonly patterns: URLPatternListItem<T>[] = [];

  /**
   * Child nodes stored as an array for iteration.
   */
  readonly children: PrefixTreeNode<T>[] = [];

  /**
   * Check if this node can match the given part type and modifiers.
   */
  abstract canMatch(part: ReturnType<typeof parse>[0]): boolean;

  /**
   * Try to match this node at the given position in the path.
   * Returns the number of characters consumed, or 0 if no match.
   */
  abstract tryMatchAtPosition(path: string, pathIndex: number): number;
}

/**
 * Root node of the prefix tree.
 *
 * @internal
 */
export class RootPrefixTreeNode<T> extends PrefixTreeNode<T> {
  canMatch(): boolean {
    return true; // Root can match anything
  }

  tryMatchAtPosition(): number {
    return 0; // Root consumes no characters
  }
}

/**
 * Node for fixed string segments like '/api' or '/users'.
 *
 * @internal
 */
export class FixedPrefixTreeNode<T> extends PrefixTreeNode<T> {
  readonly value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }

  canMatch(part: ReturnType<typeof parse>[0]): boolean {
    return part.type === PartType.Fixed && part.value === this.value;
  }

  tryMatchAtPosition(path: string, pathIndex: number): number {
    if (path.slice(pathIndex).startsWith(this.value)) {
      return this.value.length;
    }
    return 0;
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

  canMatch(part: ReturnType<typeof parse>[0]): boolean {
    return (
      part.type === PartType.SegmentWildcard &&
      part.modifier === this.modifier &&
      part.prefix === this.prefix &&
      part.suffix === this.suffix
    );
  }

  tryMatchAtPosition(path: string, pathIndex: number): number {
    const remaining = path.slice(pathIndex);

    switch (this.modifier) {
      case Modifier.None:
        return this.#matchSingleSegment(remaining);
      case Modifier.ZeroOrMore:
        return this.#matchMultipleSegments(remaining, false);
      case Modifier.OneOrMore:
        return this.#matchMultipleSegments(remaining, true);
      case Modifier.Optional:
        return this.#matchOptionalSegment(remaining);
      default:
        return 0;
    }
  }

  #matchSingleSegment(remaining: string): number {
    if (this.prefix || this.suffix) {
      return this.#matchWithPrefixSuffix(remaining, true);
    }

    if (remaining.length === 0 || !remaining.startsWith('/')) {
      return 0;
    }

    const segmentContent = remaining.slice(1);
    if (segmentContent.length === 0) {
      return 0;
    }

    let segmentLength = segmentContent.length;
    const delimiters = ['/', '.', '?', '#', '&'];
    for (const delimiter of delimiters) {
      const delimiterIndex = segmentContent.indexOf(delimiter);
      if (delimiterIndex !== -1 && delimiterIndex < segmentLength) {
        segmentLength = delimiterIndex;
      }
    }

    return segmentLength > 0 ? 1 + segmentLength : 0;
  }

  #matchMultipleSegments(
    remaining: string,
    requireAtLeastOne: boolean,
  ): number {
    if (remaining.length === 0 || !remaining.startsWith('/')) {
      return 0;
    }

    if (!requireAtLeastOne && false) {
      return 0;
    }

    return remaining.length;
  }

  #matchOptionalSegment(remaining: string): number {
    if (this.prefix || this.suffix) {
      return this.#matchWithPrefixSuffix(remaining, false);
    }

    if (remaining.length === 0 || !remaining.startsWith('/')) {
      return 0;
    }

    const segmentContent = remaining.slice(1);
    const nextSlashIndex = segmentContent.indexOf('/');
    const segmentLength =
      nextSlashIndex === -1 ? segmentContent.length : nextSlashIndex;

    return segmentLength > 0 ? 1 + segmentLength : 0;
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
        // No suffix - consume until next delimiter or end of path
        let contentLength = 0;
        const delimiters = ['/', '.', '?', '#', '&'];

        for (let i = 0; i < afterPrefix.length; i++) {
          if (delimiters.includes(afterPrefix[i])) {
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
}

/**
 * Node for full wildcard segments like '*'.
 *
 * @internal
 */
export class FullWildcardPrefixTreeNode<T> extends PrefixTreeNode<T> {
  readonly modifier: number;

  constructor(modifier: number = Modifier.None) {
    super();
    this.modifier = modifier;
  }

  canMatch(part: ReturnType<typeof parse>[0]): boolean {
    return (
      part.type === PartType.FullWildcard && part.modifier === this.modifier
    );
  }

  tryMatchAtPosition(path: string, pathIndex: number): number {
    const remaining = path.length - pathIndex;
    // Always return remaining characters to match URLPattern semantics exactly.
    // URLPattern handles all modifier validation, so we defer to pattern.exec().
    return remaining;
  }
}

/**
 * Node for regex segments. These are treated as leaves since regex patterns
 * can be complex and may not be easily shareable.
 *
 * @internal
 */
export class RegexPrefixTreeNode<T> extends PrefixTreeNode<T> {
  constructor(readonly regexValue: string) {
    super();
  }

  canMatch(part: ReturnType<typeof parse>[0]): boolean {
    return part.type === PartType.Regex && part.value === this.regexValue;
  }

  tryMatchAtPosition(path: string, pathIndex: number): number {
    const remaining = path.slice(pathIndex);

    if (remaining.length === 0) {
      return 0;
    }

    // Extract the segment to test
    let segmentToTest: string;
    if (remaining.startsWith('/')) {
      // Regex with prefix "/" - extract segment after the "/"
      const segmentContent = remaining.slice(1);
      const nextSlashIndex = segmentContent.indexOf('/');
      segmentToTest =
        nextSlashIndex === -1
          ? segmentContent
          : segmentContent.slice(0, nextSlashIndex);

      if (segmentToTest.length === 0) {
        return 0; // Must have content after "/"
      }

      // Test the segment against the regex
      if (this.#testRegexPattern(segmentToTest)) {
        return 1 + segmentToTest.length; // "/" + segment length
      }
    } else {
      // Regex without prefix - test remaining path segment
      const nextSlashIndex = remaining.indexOf('/');
      segmentToTest =
        nextSlashIndex === -1 ? remaining : remaining.slice(0, nextSlashIndex);

      if (segmentToTest.length === 0) {
        return 0;
      }

      // Test the segment against the regex
      if (this.#testRegexPattern(segmentToTest)) {
        return segmentToTest.length;
      }
    }

    return 0; // Regex didn't match
  }

  /**
   * Test if a segment matches this regex pattern
   */
  #testRegexPattern(segment: string): boolean {
    try {
      // The regex value should already be a complete regex pattern
      // For alternation like 'small|large', we need to wrap in a group
      let pattern = this.regexValue;

      // If the pattern contains alternation (|) but is not wrapped in parentheses,
      // we need to wrap it to ensure the alternation is scoped correctly
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

  constructor() {
    this.#root = new RootPrefixTreeNode<T>();
  }

  /**
   * Add a URL pattern to the collection.
   */
  addPattern(pattern: URLPattern, value: T) {
    const parts = parse(pattern.pathname);
    const item: URLPatternListItem<T> = {pattern, value};
    this.#addPatternToTree(this.#root, parts, 0, item);
  }

  /**
   * Recursively add a pattern to the tree, creating nodes as needed.
   */
  #addPatternToTree(
    currentNode: PrefixTreeNode<T>,
    parts: ReturnType<typeof parse>,
    partIndex: number,
    item: URLPatternListItem<T>,
  ): void {
    // If we've consumed all parts, this pattern ends at this node
    if (partIndex >= parts.length) {
      currentNode.patterns.push(item);
      return;
    }

    const part = parts[partIndex];

    // Special handling for ZeroOrMore (*), Optional (?), and OneOrMore (*+) modifiers
    // These patterns can match here (consuming zero instances) OR continue matching
    if (
      part.modifier === Modifier.ZeroOrMore ||
      part.modifier === Modifier.Optional ||
      part.modifier === Modifier.OneOrMore
    ) {
      // For zero-match case, skip this part and add the remaining pattern from the next part
      this.#addPatternToTree(currentNode, parts, partIndex + 1, item);
    }

    const childNode = this.#getOrCreateChildNode(currentNode, part);

    // Continue building the tree with the next part
    this.#addPatternToTree(childNode, parts, partIndex + 1, item);
  }

  /**
   * Get or create a child node for the given part.
   */
  #getOrCreateChildNode(
    parent: PrefixTreeNode<T>,
    part: ReturnType<typeof parse>[0],
  ): PrefixTreeNode<T> {
    // Look for existing compatible node
    const existingNode = parent.children.find((child) => child.canMatch(part));

    if (existingNode) {
      return existingNode;
    }

    let node: PrefixTreeNode<T>;

    switch (part.type) {
      case PartType.Fixed:
        node = new FixedPrefixTreeNode<T>(part.value);
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
    return this.#matchInTreeWithPath(path, 0, baseUrl, this.#root);
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

  /**
   * Recursively match path through the prefix tree.
   */
  #matchInTreeWithPath(
    path: string,
    pathIndex: number,
    baseUrl: string | undefined,
    node: PrefixTreeNode<T>,
  ): URLPatternListMatch<T> | null {
    // If we've consumed the entire path, try patterns that end at this node
    if (pathIndex >= path.length) {
      for (const item of node.patterns) {
        const result = item.pattern.exec(path, baseUrl);
        if (result !== null) {
          return {result, value: item.value};
        }
      }
      return null;
    }

    // Try each child node to see if it can match from the current position
    for (const childNode of node.children) {
      const consumedChars = childNode.tryMatchAtPosition(path, pathIndex);
      const match = this.#matchInTreeWithPath(
        path,
        pathIndex + consumedChars,
        baseUrl,
        childNode,
      );
      if (match) {
        return match;
      }
    }

    return null;
  }
}
