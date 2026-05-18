package com.anganwadi.hrms.leave_req;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface LeaveRepository extends JpaRepository<LeaveRequest, Long> {

    List<LeaveRequest> findByEmployeeIdOrderByAppliedAtDesc(Long employeeId);

    List<LeaveRequest> findByEmployeeIdAndStatusOrderByAppliedAtDesc(Long employeeId, LeaveStatus status);

    List<LeaveRequest> findByStatusOrderByAppliedAtAsc(LeaveStatus status);

    List<LeaveRequest> findAllByOrderByAppliedAtDesc();

    /**
     * Approved leave records that overlap a date range — used by the salary
     * calculator to credit hours per leave day.
     */
    List<LeaveRequest> findByEmployeeIdAndStatusAndFromDateLessThanEqualAndToDateGreaterThanEqual(
            Long employeeId, LeaveStatus status, LocalDate to, LocalDate from);

    /**
     * Generic overlap finder: any leave for the employee with the given
     * status whose [fromDate, toDate] overlaps the supplied window. Used for
     * conflict detection on apply and for the year-balance rollup.
     */
    default List<LeaveRequest> findOverlappingForEmployeeAndStatus(
            Long employeeId, LeaveStatus status, LocalDate windowFrom, LocalDate windowTo) {
        return findByEmployeeIdAndStatusAndFromDateLessThanEqualAndToDateGreaterThanEqual(
                employeeId, status, windowTo, windowFrom);
    }
}
