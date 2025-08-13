import type {URLPatternList} from './index.js';
import {
  PrefixTreeNode,
  RootPrefixTreeNode,
  FixedPrefixTreeNode,
  WildcardPrefixTreeNode,
  FullWildcardPrefixTreeNode,
  RegexPrefixTreeNode,
} from './index.js';
import {Modifier} from './lib/parse-pattern.js';

export interface VisualizationOptions {
  /**
   * Include pattern information in the output
   */
  showPatterns?: boolean;

  /**
   * Maximum depth to visualize (useful for very deep trees)
   */
  maxDepth?: number;

  /**
   * Include detailed node information
   */
  verbose?: boolean;

  /**
   * Use Unicode box drawing characters for tree structure
   */
  useUnicode?: boolean;
}

export interface TreeVisualizationNode {
  label: string;
  nodeType: string;
  patterns: string[];
  children: TreeVisualizationNode[];
  depth: number;
}

/**
 * Utility class for visualizing the prefix tree structure of a URLPatternList.
 * This is intended for debugging and development purposes.
 */
export class URLPatternListVisualizer {
  /**
   * Generate a text representation of the prefix tree.
   */
  static visualizeAsText<T>(
    patternList: URLPatternList<T>,
    options: VisualizationOptions = {},
  ): string {
    const {
      showPatterns = true,
      maxDepth = Infinity,
      verbose = false,
      useUnicode = true,
    } = options;

    const root = patternList._treeRoot;
    const lines: string[] = [];

    lines.push('URLPatternList Prefix Tree:');
    lines.push('');

    this.#renderNode(
      root,
      lines,
      '',
      true,
      0,
      maxDepth,
      showPatterns,
      verbose,
      useUnicode,
    );

