package com.anganwadi.hrms.config_org;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GeofenceTest {

    private static OrgConfig fence(double lat, double lng, int radius) {
        OrgConfig c = new OrgConfig();
        c.setId((short) 1);
        c.setGeofenceLat(lat);
        c.setGeofenceLng(lng);
        c.setGeofenceRadiusM(radius);
        c.setDailyHours(new BigDecimal("6.00"));
        c.setAnnualHolidayQuota(24);
        c.setCurrency("INR");
        return c;
    }

    @Test
    void distanceIsApproximatelyZeroForSamePoint() {
        double d = Geofence.distanceMeters(12.9716, 77.5946, 12.9716, 77.5946);
        assertTrue(d < 0.01, "expected ~0 m, got " + d);
    }

    @Test
    void pointWithinRadius_isInside() {
        // Move ~50 m east of (12.9716, 77.5946) — at this latitude
        // 1 degree of longitude ≈ 108 km, so 50 m ≈ 0.000463 deg.
        OrgConfig cfg = fence(12.9716, 77.5946, 200);
        assertTrue(Geofence.isInside(cfg, 12.9716, 77.5946 + 0.000463));
    }

    @Test
    void pointBeyondRadius_isOutside() {
        OrgConfig cfg = fence(12.9716, 77.5946, 100);
        // ~5 km east
        assertFalse(Geofence.isInside(cfg, 12.9716, 77.5946 + 0.05));
    }

    @Test
    void noFenceConfigured_alwaysInside() {
        OrgConfig cfg = new OrgConfig();
        cfg.setGeofenceRadiusM(200);
        // lat/lng null
        assertTrue(Geofence.isInside(cfg, 0, 0));
    }
}
