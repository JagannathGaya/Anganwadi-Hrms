package com.anganwadi.hrms.leave_req;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

/**
 * Enriched leave-request payload.
 *
 * Wraps the raw LeaveRequest with derived fields the mobile UI wants:
 *   - days       — inclusive day count between fromDate and toDate
 *   - canCancel  — true only when the request is PENDING and not in the past;
 *                  saves the mobile from doing the same check
 *   - inPast     — toDate is before today
 */
public record LeaveDetail(
        Long id,
        Long employeeId,
        LocalDate fromDate,
        LocalDate toDate,
        Integer days,
        String reason,
        LeaveStatus status,
        OffsetDateTime appliedAt,
        OffsetDateTime decidedAt,
        Long decidedBy,
        Boolean canCancel,
        Boolean inPast
) {
    public static LeaveDetail from(LeaveRequest lr, LocalDate today) {
        int days = (int) ChronoUnit.DAYS.between(lr.getFromDate(), lr.getToDate()) + 1;
        boolean inPast = lr.getToDate().isBefore(today);
        boolean canCancel = lr.getStatus() == LeaveStatus.PENDING && !inPast;
        return new LeaveDetail(
                lr.getId(),
                lr.getEmployeeId(),
                lr.getFromDate(),
                lr.getToDate(),
                days,
                lr.getReason(),
                lr.getStatus(),
                lr.getAppliedAt(),
                lr.getDecidedAt(),
                lr.getDecidedBy(),
                canCancel,
                inPast
        );
    }
}
