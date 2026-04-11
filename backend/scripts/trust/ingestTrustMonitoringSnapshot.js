const path = require('path');

const { readJson } = require('./trustOptimizationUtils');
const { writeMonitoringSnapshot } = require('../../services/trustMonitoringArtifactService');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    inputPath: '',
    source: 'manual_ingestion',
    outputPath: '',
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--input' && args[index + 1]) {
      parsed.inputPath = args[index + 1];
      index += 1;
      continue;
    }

    if (token === '--source' && args[index + 1]) {
      parsed.source = args[index + 1];
      index += 1;
      continue;
    }

    if (token === '--output' && args[index + 1]) {
      parsed.outputPath = args[index + 1];
      index += 1;
    }
  }

  return parsed;
};

const main = () => {
  const args = parseArgs();
  if (!args.inputPath) {
    throw new Error('Missing required --input <path-to-snapshot.json> argument.');
  }

  const resolvedInputPath = path.resolve(args.inputPath);
  const payload = readJson(resolvedInputPath, null);
  if (!payload) {
    throw new Error(`Unable to parse monitoring snapshot JSON from ${resolvedInputPath}`);
  }

  const result = writeMonitoringSnapshot({
    snapshot: payload?.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : payload,
    source: args.source || 'manual_ingestion',
    outputPath: args.outputPath ? path.resolve(args.outputPath) : undefined,
  });

  console.log(JSON.stringify({
    input_path: resolvedInputPath,
    output_path: result.output_path,
    source: result.snapshot.source,
    generated_at: result.snapshot.generated_at,
    ingested_at: result.snapshot.ingested_at,
    request_count: result.snapshot.request_count,
    fallback_rate: result.snapshot.fallback_rate,
    error_rate: result.snapshot.error_rate,
    prediction_drift_psi: result.snapshot.prediction_drift_psi,
  }, null, 2));
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[TRUST_MONITORING_INGEST] failed: ${error?.message || error}`);
    process.exit(1);
  }
}