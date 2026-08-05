-- Spending approval moved to the committee Discord, so the in-app approval flow is
-- gone: TreasuryStatus loses AWAITING_APPROVAL and the TreasuryApproval table is
-- dropped. Run this BEFORE `prisma db push`, which removes the enum value.
--   Claims that were awaiting approval become REIMBURSEMENT_PENDING (they were
--   approved on Discord or they weren't; either way the website's job now is to
--   record the payout, and an exec can reject one from the claim page).
-- Guarded on the legacy value still existing, so re-running is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TreasuryStatus' AND e.enumlabel = 'AWAITING_APPROVAL'
  ) THEN
    EXECUTE 'UPDATE "TreasuryRequest" SET status = ''REIMBURSEMENT_PENDING'' WHERE status = ''AWAITING_APPROVAL''';
  END IF;
END $$;
