package com.anganwadi.hrms.leave_req;

/**
 * Year-to-date leave balance returned by GET /leaves/balance.
 *
 *   quota          — annual entitlement from org config
 *   approvedDays   — sum of approved leave days this year
 *   pendingDays    — sum of pending leave days this year
 *   availableDays  — quota − approved − pending (never negative)
 *   year           — the calendar year used for the totals
 */
public record LeaveBalance(
        Integer year,
        Integer quota,
        Integer approvedDays,
        Integer pendingDays,
        Integer availableDays
) {}
