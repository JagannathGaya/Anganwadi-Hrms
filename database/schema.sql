-- Convenience: full schema in one file.
-- Equivalent to running migrations/V1__init.sql and V2__seed_admin.sql in order.
\i migrations/V1__init.sql
\i migrations/V2__seed_admin.sql
