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
    targetBundleVersion: '',
    actor: process.env.TRUST_PROMOTION_ACTOR || 'ops_automation',
    reason: 'manual_rollback',
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--target' && args[index + 1]) {
      parsed.targetBundleVersion = String(args[index + 1]).trim();
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

const resolveRollbackTarget = ({ registry, explicitTarget }) => {
  if (explicitTarget) {
    return explicitTarget;
  }

  const history = Array.isArray(registry?.active_history) ? registry.active_history : [];
  const last = history.length ? history[history.length - 1] : null;
  return last?.bundle_version || '';
};

const main = () => {
  const args = parseArgs();
  const registry = loadRegistry();

  const currentActiveVersion = registry?.active_bundle?.bundle_version || null;
  const rollbackTargetVersion = resolveRollbackTarget({
    registry,
    explicitTarget: args.targetBundleVersion,
  });

  if (!rollbackTargetVersion) {
    throw new Error('No rollback target found. Provide --target <bundle-version> or ensure active history exists.');
  }

  const historyEntries = Array.isArray(registry?.active_history) ? registry.active_history : [];
  const historyEntry = historyEntries.find((entry) => entry?.bundle_version === rollbackTargetVersion) || null;
  const hasBundle = Boolean(registry?.bundles?.[rollbackTargetVersion]);
  if (!hasBundle && !historyEntry) {
    throw new Error(`Rollback target bundle ${rollbackTargetVersion} not found.`);
  }

  if (currentActiveVersion === rollbackTargetVersion) {
    throw new Error(`Bundle ${rollbackTargetVersion} is already active.`);
  }

  const rollbackAt = nowIso();

  if (currentActiveVersion && registry.bundles[currentActiveVersion]) {
    registry.bundles[currentActiveVersion] = {
      ...registry.bundles[currentActiveVersion],
      deployment_status: 'validated_bundle',
      lifecycle_state: 'validated_bundle',
      deactivated_at: rollbackAt,
    };
  }

  const targetBundle = hasBundle ? registry.bundles[rollbackTargetVersion] : null;
  if (hasBundle) {
    registry.bundles[rollbackTargetVersion] = {
      ...targetBundle,
      deployment_status: 'active_bundle',
      lifecycle_state: 'active_bundle',
      activated_at: rollbackAt,
    };
  }

  registry.active_bundle = {
    bundle_version: rollbackTargetVersion,
    model_version_label: targetBundle?.model_version_label || historyEntry?.model_version_label || null,
    champion_version: rollbackTargetVersion,
    challenger_version: rollbackTargetVersion,
    promotion_decision_version: rollbackTargetVersion,
    promoted_at: rollbackAt,
    rollback: true,
  };

  const nextRegistry = appendRegistryEvent(registry, {
    type: 'BUNDLE_ROLLED_BACK',
    from_bundle_version: currentActiveVersion,
    to_bundle_version: rollbackTargetVersion,
    actor: args.actor,
    reason: args.reason,
    rolled_back_at: rollbackAt,
  });
  saveRegistry(nextRegistry);

  writeJson(PATHS.activeBundle, {
    bundle_version: rollbackTargetVersion,
    model_version_label: targetBundle?.model_version_label || historyEntry?.model_version_label || null,
    type: targetBundle?.type || historyEntry?.type || null,
    champion_path: targetBundle?.artifacts?.champion_model?.path || targetBundle?.champion?.path || historyEntry?.champion_path || null,
    challenger_path: targetBundle?.artifacts?.challenger_model?.path || targetBundle?.challenger?.path || historyEntry?.challenger_path || null,
    segment_decisions_path: targetBundle?.artifacts?.segment_decisions?.path || historyEntry?.segment_decisions_path || null,
    promoted_at: rollbackAt,
    rollback: true,
    legacy_history_rollback: !hasBundle,
  });

  const summary = {
    rolled_back: true,
    from_bundle_version: currentActiveVersion,
    to_bundle_version: rollbackTargetVersion,
    actor: args.actor,
    reason: args.reason,
    rolled_back_at: rollbackAt,
  };

  appendAudit({
    timestamp: rollbackAt,
    action: 'ROLLBACK_BUNDLE',
    ...summary,
  });

  console.log(JSON.stringify(summary, null, 2));
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[TRUST_ROLLBACK_BUNDLE] failed: ${error?.message || error}`);
    process.exit(1);
  }
}