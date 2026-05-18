package com.anganwadi.hrms.leave_req;

public enum LeaveStatus {
    PENDING,
    APPROVED,
    REJECTED,
    /** Withdrawn by the employee before an admin made a decision. */
    CANCELLED
}