    return lines.join('\n');
  }

  /**
   * Generate a structured representation of the prefix tree.
   */
  static visualizeAsStructure<T>(
    patternList: URLPatternList<T>,
    options: VisualizationOptions = {},
  ): TreeVisualizationNode {
    const {maxDepth = Infinity} = options;
    const root = patternList._treeRoot;

    return this.#buildStructureNode(root, 0, maxDepth);
  }

  /**
   * Recursively render a node and its children as text.
   */
  static #renderNode<T>(
    node: PrefixTreeNode<T>,
    lines: string[],
    prefix: string,
    isLast: boolean,
    depth: number,
    maxDepth: number,
    showPatterns: boolean,
    verbose: boolean,
    useUnicode: boolean,
  ): void {
    if (depth > maxDepth) {
      return;
    }

    const connector = useUnicode
      ? isLast
        ? '└── '
        : '├── '
      : isLast
        ? '`-- '
        : '|-- ';

    const nodeInfo = this.#getNodeInfo(node, verbose);
    lines.push(`${prefix}${connector}${nodeInfo.label}`);

    if (verbose && nodeInfo.details) {
      const detailPrefix =
        prefix +
        (isLast
          ? useUnicode
            ? '    '
            : '    '
          : useUnicode
            ? '│   '
            : '|   ');
      lines.push(
        `${detailPrefix}${useUnicode ? '├─ ' : '|- '}${nodeInfo.details}`,
      );
    }

    if (showPatterns && node.patterns.length > 0) {
      const patternPrefix =
        prefix +
        (isLast
          ? useUnicode
            ? '    '
            : '    '
          : useUnicode
            ? '│   '
            : '|   ');
      const patternConnector = useUnicode ? '├─ ' : '|- ';

      node.patterns.forEach((pattern, index) => {
        const isLastPattern =
          index === node.patterns.length - 1 && node.children.length === 0;
        const finalConnector = isLastPattern
          ? useUnicode
            ? '└─ '
            : '`- '
          : patternConnector;
        lines.push(
          `${patternPrefix}${finalConnector}[PATTERN] ${pattern.pattern.pathname}`,
        );
      });
    }

    const childPrefix =
      prefix +
      (isLast ? (useUnicode ? '    ' : '    ') : useUnicode ? '│   ' : '|   ');

    node.children.forEach((child, index) => {
      const isLastChild = index === node.children.length - 1;
      this.#renderNode(
        child,
        lines,
        childPrefix,
        isLastChild,
        depth + 1,
        maxDepth,
        showPatterns,
        verbose,
        useUnicode,
      );
    });
  }

  /**
   * Build a structured representation of a node.
   */
  static #buildStructureNode<T>(
    node: PrefixTreeNode<T>,
    depth: number,
    maxDepth: number,
  ): TreeVisualizationNode {
    const nodeInfo = this.#getNodeInfo(node, true);

    const structureNode: TreeVisualizationNode = {
      label: nodeInfo.label,
      nodeType: nodeInfo.type,
      patterns: node.patterns.map((p) => p.pattern.pathname),
      children: [],
      depth,
    };

    if (depth < maxDepth) {
      structureNode.children = node.children.map((child) =>
        this.#buildStructureNode(child, depth + 1, maxDepth),
      );
    }

    return structureNode;
  }

  /**
   * Extract information about a node for display.
   */
  static #getNodeInfo<T>(
    node: PrefixTreeNode<T>,
    verbose: boolean,
  ): {label: string; type: string; details: string | undefined} {
    if (node instanceof RootPrefixTreeNode) {
      return {
        label: '<ROOT>',
        type: 'root',
        details: verbose
          ? `${node.patterns.length} patterns, ${node.children.length} children`
          : undefined,
      };
    }

    if (node instanceof FixedPrefixTreeNode) {
      return {
        label: `"${node.value}"`,
        type: 'fixed',
        details: verbose
          ? `value: "${node.value}", ${node.patterns.length} patterns, ${node.children.length} children`
          : undefined,
      };
    }

    if (node instanceof WildcardPrefixTreeNode) {
      const modifierStr = this.#getModifierString(node.modifier);
      const prefixSuffix =
        node.prefix || node.suffix ? ` (${node.prefix}*${node.suffix})` : '';

      return {
        label: `:param${modifierStr}${prefixSuffix}`,
        type: 'wildcard',
        details: verbose
          ? `modifier: ${modifierStr}, prefix: "${node.prefix}", suffix: "${node.suffix}", ${node.patterns.length} patterns, ${node.children.length} children`
          : undefined,
      };
    }

    if (node instanceof FullWildcardPrefixTreeNode) {
      const modifierStr = this.#getModifierString(node.modifier);

      return {
        label: `*${modifierStr}`,
        type: 'full-wildcard',
        details: verbose
          ? `modifier: ${modifierStr}, ${node.patterns.length} patterns, ${node.children.length} children`
          : undefined,
      };
    }

    if (node instanceof RegexPrefixTreeNode) {
      return {
        label: `/(${node.regexString})/`,
        type: 'regex',
        details: verbose
          ? `regex: "${node.regexString}", ${node.patterns.length} patterns, ${node.children.length} children`
          : undefined,
      };
    }

    return {
      label: '<UNKNOWN>',
      type: 'unknown',
      details: verbose
        ? `${node.patterns.length} patterns, ${node.children.length} children`
        : undefined,
    };
  }

  /**
   * Convert modifier enum to readable string.
   */
  static #getModifierString(modifier: number): string {
    switch (modifier) {
      case Modifier.None:
        return '';
      case Modifier.Optional:
        return '?';
      case Modifier.ZeroOrMore:
        return '*';
      case Modifier.OneOrMore:
        return '+';
      default:
        return `(${modifier})`;
    }
  }

  /**
   * Generate statistics about the prefix tree.
   */
  static getStatistics<T>(patternList: URLPatternList<T>): {
    totalNodes: number;
    totalPatterns: number;
    maxDepth: number;
    nodeTypeCount: Record<string, number>;
    averageBranchingFactor: number;
  } {
    const root = patternList._treeRoot;
    const stats = {
      totalNodes: 0,
      totalPatterns: 0,
      maxDepth: 0,
      nodeTypeCount: {} as Record<string, number>,
      totalChildren: 0,
      nodesWithChildren: 0,
    };

    this.#collectStatistics(root, 0, stats);

    const averageBranchingFactor =
      stats.nodesWithChildren > 0
        ? stats.totalChildren / stats.nodesWithChildren
        : 0;

    return {
      totalNodes: stats.totalNodes,
      totalPatterns: stats.totalPatterns,
      maxDepth: stats.maxDepth,
      nodeTypeCount: stats.nodeTypeCount,
      averageBranchingFactor,
    };
  }

  /**
   * Recursively collect statistics about the tree.
   */
  static #collectStatistics<T>(
    node: PrefixTreeNode<T>,
    depth: number,
    stats: {
      totalNodes: number;
      totalPatterns: number;
      maxDepth: number;
      nodeTypeCount: Record<string, number>;
      totalChildren: number;
      nodesWithChildren: number;
    },
  ): void {
    stats.totalNodes++;
    stats.totalPatterns += node.patterns.length;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    const nodeInfo = this.#getNodeInfo(node, false);
    stats.nodeTypeCount[nodeInfo.type] =
      (stats.nodeTypeCount[nodeInfo.type] || 0) + 1;

    if (node.children.length > 0) {
      stats.nodesWithChildren++;
      stats.totalChildren += node.children.length;
    }

    for (const child of node.children) {
      this.#collectStatistics(child, depth + 1, stats);
    }
  }
}
