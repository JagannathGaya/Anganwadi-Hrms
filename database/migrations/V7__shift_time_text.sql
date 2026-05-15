-- Mirrors backend/src/main/resources/db/migration/V7__shift_time_text.sql
ALTER TABLE shifts ALTER COLUMN start_time TYPE VARCHAR(8) USING start_time::text;
ALTER TABLE shifts ALTER COLUMN end_time   TYPE VARCHAR(8) USING end_time::text;

UPDATE shifts SET start_time = '09:00', end_time = '15:00' WHERE name = 'Morning shift';
UPDATE shifts SET start_time = '12:00', end_time = '18:00' WHERE name = 'Afternoon shift';
UPDATE shifts SET start_time = '09:00', end_time = '17:00' WHERE name = 'Full day';
