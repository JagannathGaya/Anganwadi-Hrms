package com.anganwadi.hrms.shift;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "shifts")
public class Shift {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String name;

    /** Wall-clock start time as HH:mm (24-hour). Stored as VARCHAR to avoid
     *  JDBC TIME timezone shifts. */
    @Column(name = "start_time", nullable = false, length = 8)
    private String startTime;

    @Column(name = "end_time", nullable = false, length = 8)
    private String endTime;

    @Column(name = "daily_hours", nullable = false, precision = 5, scale = 2)
    private BigDecimal dailyHours;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getStartTime() { return startTime; }
    public void setStartTime(String startTime) { this.startTime = startTime; }

    public String getEndTime() { return endTime; }
    public void setEndTime(String endTime) { this.endTime = endTime; }

    public BigDecimal getDailyHours() { return dailyHours; }
    public void setDailyHours(BigDecimal dailyHours) { this.dailyHours = dailyHours; }

    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
