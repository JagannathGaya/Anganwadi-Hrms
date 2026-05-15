package com.anganwadi.hrms.config_org;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "org_config")
public class OrgConfig {

    @Id
    private Short id;

    @Column(name = "geofence_lat")
    private Double geofenceLat;

    @Column(name = "geofence_lng")
    private Double geofenceLng;

    @Column(name = "geofence_radius_m", nullable = false)
    private Integer geofenceRadiusM = 200;

    @Column(name = "daily_hours", nullable = false, precision = 5, scale = 2)
    private BigDecimal dailyHours = new BigDecimal("6.00");

    @Column(name = "annual_holiday_quota", nullable = false)
    private Integer annualHolidayQuota = 24;

    @Column(nullable = false, length = 8)
    private String currency = "INR";

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    public Short getId() { return id; }
    public void setId(Short id) { this.id = id; }

    public Double getGeofenceLat() { return geofenceLat; }
    public void setGeofenceLat(Double v) { this.geofenceLat = v; }

    public Double getGeofenceLng() { return geofenceLng; }
    public void setGeofenceLng(Double v) { this.geofenceLng = v; }

    public Integer getGeofenceRadiusM() { return geofenceRadiusM; }
    public void setGeofenceRadiusM(Integer v) { this.geofenceRadiusM = v; }

    public BigDecimal getDailyHours() { return dailyHours; }
    public void setDailyHours(BigDecimal v) { this.dailyHours = v; }

    public Integer getAnnualHolidayQuota() { return annualHolidayQuota; }
    public void setAnnualHolidayQuota(Integer v) { this.annualHolidayQuota = v; }

    public String getCurrency() { return currency; }
    public void setCurrency(String v) { this.currency = v; }

    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime v) { this.updatedAt = v; }

    public boolean hasGeofence() {
        return geofenceLat != null && geofenceLng != null && geofenceRadiusM != null;
    }
}
