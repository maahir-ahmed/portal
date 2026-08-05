-- Rebuilds titles and portfolios around the 9 committee portfolios, where a
-- member's portfolio follows their title. Run BEFORE `prisma db push` (which adds
-- SocietyTitle.portfolioId and Portfolio.sortOrder): the inserts below need those
-- columns, so run it again straight after the push if the first run skipped them.
-- Every step is guarded, so re-running is safe.
--
-- STEP 0 first, always: it snapshots who currently holds which title, because the
-- rest of this file rewrites the title list and recomputes every assignment.

-- ── 0. Backup ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "_backup_2026_08_membership_titles" AS
SELECT m."id"          AS membership_id,
       m."userId"      AS user_id,
       u."email"       AS email,
       u."name"        AS user_name,
       m."societyId"   AS society_id,
       m."role"        AS role,
       m."title"       AS title,
       m."portfolioId" AS portfolio_id,
       now()           AS backed_up_at
FROM "SocietyMembership" m
JOIN "User" u ON u."id" = m."userId";

CREATE TABLE IF NOT EXISTS "_backup_2026_08_society_titles" AS
SELECT t.*, now() AS backed_up_at FROM "SocietyTitle" t;

-- ── 1. Portfolios, in committee order ────────────────────────────────────────
DO $$
DECLARE
  portfolios text[] := ARRAY['Careers','Conferences','Creatives','CTF','Education','Marketing','Projects','Socials','Media'];
  society RECORD;
  i int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Portfolio' AND column_name = 'sortOrder'
  ) THEN
    RAISE NOTICE 'Portfolio.sortOrder missing: run prisma db push, then re-run this file.';
    RETURN;
  END IF;

  FOR society IN SELECT "id" FROM "Society" LOOP
    FOR i IN 1 .. array_length(portfolios, 1) LOOP
      INSERT INTO "Portfolio" ("id", "societyId", "name", "sortOrder", "createdAt")
      VALUES (gen_random_uuid()::text, society."id", portfolios[i], i, now())
      ON CONFLICT ("societyId", "name") DO UPDATE SET "sortOrder" = EXCLUDED."sortOrder";
    END LOOP;

    -- Executives no longer sit in a portfolio, so the old Executive one goes.
    UPDATE "SocietyMembership" m SET "portfolioId" = NULL
    WHERE m."societyId" = society."id"
      AND m."portfolioId" IN (SELECT "id" FROM "Portfolio" WHERE "societyId" = society."id" AND "name" = 'Executive');
    DELETE FROM "Portfolio" WHERE "societyId" = society."id" AND "name" = 'Executive';
  END LOOP;
END $$;

-- ── 2. Titles: one director + one subcom per portfolio, plus the exec titles ──
DO $$
DECLARE
  -- portfolio name, title prefix (Creatives uses "Creative")
  areas text[][] := ARRAY[
    ARRAY['Careers','Careers'], ARRAY['Conferences','Conferences'], ARRAY['Creatives','Creative'],
    ARRAY['CTF','CTF'], ARRAY['Education','Education'], ARRAY['Marketing','Marketing'],
    ARRAY['Projects','Projects'], ARRAY['Socials','Socials'], ARRAY['Media','Media']
  ];
  exec_titles text[] := ARRAY['President','Vice President','Secretary','Treasurer','Arc Delegate','Welfare Officer'];
  society RECORD;
  portfolio_id text;
  i int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'SocietyTitle' AND column_name = 'portfolioId'
  ) THEN
    RAISE NOTICE 'SocietyTitle.portfolioId missing: run prisma db push, then re-run this file.';
    RETURN;
  END IF;

  FOR society IN SELECT "id" FROM "Society" LOOP
    FOR i IN 1 .. array_length(areas, 1) LOOP
      SELECT "id" INTO portfolio_id FROM "Portfolio"
      WHERE "societyId" = society."id" AND "name" = areas[i][1];

      INSERT INTO "SocietyTitle" ("id", "societyId", "portfolioId", "name", "roleLevel", "sortOrder", "createdAt")
      VALUES (gen_random_uuid()::text, society."id", portfolio_id, areas[i][2] || ' Director', 'DIRECTOR', i, now())
      ON CONFLICT ("societyId", "name", "roleLevel") DO UPDATE
        SET "portfolioId" = EXCLUDED."portfolioId", "sortOrder" = EXCLUDED."sortOrder";

      INSERT INTO "SocietyTitle" ("id", "societyId", "portfolioId", "name", "roleLevel", "sortOrder", "createdAt")
      VALUES (gen_random_uuid()::text, society."id", portfolio_id, areas[i][2] || ' Subcom', 'SUBCOMMITTEE', i, now())
      ON CONFLICT ("societyId", "name", "roleLevel") DO UPDATE
        SET "portfolioId" = EXCLUDED."portfolioId", "sortOrder" = EXCLUDED."sortOrder";
    END LOOP;

    FOR i IN 1 .. array_length(exec_titles, 1) LOOP
      INSERT INTO "SocietyTitle" ("id", "societyId", "portfolioId", "name", "roleLevel", "sortOrder", "createdAt")
      VALUES (gen_random_uuid()::text, society."id", NULL, exec_titles[i], 'EXECUTIVE', i, now())
      ON CONFLICT ("societyId", "name", "roleLevel") DO UPDATE SET "portfolioId" = NULL;
    END LOOP;
  END LOOP;
END $$;

-- ── 3. Recompute every assignment from the member's title ────────────────────
-- Executives hold no portfolio. Anyone whose old title is not in the new list ends
-- up unassigned; "_backup_2026_08_membership_titles" is the record of what they had.
UPDATE "SocietyMembership" m
SET "portfolioId" = CASE
  WHEN m."role" = 'EXECUTIVE' THEN NULL
  ELSE (
    SELECT t."portfolioId" FROM "SocietyTitle" t
    WHERE t."societyId" = m."societyId" AND t."name" = m."title"
    LIMIT 1
  )
END;
