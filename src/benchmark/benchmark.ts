/**
 * @fileoverview
 *
 * URLPatternList Benchmark
 *
 * Benchmarks the optimized URLPatternList against the naive linear
 * implementation to demonstrate the performance benefits of the prefix tree
 * optimization.
 *
 * This benchmark creates scenarios with varying numbers of patterns and tests
 * different types of pattern matching workloads to show where the optimization
 * provides the most benefit.
 */

import {URLPatternList} from '../index.js';
import {NaiveURLPatternList} from '../test/naive-url-pattern-list.js';

interface BenchmarkResult {
  name: string;
  opsPerSecond: number;
  avgTimeMs: number;
  totalTimeMs: number;
}

interface URLPatternListLike<T> {
  addPattern(pattern: URLPattern, value: T): void;
  match(
    path: string,
    baseUrl?: string,
  ): {result: URLPatternResult; value: T} | null;
}

/**
 * Run benchmarks for both implementations in round-robin fashion.
 */
function benchmarkRoundRobin(
  optimizedFn: () => void,
  naiveFn: () => void,
  iterations: number = 10000,
): {optimized: BenchmarkResult; naive: BenchmarkResult} {
  // Warm up both functions
  const warmupIterations = Math.min(200, iterations / 10);
  for (let i = 0; i < warmupIterations; i++) {
    optimizedFn();
    naiveFn();
  }

  let optimizedTotalTime = 0;
  let naiveTotalTime = 0;

  // Run alternating rounds
  for (let round = 0; round < iterations; round++) {
    // Run optimized implementation
    const optimizedStart = performance.now();
    optimizedFn();
    const optimizedEnd = performance.now();
    optimizedTotalTime += optimizedEnd - optimizedStart;

    // Run naive implementation
    const naiveStart = performance.now();
    naiveFn();
    const naiveEnd = performance.now();
    naiveTotalTime += naiveEnd - naiveStart;
  }

  const optimizedAvgTime = optimizedTotalTime / iterations;
  const naiveAvgTime = naiveTotalTime / iterations;

  return {
    optimized: {
      name: 'URLPatternList (optimized)',
      opsPerSecond: 1000 / optimizedAvgTime,
      avgTimeMs: optimizedAvgTime,
      totalTimeMs: optimizedTotalTime,
    },
    naive: {
      name: 'NaiveURLPatternList (linear)',
      opsPerSecond: 1000 / naiveAvgTime,
      avgTimeMs: naiveAvgTime,
      totalTimeMs: naiveTotalTime,
    },
  };
}

/**
 * Generate realistic URL patterns for testing.
 *
 * Creates a mix of patterns that simulate real-world API routing scenarios:
 * - 10% Fixed patterns: `/api/v1/users`, `/v2/posts/create`
 * - 50% Single parameter patterns: `/api/v1/users/:id`, `/v2/posts/:id/edit`
 * - 25% Multiple parameter patterns: `/api/v1/users/:id/posts/:subId`
 * - 10% Wildcard patterns: `/api/v1/files/*`
 * - 5% Complex patterns with regex: `/api/v1/products/:id(\\d+)/data`
 *
 * This distribution tests prefix tree sharing effectiveness since many patterns
 * share common prefixes like `/api/v1`, `/api/v2`, etc.
 */
