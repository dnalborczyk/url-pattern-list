import {
  parseFullURL,
  type Part,
  PartType,
  Modifier,
  URLComponentType,
} from './lib/parse-pattern.js';

/**
 * The internal storage for a URL pattern and its metadata.
 *
 * @internal
 */
export interface URLPatternListItem<T> {
  readonly sequence: number;
  readonly pattern: URLPattern;
  readonly value: T;
}

/**
 * The return type of `URLPatternList.match()`.
 *
 * Includes the result of `pattern.exec()` and the matching pattern's associated
 * metadata value.
 */
export interface URLPatternListMatch<T> {
  result: URLPatternResult;
  value: T;
}

/**
 * Data structure used in matching.
 */
interface URLComponent {
  value: string;
  type: URLComponentType;
}

/**
 * Base class for prefix tree nodes. Each node type corresponds to a URL pattern
 * part type.
 *
 * @internal
 */
export abstract class PrefixTreeNode<T> {
  readonly urlComponentType: URLComponentType;
  /**
   * Minimum sequence number for this node - represents the earliest pattern
   * that can be matched through this node.
   */
  minSequence: number = Number.MAX_SAFE_INTEGER;

  /**
   * Patterns that end at this node (for exact matches)
   */
  readonly patterns: Array<URLPatternListItem<T>> = [];

  /**
   * Child nodes stored as an array for iteration.
   */
  readonly children: Array<PrefixTreeNode<T>> = [];

  constructor(urlComponentType: URLComponentType) {
    this.urlComponentType = urlComponentType;
  }

  /**
   * Check if this tree node can match the given parsed pattern part.
   */
  abstract matchesPart(part: Part): boolean;

