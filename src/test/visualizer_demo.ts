import {URLPatternList} from '../index.js';
import {URLPatternListVisualizer} from '../visualizer.js';

/**
 * Demo script showing how to use the URLPatternListVisualizer
 */
function demoVisualization(): void {
  const patternList = new URLPatternList<string>();

  // Add some example patterns to create an interesting tree structure
  patternList.addPattern(new URLPattern({pathname: '/'}), 'home');
  patternList.addPattern(new URLPattern({pathname: '/about'}), 'about');
  patternList.addPattern(new URLPattern({pathname: '/users'}), 'users-list');
  patternList.addPattern(new URLPattern({pathname: '/users/:id'}), 'user-detail');
  patternList.addPattern(new URLPattern({pathname: '/users/:id/posts'}), 'user-posts');
  patternList.addPattern(new URLPattern({pathname: '/users/:id/posts/:postId'}), 'user-post-detail');
  patternList.addPattern(new URLPattern({pathname: '/api/v1/users'}), 'api-users');
  patternList.addPattern(new URLPattern({pathname: '/api/v1/users/:id'}), 'api-user-detail');
  patternList.addPattern(new URLPattern({pathname: '/api/v2/*'}), 'api-v2-catchall');
  patternList.addPattern(new URLPattern({pathname: '/docs/*'}), 'docs-catchall');
  patternList.addPattern(new URLPattern({pathname: '/static/*'}), 'static-files');

  console.log('=== URLPatternList Visualization Demo ===\n');

  // Basic visualization
  console.log('1. Basic Tree Visualization:');
  console.log(URLPatternListVisualizer.visualizeAsText(patternList));
  console.log('\n');

  // Verbose visualization
  console.log('2. Verbose Tree Visualization:');
  console.log(URLPatternListVisualizer.visualizeAsText(patternList, {
    verbose: true,
    showPatterns: true,
  }));
  console.log('\n');

  // Statistics
  console.log('3. Tree Statistics:');
  const stats = URLPatternListVisualizer.getStatistics(patternList);
  console.log(`Total Nodes: ${stats.totalNodes}`);
  console.log(`Total Patterns: ${stats.totalPatterns}`);
  console.log(`Max Depth: ${stats.maxDepth}`);
  console.log(`Average Branching Factor: ${stats.averageBranchingFactor.toFixed(2)}`);
  console.log('Node Types:');
  for (const [type, count] of Object.entries(stats.nodeTypeCount)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('\n');

  // Structured output
  console.log('4. Structured Representation:');
  const structure = URLPatternListVisualizer.visualizeAsStructure(patternList);
  console.log(JSON.stringify(structure, null, 2));
  console.log('\n');

  // Limited depth visualization
  console.log('5. Limited Depth (max 2 levels):');
  console.log(URLPatternListVisualizer.visualizeAsText(patternList, {
    maxDepth: 2,
    showPatterns: false,
  }));
}

/**
 * Demo with different pattern types to show more complex tree structures
 */
function demoComplexPatterns(): void {
  const patternList = new URLPatternList<string>();

  console.log('\n=== Complex Pattern Types Demo ===\n');

  // Add patterns with various modifiers and types
  patternList.addPattern(new URLPattern({pathname: '/optional/:param?'}), 'optional-param');
  patternList.addPattern(new URLPattern({pathname: '/multiple/:param+'}), 'one-or-more-param');
  patternList.addPattern(new URLPattern({pathname: '/zero-or-more/:param*'}), 'zero-or-more-param');
  
  // Patterns with prefix/suffix (if supported by the parser)
  try {
    patternList.addPattern(new URLPattern({pathname: '/files/:filename.txt'}), 'text-files');
    patternList.addPattern(new URLPattern({pathname: '/files/:filename.pdf'}), 'pdf-files');
  } catch (error: any) {
    console.log('Note: Prefix/suffix patterns not supported by URLPattern API');
  }

  // Regex patterns (if supported)
  try {
    patternList.addPattern(new URLPattern({pathname: '/api/v(\\d+)/*'}), 'versioned-api');
  } catch (error: any) {
    console.log('Note: Regex patterns may not be fully supported by URLPattern API');
  }

  console.log('Complex Pattern Tree:');
  console.log(URLPatternListVisualizer.visualizeAsText(patternList, {
    verbose: true,
    showPatterns: true,
  }));
}

// Run the demos if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demoVisualization();
  demoComplexPatterns();
}

export {demoVisualization, demoComplexPatterns};
