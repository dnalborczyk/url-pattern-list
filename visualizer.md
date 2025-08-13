# URLPatternList Visualizer

A utility for visualizing the prefix tree structure of a URLPatternList. This is useful for debugging, development, and understanding how patterns are organized internally.

## Features

- **Text visualization** with Unicode tree drawing characters
- **Structured data output** for programmatic analysis 
- **Statistics** about tree structure and patterns
- **Configurable options** for depth limits, verbosity, and formatting
- **Pattern information** showing which patterns terminate at each node

## Usage

### Basic Text Visualization

```ts
import {URLPatternList} from 'url-pattern-list';
import {URLPatternListVisualizer} from 'url-pattern-list/visualizer.js';

const patternList = new URLPatternList<string>();
patternList.addPattern(new URLPattern({pathname: '/'}), 'home');
patternList.addPattern(new URLPattern({pathname: '/users/:id'}), 'user');
patternList.addPattern(new URLPattern({pathname: '/api/*'}), 'api');

console.log(URLPatternListVisualizer.visualizeAsText(patternList));
```

Output:
```
URLPatternList Prefix Tree:

└── <ROOT>
    ├── "/"
    │   └─ [PATTERN] /
    ├── "/users"
    │   └── :param (/*)
    │       └─ [PATTERN] /users/:id
    └── "/api"
        └── *
            └─ [PATTERN] /api/*
```

### Verbose Output

```ts
console.log(URLPatternListVisualizer.visualizeAsText(patternList, {
  verbose: true,
  showPatterns: true,
}));
```

### Structured Data

```ts
const structure = URLPatternListVisualizer.visualizeAsStructure(patternList);
console.log(JSON.stringify(structure, null, 2));
```

### Statistics

```ts
const stats = URLPatternListVisualizer.getStatistics(patternList);
console.log(`Total Nodes: ${stats.totalNodes}`);
console.log(`Total Patterns: ${stats.totalPatterns}`);
console.log(`Max Depth: ${stats.maxDepth}`);
console.log(`Average Branching Factor: ${stats.averageBranchingFactor.toFixed(2)}`);
```

## Configuration Options

### VisualizationOptions

- **`showPatterns`** (boolean, default: true): Include pattern information in output
- **`maxDepth`** (number, default: Infinity): Maximum depth to visualize
- **`verbose`** (boolean, default: false): Include detailed node information
- **`useUnicode`** (boolean, default: true): Use Unicode box drawing characters

### Example with Options

```ts
const options = {
  maxDepth: 3,
  verbose: true,
  showPatterns: false,
  useUnicode: false,
};

console.log(URLPatternListVisualizer.visualizeAsText(patternList, options));
```

## Node Types

The visualizer shows different types of nodes in the prefix tree:

- **`<ROOT>`**: The root node of the tree
- **`"fixed"`**: Fixed string segments like `"/api"` or `"/users"`
- **`:param`**: Named parameters like `:id` or `:userId`
- **`*`**: Full wildcards that match everything
- **`/(regex)/`**: Regular expression patterns

### Modifiers

Parameters can have modifiers:
- No modifier: Required single parameter
- **`?`**: Optional parameter
- **`*`**: Zero or more instances
- **`+`**: One or more instances

## Understanding the Tree Structure

The prefix tree optimizes pattern matching by:

1. **Sharing fixed prefixes**: Patterns like `/api/users` and `/api/posts` share the `/api` node
2. **Grouping by structure**: Parameters with the same structure share nodes even if they have different names
3. **Maintaining order**: Patterns are tested in the order they were added

## Development Usage

Add the visualizer to your development tools:

```ts
if (process.env.NODE_ENV === 'development') {
  console.log('Router patterns:');
  console.log(URLPatternListVisualizer.visualizeAsText(router.patterns));
}
```

## Internal API Note

This utility uses internal APIs of URLPatternList that are marked with `@internal`. These APIs may change without notice and are not part of the public API. The visualizer is intended for debugging and development purposes only.
