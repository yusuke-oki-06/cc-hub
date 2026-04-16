-- Allow schedules with NULL cron_expr for manual-only routines.
-- A NULL cron_expr means the routine is not scheduled by node-cron and
-- must be fired explicitly via POST /api/schedules/:id/run.

ALTER TABLE schedules ALTER COLUMN cron_expr DROP NOT NULL;