function generatePatterns(
  count: number,
): Array<{pattern: string; value: string}> {
  const patterns: Array<{pattern: string; value: string}> = [];

  // Common API patterns
  const apiPrefixes = ['/api/v1', '/api/v2', '/v1', '/v2', ''];
  const resources = [
    'users',
    'posts',
    'comments',
    'products',
    'orders',
    'categories',
    'articles',
    'reviews',
    'photos',
    'videos',
    'files',
    'documents',
    'projects',
    'tasks',
    'teams',
    'organizations',
    'groups',
    'events',
    'notifications',
    'messages',
    'reports',
    'analytics',
    'settings',
  ];

  const actions = ['', '/edit', '/delete', '/create', '/list', '/search'];

  // Generate base patterns
  let patternIndex = 0;

  // Fixed patterns (10% of patterns)
  for (let i = 0; i < Math.floor(count * 0.1) && patternIndex < count; i++) {
    const prefix = apiPrefixes[i % apiPrefixes.length];
    const resource = resources[i % resources.length];
    const action = actions[i % actions.length];
    patterns.push({
      pattern: `${prefix}/${resource}${action}`,
      value: `fixed-${patternIndex}`,
    });
    patternIndex++;
  }

  // Single parameter patterns (50% of patterns)
  for (let i = 0; i < Math.floor(count * 0.5) && patternIndex < count; i++) {
    const prefix = apiPrefixes[i % apiPrefixes.length];
    const resource = resources[i % resources.length];
    const action = actions[i % actions.length];
    patterns.push({
      pattern: `${prefix}/${resource}/:id${action}`,
      value: `param-${patternIndex}`,
    });
    patternIndex++;
  }

  // Multiple parameter patterns (25% of patterns)
  for (let i = 0; i < Math.floor(count * 0.25) && patternIndex < count; i++) {
    const prefix = apiPrefixes[i % apiPrefixes.length];
    const resource1 = resources[i % resources.length];
    const resource2 = resources[(i + 1) % resources.length];
    patterns.push({
      pattern: `${prefix}/${resource1}/:id/${resource2}/:subId`,
      value: `multi-param-${patternIndex}`,
    });
    patternIndex++;
  }

  // Wildcard patterns (10% of patterns)
  for (let i = 0; i < Math.floor(count * 0.1) && patternIndex < count; i++) {
    const prefix = apiPrefixes[i % apiPrefixes.length];
    const resource = resources[i % resources.length];
    patterns.push({
      pattern: `${prefix}/${resource}/*`,
      value: `wildcard-${patternIndex}`,
    });
    patternIndex++;
  }

  // Fill remaining with complex patterns (5% of patterns)
  while (patternIndex < count) {
    const prefix = apiPrefixes[patternIndex % apiPrefixes.length];
    const resource = resources[patternIndex % resources.length];
    patterns.push({
      pattern: `${prefix}/${resource}/:id(\\d+)/data`,
      value: `complex-${patternIndex}`,
    });
    patternIndex++;
  }

  return patterns;
}

/**
 * Generate test paths that will match various patterns
 */
function generateTestPaths(
  patterns: Array<{pattern: string; value: string}>,
): string[] {
  const paths: string[] = [];

  // Generate paths that match the patterns
  for (const patternDef of patterns.slice(0, Math.min(50, patterns.length))) {
    const pattern = patternDef.pattern;

    if (pattern.includes(':id(\\d+)')) {
      paths.push(pattern.replace(':id(\\d+)', '123'));
    } else if (pattern.includes(':id')) {
      paths.push(pattern.replace(':id', '42'));
    } else if (pattern.includes(':subId')) {
      paths.push(pattern.replace(':subId', '99'));
    } else if (pattern.includes('*')) {
      paths.push(pattern.replace('*', 'some/nested/path'));
    } else {
      paths.push(pattern);
    }
  }

  // Add some paths that won't match anything (for testing miss scenarios)
  paths.push('/nonexistent/path');
  paths.push('/another/missing/route');
  paths.push('/api/unknown/resource');

  return paths;
}

/**
 * Setup a list with the given patterns
 */
function setupList<T extends URLPatternListLike<string>>(
  listFactory: () => T,
  patterns: Array<{pattern: string; value: string}>,
): T {
  const list = listFactory();
  for (const {pattern, value} of patterns) {
    list.addPattern(new URLPattern({pathname: pattern}), value);
  }
  return list;
}

/**
 * Run benchmarks for a specific pattern count
 */
function runBenchmarkSet(patternCount: number) {
  console.log(`\n📊 Benchmarking with ${patternCount} patterns`);
  console.log('='.repeat(50));

  const patterns = generatePatterns(patternCount);
  const testPaths = generateTestPaths(patterns);

  // Setup both implementations
  const optimizedList = setupList(() => new URLPatternList<string>(), patterns);
  const naiveList = setupList(
    () => new NaiveURLPatternList<string>(),
    patterns,
  );

  const benchmarkIterations = Math.max(1000, Math.floor(50000 / patternCount));

  // Create benchmark functions
  const optimizedFn = () => {
    const path = testPaths[Math.floor(Math.random() * testPaths.length)];
    optimizedList.match(path, 'https://example.com');
  };

  const naiveFn = () => {
    const path = testPaths[Math.floor(Math.random() * testPaths.length)];
    naiveList.match(path, 'https://example.com');
  };

  // Run round-robin benchmark
  const results = benchmarkRoundRobin(
    optimizedFn,
    naiveFn,
    benchmarkIterations,
  );

  const optimizedResult = results.optimized;
  const naiveResult = results.naive;

  // Calculate speedup
  const speedup = optimizedResult.opsPerSecond / naiveResult.opsPerSecond;

  console.log(
    `Optimized:  ${optimizedResult.opsPerSecond.toFixed(0).padStart(8)} ops/sec (${optimizedResult.avgTimeMs.toFixed(3)}ms avg)`,
  );
  console.log(
    `Naive:      ${naiveResult.opsPerSecond.toFixed(0).padStart(8)} ops/sec (${naiveResult.avgTimeMs.toFixed(3)}ms avg)`,
  );
  console.log(`Speedup:    ${speedup.toFixed(2)}x faster`);

  return {optimized: optimizedResult, naive: naiveResult, speedup};
}

