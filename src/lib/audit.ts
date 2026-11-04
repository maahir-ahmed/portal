import { prisma } from "./db";
import type { AuditAction } from "@prisma/client";

export async function createAuditLog({
  societyId,
  userId,
  action,
  entityType,
  entityId,
  metadata,
  ipAddress,
  userAgent,
}: {
  societyId?: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string | number | boolean | null>;
  ipAddress?: string;
  userAgent?: string;
}) {
  return prisma.auditLog.create({
    select: { id: true },
    data: {
      societyId,
      userId,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress,
      userAgent,
    },
  });
}
