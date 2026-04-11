/* global __dirname */

const path = require('path');
const { register } = require('esbuild-register/dist/node');

register({
  target: 'node18',
  format: 'cjs',
  hookIgnoreNodeModules: true,
});

const run = () => {
  const modules = [
    {
      name: 'fallback_policy',
      fn: require(path.resolve(__dirname, '../services/customers/trustFallback.testcases.js')).runTrustFallbackSelfTests,
    },
    {
      name: 'champion_challenger_hybrid',
      fn: require(path.resolve(__dirname, '../services/customers/trustChampionModel.testcases.js')).runTrustChampionModelSelfTests,
    },
    {
      name: 'phase8_rollout_guardrails',
      fn: require(path.resolve(__dirname, '../services/customers/trustPhase8.testcases.js')).runTrustPhase8SelfTests,
    },
  ];

  const results = [];
  for (const testModule of modules) {
    const startedAt = Date.now();
    const result = testModule.fn();
    results.push({
      name: testModule.name,
      duration_ms: Date.now() - startedAt,
      result,
    });
  }

  const summary = {
    passed: true,
    executed_at: new Date().toISOString(),
    suites: results,
  };

  console.log(JSON.stringify(summary, null, 2));
};

try {
  run();
} catch (error) {
  console.error(`[FRONTEND_TRUST_TESTS] failed: ${error?.message || error}`);
  process.exit(1);
}