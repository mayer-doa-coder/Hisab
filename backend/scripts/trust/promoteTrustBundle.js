const {
  PATHS,
  nowIso,
  readJson,
  writeJson,
  loadRegistry,
  saveRegistry,
  appendRegistryEvent,
} = require('./trustOptimizationUtils');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    bundleVersion: '',
    actor: process.env.TRUST_PROMOTION_ACTOR || 'ops_automation',
    reason: 'manual_promotion',
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--bundle' && args[index + 1]) {
      parsed.bundleVersion = String(args[index + 1]).trim();
      index += 1;
      continue;
    }

    if (token === '--actor' && args[index + 1]) {
      parsed.actor = String(args[index + 1]).trim() || parsed.actor;
      index += 1;
      continue;
    }

    if (token === '--reason' && args[index + 1]) {
      parsed.reason = String(args[index + 1]).trim() || parsed.reason;
      index += 1;
    }
  }

  return parsed;
};

const appendAudit = (entry) => {
  const current = readJson(PATHS.promotionAuditLog, []);
  const next = Array.isArray(current) ? [...current, entry] : [entry];
  while (next.length > 1000) {
    next.shift();
  }
  writeJson(PATHS.promotionAuditLog, next);
};

const normalizeActiveBundle = ({ bundleVersion, bundle }) => {
  const championPath = bundle?.artifacts?.champion_model?.path || bundle?.champion?.path || null;
  const challengerPath = bundle?.artifacts?.challenger_model?.path || bundle?.challenger?.path || null;
  const segmentPath = bundle?.artifacts?.segment_decisions?.path || null;

  return {
    bundle_version: bundleVersion,
    model_version_label: bundle?.model_version_label || null,
    type: bundle?.type || null,
    champion_path: championPath,
    challenger_path: challengerPath,
    segment_decisions_path: segmentPath,
    promoted_at: nowIso(),
  };
};

const main = () => {
  const args = parseArgs();
  if (!args.bundleVersion) {
    throw new Error('Missing required --bundle <semver> argument.');
  }

  const registry = loadRegistry();
  const bundle = registry?.bundles?.[args.bundleVersion];
  if (!bundle) {
    throw new Error(`Bundle ${args.bundleVersion} not found.`);
  }

  const status = String(bundle?.deployment_status || bundle?.lifecycle_state || '').toLowerCase();
  if (status !== 'validated_bundle') {
    throw new Error(`Bundle ${args.bundleVersion} is not validated. Current status=${status || 'unknown'}`);
  }

  const previousActive = registry.active_bundle || null;
  const promotedAt = nowIso();

  const activeBundle = normalizeActiveBundle({
    bundleVersion: args.bundleVersion,
    bundle,
  });
  activeBundle.promoted_at = promotedAt;

  const nextHistory = Array.isArray(registry.active_history) ? [...registry.active_history] : [];
  if (previousActive?.bundle_version) {
    nextHistory.push({
      ...previousActive,
      demoted_at: promotedAt,
      demotion_reason: 'new_bundle_promoted',
    });
  }
  while (nextHistory.length > 100) {
    nextHistory.shift();
  }

  if (previousActive?.bundle_version && registry.bundles[previousActive.bundle_version]) {
    registry.bundles[previousActive.bundle_version] = {
      ...registry.bundles[previousActive.bundle_version],
      deployment_status: 'validated_bundle',
      lifecycle_state: 'validated_bundle',
    };
  }

  registry.bundles[args.bundleVersion] = {
    ...bundle,
    deployment_status: 'active_bundle',
    lifecycle_state: 'active_bundle',
    activated_at: promotedAt,
  };

  registry.active_bundle = {
    bundle_version: args.bundleVersion,
    model_version_label: bundle?.model_version_label || null,
    champion_version: args.bundleVersion,
    challenger_version: args.bundleVersion,
    promotion_decision_version: args.bundleVersion,
    promoted_at: promotedAt,
  };
  registry.active_history = nextHistory;

  const nextRegistry = appendRegistryEvent(registry, {
    type: 'BUNDLE_PROMOTED_TO_ACTIVE',
    bundle_version: args.bundleVersion,
    actor: args.actor,
    reason: args.reason,
    previous_active_bundle: previousActive?.bundle_version || null,
    promoted_at: promotedAt,
  });
  saveRegistry(nextRegistry);
  writeJson(PATHS.activeBundle, activeBundle);

  const summary = {
    promoted: true,
    bundle_version: args.bundleVersion,
    actor: args.actor,
    reason: args.reason,
    previous_active_bundle: previousActive?.bundle_version || null,
    promoted_at: promotedAt,
    active_bundle_artifact: PATHS.activeBundle,
  };

  appendAudit({
    timestamp: promotedAt,
    action: 'PROMOTE_BUNDLE',
    ...summary,
  });

  console.log(JSON.stringify(summary, null, 2));
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[TRUST_PROMOTE_BUNDLE] failed: ${error?.message || error}`);
    process.exit(1);
  }
}