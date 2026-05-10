const AuditLog = require('../../models/AuditLog');

const logAudit = async ({
  userId,
  tenantUserId = null,
  actorUserId = null,
  branchId = null,
  entityType,
  entityId = null,
  action,
  metadata = null,
  affectedEntity = null,
  source = 'api',
  occurredAt = new Date(),
}) => {
  if (!userId || !entityType || !action) {
    return null;
  }

  try {
    return await AuditLog.create({
      userId,
      tenantUserId: tenantUserId || userId,
      actorUserId: actorUserId || null,
      branchId: branchId || null,
      entityType,
      entityId,
      action,
      metadata,
      affectedEntity,
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
