const RefreshToken = require('../models/RefreshToken');
const SecurityEvent = require('../models/SecurityEvent');
const User = require('../models/User');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const buildRetentionConfig = () => ({
  cleanupIntervalMinutes: parsePositiveInt(process.env.AUTH_CLEANUP_INTERVAL_MINUTES, 60),
  refreshTokenRetentionDays: parsePositiveInt(process.env.REFRESH_TOKEN_RETENTION_DAYS, 30),
  securityEventRetentionDays: parsePositiveInt(process.env.SECURITY_EVENT_RETENTION_DAYS, 180),
});

const runAuthRetentionCleanup = async () => {
  const config = buildRetentionConfig();
  const now = new Date();
  const revokedTokenCutoff = new Date(now.getTime() - config.refreshTokenRetentionDays * 24 * 60 * 60 * 1000);
  const securityEventCutoff = new Date(now.getTime() - config.securityEventRetentionDays * 24 * 60 * 60 * 1000);

  const [expiredTokens, oldRevokedTokens, expiredUserRefreshState, oldSecurityEvents] = await Promise.all([
    RefreshToken.deleteMany({ expiresAt: { $lte: now } }),
    RefreshToken.deleteMany({
      revokedAt: { $ne: null, $lte: revokedTokenCutoff },
    }),
    User.updateMany(
      {
        refreshTokenExpiresAt: { $ne: null, $lte: now },
      },
      {
        $set: {
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        },
      }
    ),
    SecurityEvent.deleteMany({ occurredAt: { $lte: securityEventCutoff } }),
  ]);

  return {
    expiredRefreshTokensDeleted: Number(expiredTokens?.deletedCount || 0),
    revokedRefreshTokensDeleted: Number(oldRevokedTokens?.deletedCount || 0),
    expiredUserRefreshStateCleared: Number(expiredUserRefreshState?.modifiedCount || 0),
    oldSecurityEventsDeleted: Number(oldSecurityEvents?.deletedCount || 0),
    ranAt: now.toISOString(),
    config,
  };
};

const startAuthRetentionScheduler = ({ logger = console } = {}) => {
  const config = buildRetentionConfig();
  const intervalMs = config.cleanupIntervalMinutes * 60 * 1000;

  const runAndLog = async () => {
    try {
      const summary = await runAuthRetentionCleanup();
      logger.log('[AUTH_CLEANUP] completed', summary);
    } catch (error) {
      logger.error(`[AUTH_CLEANUP] failed: ${error?.message || error}`);
    }
  };

  runAndLog();
  const timer = setInterval(runAndLog, intervalMs);

  return () => {
    clearInterval(timer);
  };
};

module.exports = {
  runAuthRetentionCleanup,
  startAuthRetentionScheduler,
};
