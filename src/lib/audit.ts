import { prisma } from "./db";
import type { AuditAction } from "@prisma/client";

/**
 * For changes to someone's own account (password, email, bank details), which belong
 * to no one society: logged under each society they're active in, so every audit log
 * that could need it shows it.
 */
export async function auditAccountChange(userId: string, entityType: string, metadata?: Record<string, string | number | boolean | null>) {
  const memberships = await prisma.societyMembership.findMany({ where: { userId, isActive: true }, select: { societyId: true } });
  await prisma.auditLog.createMany({
    data: memberships.map((m) => ({ societyId: m.societyId, userId, action: "UPDATE" as const, entityType, entityId: userId, metadata })),
  });
}

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