  /**
   * Match a URL starting from this node, recursively checking children.
   * Returns the first successful match found.
   *
   * @param urlComponents - The URL components to match against.
   * @param componentIndex - The index of the current URL component.
   * @param position - The character position within the current URL component.
   */
  abstract match(
    urlComponents: Array<URLComponent>,
    componentIndex: number,
    position: number,
    fullUrl: string,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null;

  /**
   * Try patterns that end at this node, then try matching children.
   * Returns the first successful match found.
   */
  protected tryPatternsAndChildren(
    urlComponents: Array<URLComponent>,
    componentIndex: number,
    position: number,
    fullUrl: string,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    const {value, type} = urlComponents[componentIndex];

    let bestMatch: URLPatternListItem<T> | null = null;
    let advancedComponentIndex = componentIndex;
    let advancedPosition = position;

    // If we've consumed the current URL component, advance to the next
    if (position >= value.length) {
      // TODO: I think there's a bug here.
      // Only advance componentIndex if there are no children that match the same URL component type
      const hasChildrenWithSameComponent = this.children.some(
        (child) => child.urlComponentType === type,
      );

      if (!hasChildrenWithSameComponent) {
        advancedComponentIndex = componentIndex + 1;
        advancedPosition = 0;
      } else {
        // Keep the same component but reset position for children to try matching from the start
        advancedPosition = position;
      }
    }

    for (const childNode of this.children) {
      if (bestMatch !== null && childNode.minSequence > bestMatch.sequence) {
        continue;
      }
      // Advance to the next URL component that this subtree might match on
      let newComponentIndex = advancedComponentIndex;
      let newPosition = advancedPosition;
      while (
        newComponentIndex < urlComponents.length &&
        urlComponents[newComponentIndex].type < childNode.urlComponentType
      ) {
        newComponentIndex++;
        newPosition = 0;
      }
      if (
        newComponentIndex === urlComponents.length ||
        urlComponents[newComponentIndex].type > childNode.urlComponentType
      ) {
        continue;
      }
      const newMatch = childNode.match(
        urlComponents,
        newComponentIndex,
        newPosition,
        fullUrl,
        baseUrl,
      );
      if (
        newMatch !== null &&
        (bestMatch === null || newMatch.sequence < bestMatch.sequence)
      ) {
        bestMatch = newMatch;
      }
    }

    // Then try patterns at this node if we've consumed the current URL component
    // Only do this if we're at the last component OR if children didn't find a better match
    if (position >= value.length) {
      const isLastComponent = advancedComponentIndex >= urlComponents.length;

      if (isLastComponent || bestMatch === null) {
        for (const item of this.patterns) {
          // Skip this pattern if we already have a better match
          if (bestMatch !== null && item.sequence > bestMatch.sequence) {
            continue;
          }

          // Test the pattern against the full URL
          const matches = baseUrl
            ? item.pattern.test(fullUrl, baseUrl)
            : item.pattern.test(fullUrl);

          if (matches === true) {
            if (bestMatch === null || item.sequence < bestMatch.sequence) {
              bestMatch = item;
            }
          }
        }
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
  constructor() {
    // It doesn't matter what actual component type we use since the root node
    // always matches.
    super(URLComponentType.Pathname);
  }

  matchesPart(): boolean {
    // Root can match anything
    return true;
  }

  match(
    urlParts: Array<URLComponent>,
    componentIndex: number,
    position: number,
    fullUrl: string,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    return this.tryPatternsAndChildren(
      urlParts,
      componentIndex,
      position,
      fullUrl,
      baseUrl,
    );
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

  constructor(
    urlComponentType: URLComponentType,
    value: string,
    modifier: Modifier = Modifier.None,
  ) {
    super(urlComponentType);
    this.value = value;
    this.modifier = modifier;
  }

  matchesPart(part: Part): boolean {
    return (
      part.type === PartType.Fixed &&
      part.urlComponentType === this.urlComponentType &&
      part.value === this.value &&
      part.modifier === this.modifier
    );
  }

  match(
    urlComponents: Array<URLComponent>,
    componentIndex: number,
    position: number,
    fullUrl: string,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    const {value, type} = urlComponents[componentIndex];
    if (type !== this.urlComponentType) {
      return null;
    }

    const expectedText = this.value;

    // Handle OneOrMore and ZeroOrMore modifiers
    if (
      this.modifier === Modifier.OneOrMore ||
      this.modifier === Modifier.ZeroOrMore
    ) {
      let consumedLength = 0;
      let currentIndex = position;
      let matchCount = 0;

      // Keep matching the expectedText as many times as possible
      while (value.startsWith(expectedText, currentIndex)) {
        consumedLength += expectedText.length;
        currentIndex += expectedText.length;
        matchCount++;
      }

      // OneOrMore requires at least one match, ZeroOrMore allows zero
      const minimumMatches = this.modifier === Modifier.OneOrMore ? 1 : 0;
      if (matchCount >= minimumMatches) {
        return this.tryPatternsAndChildren(
          urlComponents,
          componentIndex,
          position + consumedLength,
          fullUrl,
          baseUrl,
        );
      }

      return null;
    }

    // Check if the expected text is present at the current position
    if (value.startsWith(expectedText, position)) {
      // Expected text is present - consume it and continue
      return this.tryPatternsAndChildren(
        urlComponents,
        componentIndex,
        position + expectedText.length,
        fullUrl,
        baseUrl,
      );
    }

    // Expected text is not present - check if this is optional
    if (this.modifier === Modifier.Optional) {
      // Optional part not present - skip it and continue
      return this.tryPatternsAndChildren(
        urlComponents,
        componentIndex,
        position,
        fullUrl,
        baseUrl,
      );
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
    urlComponentType: URLComponentType,
    modifier: number = Modifier.None,
    prefix: string = '',
    suffix: string = '',
  ) {
    super(urlComponentType);
    this.modifier = modifier;
    this.prefix = prefix;
    this.suffix = suffix;
  }

  matchesPart(part: Part): boolean {
    return (
      part.type === PartType.SegmentWildcard &&
      part.urlComponentType === this.urlComponentType &&
      part.modifier === this.modifier &&
      part.prefix === this.prefix &&
      part.suffix === this.suffix
    );
  }

  match(
    urlComponents: Array<URLComponent>,
    componentIndex: number,
    position: number,
    fullUrl: string,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    const {value, type} = urlComponents[componentIndex];
    if (type !== this.urlComponentType) {
      return null;
    }

    // Handle ZeroOrMore modifier with children using backtracking
    if (this.modifier === Modifier.ZeroOrMore && this.children.length > 0) {
      const remaining = value.slice(position);

      // First try zero consumption (ZeroOrMore allows consuming nothing)
      const zeroMatch = this.tryPatternsAndChildren(
        urlComponents,
        componentIndex,
        position,
        fullUrl,
        baseUrl,
      );
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

          const newPathIndex = position + consumedLength;
          const match = this.tryPatternsAndChildren(
            urlComponents,
            componentIndex,
            newPathIndex,
            fullUrl,
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
      const remaining = value.slice(position);

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

          const newPathIndex = position + consumedLength;
          const match = this.tryPatternsAndChildren(
            urlComponents,
            componentIndex,
            newPathIndex,
            fullUrl,
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
      const remaining = value.slice(position);

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
          const newPathIndex = position + consumption;
          const match = this.tryPatternsAndChildren(
            urlComponents,
            componentIndex,
            newPathIndex,
            fullUrl,
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
          const newPathIndex = position + contentLength;
          const match = this.tryPatternsAndChildren(
            urlComponents,
            componentIndex,
            newPathIndex,
            fullUrl,
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
    const remaining = value.slice(position);
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
      const zeroMatch = this.tryPatternsAndChildren(
        urlComponents,
        componentIndex,
        position,
        fullUrl,
        baseUrl,
      );
      if (zeroMatch !== null) {
        return zeroMatch;
      }
    }

    // Try normal consumption if we matched something
    if (consumedChars > 0) {
      const newPathIndex = position + consumedChars;
      return this.tryPatternsAndChildren(
        urlComponents,
        componentIndex,
        newPathIndex,
        fullUrl,
        baseUrl,
      );
    }

    // For OneOrMore, if we couldn't consume anything, we still need to check
    // if zero-consumption is valid according to URLPattern semantics
    if (this.modifier === Modifier.OneOrMore && consumedChars === 0) {
      // Try zero consumption for OneOrMore to match URLPattern behavior
      const zeroMatch = this.tryPatternsAndChildren(
        urlComponents,
        componentIndex,
        position,
        fullUrl,
        baseUrl,
      );
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

    // Handle case where wildcard has no prefix and remaining doesn't start with
    // `/` This happens in direct separation cases like /post/:id-:title where
    // :title needs to match "foo" directly (not "/foo")
    if (remaining.length === 0) {
      return 0;
    }

    if (
      this.urlComponentType === URLComponentType.Pathname &&
      remaining.startsWith('/')
    ) {
      // Standard case: wildcard with implicit / prefix
      const segmentContent = remaining.slice(1);
      if (segmentContent.length === 0) {
        return 0;
      }

      // When there are no children to match, consume the entire remaining
      // content
      return 1 + segmentContent.length;
    } else {
      // Special case: wildcard with no prefix matching remaining content
      // directly. This happens after Fixed parts consume their content
      return remaining.length;
    }
  }

  #matchMultipleSegments(
    remaining: string,
    requireAtLeastOne: boolean,
  ): number {
    // For pathname components, content should start with '/'
    if (this.urlComponentType === URLComponentType.Pathname) {
      if (remaining.length === 0 || !remaining.startsWith('/')) {
        // Return -1 to indicate failure for OneOrMore
        return requireAtLeastOne ? -1 : 0;
      }
    } else {
      // For non-pathname components (search, hash, etc.), content doesn't need
      // to start with '/'
      if (remaining.length === 0) {
        return requireAtLeastOne ? -1 : 0;
      }
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

    if (this.urlComponentType === URLComponentType.Pathname) {
      if (remaining.startsWith('/')) {
        // Standard case: wildcard with implicit / prefix
        const segmentContent = remaining.slice(1);
        if (segmentContent.length === 0) {
          return 0;
        }

        // When there are no children to match, consume the entire remaining
        // content
        return 1 + segmentContent.length;
      } else {
        // Special case: wildcard with no prefix matching remaining content
        // directly. This happens after Fixed parts consume their content
        return remaining.length;
      }
    } else {
      // For non-pathname components, match all remaining content
      return remaining.length;
    }
  }

  #matchWithPrefixSuffix(remaining: string, required: boolean): number {
    // Check if remaining value starts with the prefix
    if (remaining.length > 0 && remaining.startsWith(this.prefix)) {
      const afterPrefix = remaining.slice(this.prefix.length);

      if (this.suffix) {
        // Find the suffix position
        const suffixIndex = afterPrefix.indexOf(this.suffix);
        if (suffixIndex > 0) {
          // Must have content between prefix and suffix
          // We found content between prefix and suffix
          const content = afterPrefix.slice(0, suffixIndex);

          // For pathname components, validate that content doesn't contain path
          // separators. For other components (search, hash), slashes are valid
          // content
          if (this.urlComponentType === URLComponentType.Pathname) {
            if (!content.includes('/')) {
              // Return: prefix + content + suffix
              return this.prefix.length + content.length + this.suffix.length;
            }
          } else {
            // For non-pathname components, allow slashes in content
            return this.prefix.length + content.length + this.suffix.length;
          }
        }
      } else {
        // No suffix - consume until end of current segment
        let contentLength = 0;

        if (this.urlComponentType === URLComponentType.Pathname) {
          // For pathname: consume until next '/' (end of segment)
          for (let i = 0; i < afterPrefix.length; i++) {
            if (afterPrefix[i] === '/') {
              break;
            }
            contentLength++;
          }
        } else {
          // For non-pathname components: consume until end of string or next
          // logical delimiter. Since we don't have a suffix, consume everything
          // remaining
          contentLength = afterPrefix.length;
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

      // Find content length based on URL component type
      let contentLength = 0;
      if (this.urlComponentType === URLComponentType.Pathname) {
        // For pathname: find content until next '/' (end of segment)
        for (let i = 0; i < afterPrefix.length; i++) {
          const char = afterPrefix[i];
          if (char === '/') {
            break;
          }
          contentLength++;
        }
      } else {
        // For non-pathname components: consume all remaining content
        // since we don't have clear segment boundaries
        contentLength = afterPrefix.length;
      }

      if (contentLength > 0) {
        // Consume prefix + content
        const segmentLength = this.prefix.length + contentLength;
        totalConsumed += segmentLength;
        currentRemaining = currentRemaining.slice(segmentLength);

        // For non-pathname components, we consumed everything, so break
        if (this.urlComponentType !== URLComponentType.Pathname) {
          break;
        }
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

  constructor(urlComponentType: URLComponentType, modifier: number) {
    super(urlComponentType);
    this.modifier = modifier;
  }

  matchesPart(part: Part): boolean {
    return (
      part.type === PartType.FullWildcard &&
      part.urlComponentType === this.urlComponentType &&
      part.modifier === this.modifier
    );
  }

  match(
    urlComponents: Array<URLComponent>,
    componentIndex: number,
    position: number,
    fullUrl: string,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    const {value, type} = urlComponents[componentIndex];
    if (type !== this.urlComponentType) {
      return null;
    }

    // For modifiers that support zero-match, try zero consumption first
    if (
      this.modifier === Modifier.ZeroOrMore ||
      this.modifier === Modifier.Optional ||
      this.modifier === Modifier.OneOrMore
    ) {
      const zeroMatch = this.tryPatternsAndChildren(
        urlComponents,
        componentIndex,
        position,
        fullUrl,
        baseUrl,
      );
      if (zeroMatch !== null) {
        return zeroMatch;
      }
    }

    if (this.children.length === 0) {
      // We have no children, so consume everything remaining
      if (value.length > position) {
        return this.tryPatternsAndChildren(
          urlComponents,
          componentIndex,
          value.length,
          fullUrl,
          baseUrl,
        );
      }
    } else {
      // We have children, so we need to be able to backtrack if necessary. We
      // try to match greedily first, then backtrack character by character if
      // we haven't found a match.
      // TODO: Does this introduce a "catastrophic backtracking" vulnerability?
      // We need to try pathological cases like '/*/*/index.html' and see how we
      // can prevent exponential backtracking.
      for (
        let consumeLength = value.length - position;
        consumeLength >= 0;
        consumeLength--
      ) {
        const newPosition = position + consumeLength;
        const match = this.tryPatternsAndChildren(
          urlComponents,
          componentIndex,
          newPosition,
          fullUrl,
          baseUrl,
        );
        if (match !== null) {
          return match;
        }
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
  readonly regexString: string;
  readonly regex: RegExp | null = null;

  constructor(urlComponentType: URLComponentType, regexString: string) {
    super(urlComponentType);
    this.regexString = regexString;
    try {
      // The regex string should already be a complete regex pattern
      // For alternation like 'small|large', we need to wrap in a group
      let pattern = regexString;

      // If the pattern contains alternation (|) but is not wrapped in
      // parentheses, we need to wrap it to ensure the alternation is scoped
      // correctly
      if (pattern.includes('|') && !pattern.startsWith('(')) {
        pattern = `(${pattern})`;
      }

      this.regex = new RegExp(`^${pattern}$`);
    } catch (error: any) {
      // If regex is invalid, leave as null for fallback handling
      this.regex = null;
    }
  }

  matchesPart(part: Part): boolean {
    // We don't attempt to do any complex sharing of regex patterns, so we just
    // check if the regex is exactly the same. Prefix sharing is therefore much
    // worse for regexes, and the main optimization is for fixed and wildcard
    // segments.
    return (
      part.type === PartType.Regex &&
      part.urlComponentType === this.urlComponentType &&
      part.value === this.regexString
    );
  }

  match(
    urlComponents: Array<URLComponent>,
    componentIndex: number,
    position: number,
    fullUrl: string,
    baseUrl: string | undefined,
  ): URLPatternListItem<T> | null {
    const {value, type} = urlComponents[componentIndex];
    if (type !== this.urlComponentType) {
      return null;
    }

    if (position >= value.length) {
      return null;
    }

    // Extract the segment to test
    let segmentToTest: string;
    let consumedChars: number;

    if (this.urlComponentType === URLComponentType.Pathname) {
      // For pathname components, use traditional slash-based segment extraction
      if (value.startsWith('/', position)) {
        // Regex with prefix "/" - extract segment after the "/"
        const nextSlashIndex = value.indexOf('/', position + 1);
        segmentToTest = value.slice(position + 1, nextSlashIndex >>> 0);

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
        const nextSlashIndex = value.indexOf('/', position);
        segmentToTest = value.slice(position, nextSlashIndex >>> 0);

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
    } else {
      // For non-pathname components (search, hash), test the entire remaining
      // content
      segmentToTest = value.slice(position);

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

    return this.tryPatternsAndChildren(
      urlComponents,
      componentIndex,
      position + consumedChars,
      fullUrl,
      baseUrl,
    );
  }

  /**
   * Test if a segment matches this regex pattern
   */
  #testRegexPattern(segment: string): boolean {
    // Use cached compiled regex if available
    if (this.regex) {
      return this.regex.test(segment);
    } else {
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
 * tree instead of a flat list. Matching patterns are searched for on the tree
 * and shared prefixes of patterns are only checked for a match once.
 *
 * The implementation maintains first-match-wins semantics - patterns are tested
 * in the order they were added to the collection. This implementation should be
 * a drop-in replacement for a linear search.
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
    const parts = parseFullURL(pattern);
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
    componentIndex: number,
    item: URLPatternListItem<T>,
  ): void {
    if (item.sequence < currentNode.minSequence) {
      currentNode.minSequence = item.sequence;
    }

    // If we've consumed all parts, this pattern ends at this node
    if (componentIndex >= parts.length) {
      currentNode.patterns.push(item);
      return;
    }

    const part = parts[componentIndex];
    const childNode = this.#getOrCreateChildNode(currentNode, part);

    // Continue building the tree with the next part
    this.#addPatternToTree(childNode, parts, componentIndex + 1, item);
  }

  /**
   * Get or create a child node for the given part. Returns an existing node
   * if it matches the part, or creates a new node if not found.
   */
  #getOrCreateChildNode(
    parent: PrefixTreeNode<T>,
    part: Part,
  ): PrefixTreeNode<T> {
    for (const child of parent.children) {
      if (child.matchesPart(part)) {
        return child;
      }
    }

    let node: PrefixTreeNode<T>;

    switch (part.type) {
      case PartType.Fixed:
        node = new FixedPrefixTreeNode<T>(
          part.urlComponentType,
          part.value,
          part.modifier,
        );
        break;
      case PartType.SegmentWildcard:
        node = new WildcardPrefixTreeNode<T>(
          part.urlComponentType,
          part.modifier,
          part.prefix,
          part.suffix,
        );
        break;
      case PartType.FullWildcard:
        node = new FullWildcardPrefixTreeNode<T>(
          part.urlComponentType,
          part.modifier,
        );
        break;
      case PartType.Regex:
        node = new RegexPrefixTreeNode<T>(part.urlComponentType, part.value);
        break;
      default:
        throw new Error(`Unsupported part type: ${part.type}`);
    }

    parent.children.push(node);
    return node;
  }

  /**
   * Match a URL against the URLPatterns, returning the first match found and
   * its associated value.
   *
   * @param url - The URL to match
   * @param baseUrl - Optional base URL for relative path resolution
   */
  match(url: string | URL, baseUrl?: string): URLPatternListMatch<T> | null {
    url = typeof url === 'string' ? new URL(url, baseUrl) : url;

    const components: Array<URLComponent> = [];
    if (url.protocol !== '') {
      components.push({
        value: url.protocol.slice(0, -1),
        type: URLComponentType.Protocol,
      });
    }
    if (url.username !== '') {
      components.push({
        value: url.username,
        type: URLComponentType.Username,
      });
    }
    if (url.password !== '') {
      components.push({
        value: url.password,
        type: URLComponentType.Password,
      });
    }
    if (url.hostname !== '') {
      components.push({
        value: url.hostname,
        type: URLComponentType.Hostname,
      });
    }
    if (url.port !== '') {
      components.push({value: url.port, type: URLComponentType.Port});
    }
    if (url.pathname !== '') {
      components.push({
        value: url.pathname,
        type: URLComponentType.Pathname,
      });
    }
    if (url.search !== '') {
      components.push({
        value: url.search.slice(1),
        type: URLComponentType.Search,
      });
    }
    if (url.hash !== '') {
      components.push({
        value: url.hash.slice(1),
        type: URLComponentType.Hash,
      });
    }

    const match = this.#root.match(components, 0, 0, url.toString(), baseUrl);
    if (match !== null) {
      const result = baseUrl
        ? match.pattern.exec(url.toString(), baseUrl)
        : match.pattern.exec(url.toString());

      if (result !== null) {
        return {
          result,
          value: match.value,
        };
      }
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
