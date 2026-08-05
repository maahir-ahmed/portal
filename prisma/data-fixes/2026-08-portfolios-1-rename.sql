-- Departments became portfolios, and every society gained an "Executive" portfolio
-- that executives are assigned to. Run this BEFORE `prisma db push`: without the
-- rename, push drops "Department" and recreates "Portfolio", losing every
-- assignment (it runs with --accept-data-loss in the deploy stack).
-- Idempotent: each step is guarded, so re-running is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'Department') THEN
    ALTER TABLE "Department" RENAME TO "Portfolio";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'SocietyMembership' AND column_name = 'departmentId'
  ) THEN
    ALTER TABLE "SocietyMembership" RENAME COLUMN "departmentId" TO "portfolioId";
  END IF;

  -- One Executive portfolio per society.
  INSERT INTO "Portfolio" ("id", "societyId", "name", "createdAt")
  SELECT gen_random_uuid()::text, s."id", 'Executive', now()
  FROM "Society" s
  WHERE NOT EXISTS (
    SELECT 1 FROM "Portfolio" p WHERE p."societyId" = s."id" AND p."name" = 'Executive'
  );

  -- Put existing executives in it, leaving anyone already assigned alone.
  UPDATE "SocietyMembership" m
  SET "portfolioId" = p."id"
  FROM "Portfolio" p
  WHERE p."societyId" = m."societyId"
    AND p."name" = 'Executive'
    AND m."role" = 'EXECUTIVE'
    AND m."portfolioId" IS NULL;
END $$;
