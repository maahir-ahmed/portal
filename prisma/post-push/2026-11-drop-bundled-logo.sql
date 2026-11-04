-- public/secsoc-logo.png left the repo: a society still pointing at it would show a
-- broken image, so it shows its name instead. Upload a logo in Settings to replace it.
UPDATE "Society" SET "logoUrl" = NULL WHERE "logoUrl" = '/secsoc-logo.png';
