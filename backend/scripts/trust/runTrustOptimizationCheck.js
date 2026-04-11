const { runTrustOptimizationCheck } = require('../../services/trustOptimizationService');

const main = () => {
  const summary = runTrustOptimizationCheck({ logger: console });
  console.log(JSON.stringify(summary, null, 2));
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[TRUST_OPTIMIZATION_CHECK] failed: ${error?.message || error}`);
    process.exit(1);
  }
}
