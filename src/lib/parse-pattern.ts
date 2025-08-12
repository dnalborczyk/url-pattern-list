export const Modifier = {
  None: 0,
  Optional: 1,
  ZeroOrMore: 2,
  OneOrMore: 3,
} as const;
export type Modifier = (typeof Modifier)[keyof typeof Modifier];

export const PartType = {
  Fixed: 0,
  SegmentWildcard: 1,
  FullWildcard: 2,
  Regex: 3,
} as const;
export type PartType = (typeof PartType)[keyof typeof PartType];

export interface Part {
  type: PartType;
  name: string | number | undefined;
  prefix: string;
  value: string;
  suffix: string;
  modifier: Modifier;
}

// See https://tc39.es/ecma262/#prod-IdentifierStart for why we need `$` and `_`
const identifierStart = /[$_\p{ID_Start}]/u;
// https://tc39.es/ecma262/#prod-IdentifierPartChar doesn't include `_`?
const identifierPart = /[$_\p{ID_Continue}]/u;
const onlyASCII = /^[\x00-\x7F]*$/;

/**
 * Note: this parser is not implemented exactly as specced in
 * https://urlpattern.spec.whatwg.org/#parsing-pattern-strings
 *
 * It should be equivalent, though we handle separators directly in the parser
 * to help with building a prefix tree.
 *
 * TODO (justinfagnani): More tests!
 */
class Parser {
  #path: string;
  #result: Array<Part> = [];

  /**
   * Set of used names to ensure uniqueness of parameter names.
   */
  #names = new Set<string | number>();

  /**
   * Pending fixed value to accumulate characters until a segment or pattern is
   * detected.
   */
  #pendingFixedValue = '';

  /**
   * Counter for positional parameters (unnamed segments or wildcards) to
   * ensure they get unique names.
   */
  #positionalParamCount = 0;

  /**
   * Current parsing position in the path string.
   */
  #i = 0;

  constructor(path: string) {
    this.#path = path;
  }

  /**
   * Flush any pending fixed text to the result.
   */
  #flushFixedPart(): void {
    if (this.#pendingFixedValue.length === 0) {
      return;
    }

