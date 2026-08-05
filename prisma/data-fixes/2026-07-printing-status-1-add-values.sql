-- Adds the new PrintingStatus values ahead of `prisma db push` so existing rows
-- can be remapped (see ...-2-remap.sql) before db push drops the old APPROVED
-- value. Idempotent: no-ops once the values exist, and skips entirely on a
-- fresh database where the type doesn't exist yet.
-- NOTE: must run in its own `prisma db execute`; new enum values can't be
-- used in the same transaction that adds them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrintingStatus') THEN
    EXECUTE 'ALTER TYPE "PrintingStatus" ADD VALUE IF NOT EXISTS ''PENDING_APPROVAL''';
    EXECUTE 'ALTER TYPE "PrintingStatus" ADD VALUE IF NOT EXISTS ''PENDING_ARC_SUBMISSION''';
    EXECUTE 'ALTER TYPE "PrintingStatus" ADD VALUE IF NOT EXISTS ''READY_FOR_PICKUP''';
  END IF;
END $$;
