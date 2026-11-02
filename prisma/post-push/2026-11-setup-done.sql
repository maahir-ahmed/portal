-- Societies that existed before the setup wizard are already set up: never send their
-- executives through it. Runs once; societies created afterwards start at step 0.
UPDATE "Society" SET "setupCompletedAt" = now() WHERE "setupCompletedAt" IS NULL;
