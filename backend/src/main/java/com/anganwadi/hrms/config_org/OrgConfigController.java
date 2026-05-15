package com.anganwadi.hrms.config_org;

import com.anganwadi.hrms.common.NotFoundException;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;

@RestController
public class OrgConfigController {

    private final OrgConfigRepository repo;

    public OrgConfigController(OrgConfigRepository repo) { this.repo = repo; }

    /** Public-ish read so the mobile app can show distance-to-center, etc. */
    @GetMapping("/config")
    public ResponseEntity<OrgConfig> me() {
        return ResponseEntity.ok(repo.getSingleton());
    }

    @GetMapping("/admin/config")
    public ResponseEntity<OrgConfig> adminGet() {
        return ResponseEntity.ok(repo.getSingleton());
    }

    @PatchMapping("/admin/config")
    @Transactional
    public ResponseEntity<OrgConfig> patch(@RequestBody Map<String, Object> body) {
        OrgConfig c = repo.findById((short) 1).orElseThrow(() -> new NotFoundException("org_config row missing"));
        if (body.containsKey("geofenceLat"))
            c.setGeofenceLat(body.get("geofenceLat") == null ? null : Double.valueOf(String.valueOf(body.get("geofenceLat"))));
        if (body.containsKey("geofenceLng"))
            c.setGeofenceLng(body.get("geofenceLng") == null ? null : Double.valueOf(String.valueOf(body.get("geofenceLng"))));
        if (body.containsKey("geofenceRadiusM"))
            c.setGeofenceRadiusM(body.get("geofenceRadiusM") == null ? null : Integer.valueOf(String.valueOf(body.get("geofenceRadiusM"))));
        if (body.containsKey("dailyHours"))
            c.setDailyHours(new BigDecimal(String.valueOf(body.get("dailyHours"))));
        if (body.containsKey("annualHolidayQuota"))
            c.setAnnualHolidayQuota(Integer.valueOf(String.valueOf(body.get("annualHolidayQuota"))));
        if (body.containsKey("currency"))
            c.setCurrency(String.valueOf(body.get("currency")));
        c.setUpdatedAt(OffsetDateTime.now());
        return ResponseEntity.ok(repo.save(c));
    }
}
