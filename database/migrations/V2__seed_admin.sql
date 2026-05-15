-- The backend seeds the default admin and demo employee on first boot using
-- BCryptPasswordEncoder so the hashes are guaranteed valid (see
-- backend/src/main/java/.../config/DataSeeder.java).
--
-- This migration is intentionally a no-op; it exists so Flyway has a stable
-- versioned chain and so future seed-data migrations can be appended.
SELECT 1;
