const AuditLog = require('../../models/AuditLog');

const logAudit = async ({
  userId,
  entityType,
  entityId = null,
  action,
  metadata = null,
  source = 'api',
  occurredAt = new Date(),
}) => {
  if (!userId || !entityType || !action) {
    return null;
  }

  try {
    return await AuditLog.create({
      userId,
      entityType,
      entityId,
      action,
      metadata,
      source,
      occurredAt,
    });
  } catch {
    return null;
  }
};

module.exports = {
  logAudit,
};
