package com.anganwadi.hrms.leave_req;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "leave_requests")
public class LeaveRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "from_date", nullable = false)
    private LocalDate fromDate;

    @Column(name = "to_date", nullable = false)
    private LocalDate toDate;

    @Column(length = 500)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private LeaveStatus status = LeaveStatus.PENDING;

    @Column(name = "applied_at", nullable = false, updatable = false)
    private OffsetDateTime appliedAt = OffsetDateTime.now();

    @Column(name = "decided_at")
    private OffsetDateTime decidedAt;

    @Column(name = "decided_by")
    private Long decidedBy;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long v) { this.employeeId = v; }

    public LocalDate getFromDate() { return fromDate; }
    public void setFromDate(LocalDate v) { this.fromDate = v; }

    public LocalDate getToDate() { return toDate; }
    public void setToDate(LocalDate v) { this.toDate = v; }

    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }

    public LeaveStatus getStatus() { return status; }
    public void setStatus(LeaveStatus v) { this.status = v; }

    public OffsetDateTime getAppliedAt() { return appliedAt; }
    public void setAppliedAt(OffsetDateTime v) { this.appliedAt = v; }

    public OffsetDateTime getDecidedAt() { return decidedAt; }
    public void setDecidedAt(OffsetDateTime v) { this.decidedAt = v; }

    public Long getDecidedBy() { return decidedBy; }
    public void setDecidedBy(Long v) { this.decidedBy = v; }
}
