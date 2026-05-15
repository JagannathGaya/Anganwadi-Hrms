package com.anganwadi.hrms.leave_req;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface LeaveRepository extends JpaRepository<LeaveRequest, Long> {

    List<LeaveRequest> findByEmployeeIdOrderByAppliedAtDesc(Long employeeId);

    List<LeaveRequest> findByStatusOrderByAppliedAtAsc(LeaveStatus status);

    List<LeaveRequest> findAllByOrderByAppliedAtDesc();

    /**
     * Approved leave records that overlap a date range — used by the salary
     * calculator to credit hours per leave day.
     */
    List<LeaveRequest> findByEmployeeIdAndStatusAndFromDateLessThanEqualAndToDateGreaterThanEqual(
            Long employeeId, LeaveStatus status, LocalDate to, LocalDate from);
}
