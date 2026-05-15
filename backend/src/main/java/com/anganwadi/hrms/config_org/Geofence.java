package com.anganwadi.hrms.config_org;

/** Pure geo helpers — no Spring deps so it's trivially unit-testable. */
public final class Geofence {
    private Geofence() {}

    /** Great-circle distance in metres between two lat/lng pairs (Haversine). */
    public static double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double R = 6_371_000d;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                   * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    public static boolean isInside(OrgConfig cfg, double lat, double lng) {
        if (!cfg.hasGeofence()) return true; // no fence = always allowed
        return distanceMeters(cfg.getGeofenceLat(), cfg.getGeofenceLng(), lat, lng)
                <= cfg.getGeofenceRadiusM();
    }
}
