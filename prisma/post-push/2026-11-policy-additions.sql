-- Treasury's first rule, "get the spend approved in the committee Discord", was part of
-- the policy every society saw. It is one society's process, not a rule of the app, so
-- it moved out of the base policy (src/lib/policies.ts) into society additions. Every
-- society that existed before that keeps it, worded as it was, so nothing changes for
-- them; a society set up afterwards starts without it. Runs once (scripts/post-push.mjs).
INSERT INTO "PolicyAddition" ("id", "societyId", "kind", "text", "updatedAt")
SELECT gen_random_uuid()::text, s."id", 'TREASURY',
       'Get the spend approved in the committee Discord BEFORE you buy. This form is only for claiming the money back.',
       now()
FROM "Society" s
ON CONFLICT ("societyId", "kind") DO NOTHING;
