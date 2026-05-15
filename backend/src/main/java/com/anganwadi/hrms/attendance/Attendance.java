package com.anganwadi.hrms.attendance;

import jakarta.persistence.*;

import java.time.OffsetDateTime;

@Entity
@Table(name = "attendance")
public class Attendance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "check_in_at", nullable = false)
    private OffsetDateTime checkInAt;

    @Column(name = "check_in_lat")
    private Double checkInLat;

    @Column(name = "check_in_lng")
    private Double checkInLng;

    @Column(name = "check_out_at")
    private OffsetDateTime checkOutAt;

    @Column(name = "check_out_lat")
    private Double checkOutLat;

    @Column(name = "check_out_lng")
    private Double checkOutLng;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }

    public OffsetDateTime getCheckInAt() { return checkInAt; }
    public void setCheckInAt(OffsetDateTime checkInAt) { this.checkInAt = checkInAt; }

    public Double getCheckInLat() { return checkInLat; }
    public void setCheckInLat(Double checkInLat) { this.checkInLat = checkInLat; }

    public Double getCheckInLng() { return checkInLng; }
    public void setCheckInLng(Double checkInLng) { this.checkInLng = checkInLng; }

    public OffsetDateTime getCheckOutAt() { return checkOutAt; }
    public void setCheckOutAt(OffsetDateTime checkOutAt) { this.checkOutAt = checkOutAt; }

    public Double getCheckOutLat() { return checkOutLat; }
    public void setCheckOutLat(Double checkOutLat) { this.checkOutLat = checkOutLat; }

    public Double getCheckOutLng() { return checkOutLng; }
    public void setCheckOutLng(Double checkOutLng) { this.checkOutLng = checkOutLng; }
}