/**
 * Test that both implementations produce the same results
 */
function validateCorrectness(patternCount: number = 100) {
  console.log('🔍 Validating correctness...');

  const patterns = generatePatterns(patternCount);
  const testPaths = generateTestPaths(patterns);

  const optimizedList = setupList(() => new URLPatternList<string>(), patterns);
  const naiveList = setupList(
    () => new NaiveURLPatternList<string>(),
    patterns,
  );

  let mismatches = 0;
  for (const path of testPaths) {
    const optimizedResult = optimizedList.match(path, 'https://example.com');
    const naiveResult = naiveList.match(path, 'https://example.com');

    // Compare results
    if ((optimizedResult === null) !== (naiveResult === null)) {
      console.error(`❌ Mismatch for path: ${path}`);
      console.error(
        `   Optimized: ${optimizedResult ? optimizedResult.value : 'null'}`,
      );
      console.error(`   Naive: ${naiveResult ? naiveResult.value : 'null'}`);
      mismatches++;
    } else if (
      optimizedResult &&
      naiveResult &&
      optimizedResult.value !== naiveResult.value
    ) {
      console.error(`❌ Value mismatch for path: ${path}`);
      console.error(`   Optimized: ${optimizedResult.value}`);
      console.error(`   Naive: ${naiveResult.value}`);
      mismatches++;
    }
  }

  if (mismatches === 0) {
    console.log('✅ All results match - implementations are equivalent');
  } else {
    console.error(`❌ Found ${mismatches} mismatches`);
    process.exit(1);
  }
}

/**
 * Benchmark pattern addition performance
 */
function benchmarkPatternAddition() {
  console.log('\n🔧 Benchmarking Pattern Addition');
  console.log('='.repeat(50));

  const patternCounts = [100, 500, 1000];

  for (const count of patternCounts) {
    const patterns = generatePatterns(count);

    // Create benchmark functions
    const optimizedFn = () => {
      const list = new URLPatternList<string>();
      for (const {pattern, value} of patterns) {
        list.addPattern(new URLPattern({pathname: pattern}), value);
      }
    };

    const naiveFn = () => {
      const list = new NaiveURLPatternList<string>();
      for (const {pattern, value} of patterns) {
        list.addPattern(new URLPattern({pathname: pattern}), value);
      }
    };

    // Run round-robin benchmark with fewer iterations for setup benchmarks
    const results = benchmarkRoundRobin(optimizedFn, naiveFn, 20);

    const optimizedResult = results.optimized;
    const naiveResult = results.naive;
    const speedup = naiveResult.avgTimeMs / optimizedResult.avgTimeMs;

    console.log(`\n${count} patterns:`);
    console.log(`  Optimized: ${optimizedResult.avgTimeMs.toFixed(2)}ms`);
    console.log(`  Naive:     ${naiveResult.avgTimeMs.toFixed(2)}ms`);
    console.log(
      `  Difference: ` + (speedup >= 1)
        ? speedup.toFixed(2) + 'x faster (naive)'
        : (1 / speedup).toFixed(2) + 'x slower (naive)',
    );
  }
}

console.log('🚀 URLPatternList Performance Benchmark');
console.log('==========================================');

// Validate correctness first
validateCorrectness();

// Benchmark pattern addition
benchmarkPatternAddition();

// Run matching benchmarks with different pattern counts
const patternCounts = [10, 50, 100, 500, 1000, 2000];
const results: Array<{count: number; speedup: number}> = [];

for (const count of patternCounts) {
  const result = runBenchmarkSet(count);
  results.push({count, speedup: result.speedup});
}

// Summary
console.log('\n📈 Performance Summary');
console.log('='.repeat(50));
console.log('Pattern Count | Speedup');
console.log('------------- | -------');
for (const {count, speedup} of results) {
  console.log(`${count.toString().padStart(11)} | ${speedup.toFixed(2)}x`);
}

const avgSpeedup =
  results.reduce((sum, r) => sum + r.speedup, 0) / results.length;
console.log(`\nAverage speedup: ${avgSpeedup.toFixed(2)}x`);
