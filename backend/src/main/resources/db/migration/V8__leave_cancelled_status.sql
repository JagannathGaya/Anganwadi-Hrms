-- Allow CANCELLED as a leave status. Users can cancel their own pending
-- requests; the row stays in the table for an audit trail (admins still see
-- it) rather than being hard-deleted.
ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_status_check;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED'));