    // Special case: handle root path "/"
    if (this.#pendingFixedValue === '/') {
      this.#result.push({
        type: PartType.Fixed,
        name: '',
        prefix: '',
        value: '/',
        suffix: '',
        modifier: Modifier.None,
      });
      this.#pendingFixedValue = '';
      return;
    }

    // Split path by "/" and create separate parts for each segment. This makes
    // it easier to build a prefix tree where each node represents a single
    // segment.
    const segments = this.#pendingFixedValue.split('/');

    // Handle paths with leading slash
    if (this.#pendingFixedValue.startsWith('/')) {
      // Remove empty first element from leading slash
      segments.shift();

      // Add each segment as a separate part
      for (const segment of segments) {
        if (segment !== '') {
          this.#result.push({
            type: PartType.Fixed,
            name: '',
            prefix: '',
            value: '/' + segment,
            suffix: '',
            modifier: Modifier.None,
          });
        }
      }

      // Add trailing slash as separate part if needed
      if (
        this.#pendingFixedValue.endsWith('/') &&
        this.#pendingFixedValue.length > 1
      ) {
        this.#result.push({
          type: PartType.Fixed,
          name: '',
          prefix: '',
          value: '/',
          suffix: '',
          modifier: Modifier.None,
        });
      }
    } else {
      // Handle paths without leading slash
      for (let j = 0; j < segments.length; j++) {
        const segment = segments[j];
        if (segment !== '') {
          // First segment gets no leading slash, others get one
          const segmentValue = j === 0 ? segment : '/' + segment;
          this.#result.push({
            type: PartType.Fixed,
            name: '',
            prefix: '',
            value: segmentValue,
            suffix: '',
            modifier: Modifier.None,
          });
        }
      }
    }

    this.#pendingFixedValue = '';
  }

  #addPart(
    type: PartType,
    name: string | number | undefined,
    prefix: string,
    value: string,
    suffix: string,
    modifier: Modifier,
  ): void {
    if (name !== undefined) {
      if (this.#names.has(name)) {
        throw new TypeError(`Duplicate name '${name}'.`);
      }
      this.#names.add(name);
    }

    this.#result.push({
      type,
      name,
      prefix,
      value,
      suffix,
      modifier,
    });
  }

  #parseModifier(): Modifier {
    if (this.#i >= this.#path.length) {
      return Modifier.None;
    }

    switch (this.#path[this.#i]) {
      case '?':
        this.#i++;
        return Modifier.Optional;
      case '*':
        this.#i++;
        return Modifier.ZeroOrMore;
      case '+':
        this.#i++;
        return Modifier.OneOrMore;
      default:
        return Modifier.None;
    }
  }

  #parseName(): string {
    const start = this.#i;
    if (
      this.#i >= this.#path.length ||
      !identifierStart.test(this.#path[this.#i])
    ) {
      throw new TypeError(`Missing parameter name at ${start - 1}`);
    }

    while (
      this.#i < this.#path.length &&
      identifierPart.test(this.#path[this.#i])
    ) {
      this.#i++;
    }

    return this.#path.slice(start, this.#i);
  }

  #parseRegex(): string {
    if (this.#path[this.#i] !== '(') {
      throw new TypeError(`Expected '(' at ${this.#i}`);
    }

    this.#i++; // Skip opening paren
    const start = this.#i;
    let count = 1;
    let pattern = '';

    if (this.#i < this.#path.length && this.#path[this.#i] === '?') {
      throw new TypeError(`Pattern cannot start with "?" at ${this.#i}`);
    }

    while (this.#i < this.#path.length && count > 0) {
      if (!onlyASCII.test(this.#path[this.#i])) {
        throw new TypeError(
          `Invalid character '${this.#path[this.#i]}' at ${this.#i}.`,
        );
      }

      if (this.#path[this.#i] === '\\') {
        pattern += this.#path[this.#i++];
        if (this.#i < this.#path.length) {
          pattern += this.#path[this.#i++];
        }
        continue;
      }

      if (this.#path[this.#i] === ')') {
        count--;
        if (count === 0) {
          this.#i++; // Skip closing paren
          break;
        }
      } else if (this.#path[this.#i] === '(') {
        count++;
        if (
          this.#i + 1 < this.#path.length &&
          this.#path[this.#i + 1] !== '?'
        ) {
          throw new TypeError(`Capturing groups are not allowed at ${this.#i}`);
        }
      }

      pattern += this.#path[this.#i++];
    }

    if (count !== 0) {
      throw new TypeError(`Unbalanced pattern at ${start - 1}`);
    }

    if (pattern === '') {
      throw new TypeError(`Missing pattern at ${start - 1}`);
    }

    return pattern;
  }

  #extractPrefix(): string {
    if (this.#pendingFixedValue.length === 0) {
      return '';
    }

    const lastChar =
      this.#pendingFixedValue[this.#pendingFixedValue.length - 1];
    if (lastChar === '/' || lastChar === '.') {
      const prefix = lastChar;
      this.#pendingFixedValue = this.#pendingFixedValue.slice(0, -1);
      return prefix;
    }
    return '';
  }

  public parse(): Array<Part> {
    while (this.#i < this.#path.length) {
      const char = this.#path[this.#i];

      // Handle grouped patterns: "{prefix:name(regex)suffix}modifier"
      if (char === '{') {
        this.#flushFixedPart();
        this.#i++; // Skip opening brace

        // Parse prefix text
        let prefix = '';
        while (
          this.#i < this.#path.length &&
          this.#path[this.#i] !== ':' &&
          this.#path[this.#i] !== '*' &&
          this.#path[this.#i] !== '(' &&
          this.#path[this.#i] !== '}'
        ) {
          if (this.#path[this.#i] === '\\') {
            this.#i++; // Skip escape
            if (this.#i < this.#path.length) {
              prefix += this.#path[this.#i++];
            }
          } else {
            prefix += this.#path[this.#i++];
          }
        }

        let name: string | number | undefined;
        let regexValue = '';
        let type: PartType = PartType.Fixed;

        // Parse name parameter ":name"
        if (this.#i < this.#path.length && this.#path[this.#i] === ':') {
          this.#i++; // Skip ':'
          name = this.#parseName();
          type = PartType.SegmentWildcard;
        }

        // Parse regex pattern "(pattern)"
        if (this.#i < this.#path.length && this.#path[this.#i] === '(') {
          regexValue = this.#parseRegex();
          type = PartType.Regex;
        }

        // Parse standalone wildcard "*"
        if (this.#i < this.#path.length && this.#path[this.#i] === '*') {
          this.#i++; // Skip '*'
          if (name === undefined) {
            name = this.#positionalParamCount++;
          }
          type = PartType.FullWildcard;
        }

        // Parse suffix text
        let suffix = '';
        while (this.#i < this.#path.length && this.#path[this.#i] !== '}') {
          if (this.#path[this.#i] === '\\') {
            this.#i++; // Skip escape
            if (this.#i < this.#path.length) {
              suffix += this.#path[this.#i++];
            }
          } else {
            suffix += this.#path[this.#i++];
          }
        }

        if (this.#i >= this.#path.length || this.#path[this.#i] !== '}') {
          throw new TypeError(`Unbalanced '{' at ${this.#i}`);
        }
        this.#i++; // Skip closing brace

        const modifier = this.#parseModifier();

        // Handle special case: just fixed text in a group
        if (
          name === undefined &&
          regexValue === '' &&
          type === PartType.Fixed &&
          modifier === Modifier.None
        ) {
          this.#pendingFixedValue += prefix;
        } else if (name === undefined && regexValue === '' && prefix === '') {
          // Empty group - ignore
        } else {
          // Normalize Fixed parts with empty value but non-empty prefix
          // Convert Fixed("") with prefix="s" to Fixed("s")
          if (type === PartType.Fixed && regexValue === '' && prefix !== '') {
            regexValue = prefix;
            prefix = '';
          }

          if (
            name === undefined &&
            (type === PartType.SegmentWildcard || type === PartType.Regex)
          ) {
            name = this.#positionalParamCount++;
          }
          this.#addPart(type, name, prefix, regexValue, suffix, modifier);
        }
        continue;
      }

      // Handle named parameters ":name"
      if (char === ':') {
        const prefix = this.#extractPrefix();
        this.#flushFixedPart();

        this.#i++; // Skip ':'
        const name = this.#parseName();

        let regexValue = '';
        let type: PartType = PartType.SegmentWildcard;

        // Check for optional regex
        if (this.#i < this.#path.length && this.#path[this.#i] === '(') {
          regexValue = this.#parseRegex();
          type = PartType.Regex;
        }

        const modifier = this.#parseModifier();
        this.#addPart(type, name, prefix, regexValue, '', modifier);
        continue;
      }

      // Handle standalone regex patterns "(pattern)"
      if (char === '(') {
        const prefix = this.#extractPrefix();
        this.#flushFixedPart();

        const regexValue = this.#parseRegex();
        const modifier = this.#parseModifier();
        this.#addPart(
          PartType.Regex,
          this.#positionalParamCount++,
          prefix,
          regexValue,
          '',
          modifier,
        );
        continue;
      }

      // Handle standalone wildcard "*"
      if (char === '*') {
        const prefix = this.#extractPrefix();
        this.#flushFixedPart();

        this.#i++; // Skip '*'
        const modifier = this.#parseModifier();
        this.#addPart(
          PartType.FullWildcard,
          this.#positionalParamCount++,
          prefix,
          '',
          '',
          modifier,
        );
        continue;
      }

      // Handle escaped characters
      if (char === '\\') {
        this.#i++; // Skip backslash
        if (this.#i < this.#path.length) {
          if (this.#path[this.#i] === '/') {
            // Escaped slash becomes regular slash
            this.#pendingFixedValue += '/';
          } else {
            // Other escaped characters are preserved
            this.#pendingFixedValue += this.#path[this.#i];
          }
          this.#i++;
        }
        continue;
      }

      // Regular character - add to pending fixed text
      this.#pendingFixedValue += char;
      this.#i++;
    }

    this.#flushFixedPart();

    return this.#result;
  }
}

/**
 * Parse a path pattern into an array of Part objects.
 *
 * @param path - The path pattern to parse (e.g., "/users/:id" or "/files/*")
 * @returns Array of Part objects representing each segment of the path
 */
export const parse = (path: string): Array<Part> => {
  const parser = new Parser(path);
  return parser.parse();
};
