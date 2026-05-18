package com.anganwadi.hrms.leave_req;

import com.anganwadi.hrms.auth.AuthPrincipal;
import com.anganwadi.hrms.common.ConflictException;
import com.anganwadi.hrms.common.NotFoundException;
import com.anganwadi.hrms.config_org.OrgConfigRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@RestController
public class LeaveController {

    private final LeaveRepository repo;
    private final OrgConfigRepository orgRepo;
    private final ZoneId zone;

    /** Soft cap on how far in the future a leave can be applied for. */
    private static final int MAX_FUTURE_MONTHS = 12;

    public LeaveController(LeaveRepository repo,
                           OrgConfigRepository orgRepo,
                           @Value("${app.timezone:Asia/Kolkata}") String tz) {
        this.repo = repo;
        this.orgRepo = orgRepo;
        this.zone = ZoneId.of(tz);
    }

    /* ---------- self ---------- */

    /**
     * List the signed-in user's leave requests, newest first.
     * Optional `status` filter narrows the result.
     */
    @GetMapping("/leaves")
    public ResponseEntity<List<LeaveDetail>> mine(@AuthenticationPrincipal AuthPrincipal me,
                                                  @RequestParam(value = "status", required = false) LeaveStatus status) {
        LocalDate today = LocalDate.now(zone);
        List<LeaveRequest> rows = status == null
                ? repo.findByEmployeeIdOrderByAppliedAtDesc(me.employeeId())
                : repo.findByEmployeeIdAndStatusOrderByAppliedAtDesc(me.employeeId(), status);
        List<LeaveDetail> out = new ArrayList<>(rows.size());
        for (LeaveRequest lr : rows) out.add(LeaveDetail.from(lr, today));
        return ResponseEntity.ok(out);
    }

    /**
     * Current-year leave balance for the signed-in user.
     */
    @GetMapping("/leaves/balance")
    public ResponseEntity<LeaveBalance> balance(@AuthenticationPrincipal AuthPrincipal me) {
        int year = LocalDate.now(zone).getYear();
        LocalDate yearStart = LocalDate.of(year, 1, 1);
        LocalDate yearEnd   = LocalDate.of(year, 12, 31);

        int approvedDays = sumDays(repo.findOverlappingForEmployeeAndStatus(
                me.employeeId(), LeaveStatus.APPROVED, yearStart, yearEnd), yearStart, yearEnd);
        int pendingDays  = sumDays(repo.findOverlappingForEmployeeAndStatus(
                me.employeeId(), LeaveStatus.PENDING,  yearStart, yearEnd), yearStart, yearEnd);

        int quota = orgRepo.getSingleton().getAnnualHolidayQuota();
        int available = Math.max(0, quota - approvedDays - pendingDays);

        return ResponseEntity.ok(new LeaveBalance(year, quota, approvedDays, pendingDays, available));
    }

    @PostMapping("/leaves")
    public ResponseEntity<LeaveDetail> apply(@AuthenticationPrincipal AuthPrincipal me,
                                             @Valid @RequestBody ApplyRequest body) {
        LocalDate today = LocalDate.now(zone);
        validateApply(me.employeeId(), body, today);

        LeaveRequest lr = new LeaveRequest();
        lr.setEmployeeId(me.employeeId());
        lr.setFromDate(body.fromDate());
        lr.setToDate(body.toDate());
        lr.setReason(body.reason());
        lr.setStatus(LeaveStatus.PENDING);
        LeaveRequest saved = repo.save(lr);
        return ResponseEntity.ok(LeaveDetail.from(saved, today));
    }

    /**
     * Cancel a leave request you own. Only valid while still PENDING and not
     * in the past — anything else returns 409.
     */
    @PostMapping("/leaves/{id}/cancel")
    @Transactional
    public ResponseEntity<LeaveDetail> cancel(@AuthenticationPrincipal AuthPrincipal me,
                                              @PathVariable("id") Long id) {
        LeaveRequest lr = repo.findById(id)
                .orElseThrow(() -> new NotFoundException("leave not found"));
        if (!lr.getEmployeeId().equals(me.employeeId())) {
            throw new AccessDeniedException("not your leave request");
        }
        LocalDate today = LocalDate.now(zone);
        if (lr.getStatus() != LeaveStatus.PENDING) {
            throw new ConflictException("only pending requests can be cancelled");
        }
        if (lr.getToDate().isBefore(today)) {
            throw new ConflictException("cannot cancel a past leave");
        }
        lr.setStatus(LeaveStatus.CANCELLED);
        lr.setDecidedAt(OffsetDateTime.now(zone));
        lr.setDecidedBy(me.employeeId());
        LeaveRequest saved = repo.save(lr);
        return ResponseEntity.ok(LeaveDetail.from(saved, today));
    }

    /* ---------- admin ---------- */

    @GetMapping("/admin/leaves")
    public ResponseEntity<List<LeaveRequest>> list(
            @RequestParam(value = "status", required = false) LeaveStatus status) {
        return ResponseEntity.ok(
                status == null
                        ? repo.findAllByOrderByAppliedAtDesc()
                        : repo.findByStatusOrderByAppliedAtAsc(status)
        );
    }

    @PostMapping("/admin/leaves/{id}/decide")
    @Transactional
    public ResponseEntity<LeaveRequest> decide(
            @AuthenticationPrincipal AuthPrincipal admin,
            @PathVariable("id") Long id,
            @Valid @RequestBody DecideRequest body) {
        LeaveRequest lr = repo.findById(id).orElseThrow(() -> new NotFoundException("leave not found"));
        if (lr.getStatus() != LeaveStatus.PENDING) {
            throw new ConflictException("leave is no longer pending");
        }
        lr.setStatus(body.approve() ? LeaveStatus.APPROVED : LeaveStatus.REJECTED);
        lr.setDecidedAt(OffsetDateTime.now(zone));
        lr.setDecidedBy(admin.employeeId());
        return ResponseEntity.ok(repo.save(lr));
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private void validateApply(Long employeeId, ApplyRequest body, LocalDate today) {
        if (body.fromDate() == null || body.toDate() == null) {
            throw new IllegalArgumentException("fromDate and toDate are required");
        }
        if (body.toDate().isBefore(body.fromDate())) {
            throw new IllegalArgumentException("toDate must be on or after fromDate");
        }
        if (body.fromDate().isBefore(today)) {
            throw new IllegalArgumentException("fromDate cannot be in the past");
        }
        LocalDate maxFuture = today.plusMonths(MAX_FUTURE_MONTHS);
        if (body.fromDate().isAfter(maxFuture)) {
            throw new IllegalArgumentException("fromDate is too far in the future");
        }

        // Overlap with existing pending/approved requests → conflict
        for (LeaveStatus s : new LeaveStatus[]{ LeaveStatus.PENDING, LeaveStatus.APPROVED }) {
            List<LeaveRequest> overlaps = repo.findOverlappingForEmployeeAndStatus(
                    employeeId, s, body.fromDate(), body.toDate());
            if (!overlaps.isEmpty()) {
                LeaveRequest existing = overlaps.get(0);
                throw new ConflictException(String.format(
                        "overlaps with an existing %s request (%s → %s)",
                        s.name().toLowerCase(), existing.getFromDate(), existing.getToDate()));
            }
        }
    }

    private int sumDays(List<LeaveRequest> requests, LocalDate windowStart, LocalDate windowEnd) {
        int total = 0;
        for (LeaveRequest r : requests) {
            LocalDate s = r.getFromDate().isBefore(windowStart) ? windowStart : r.getFromDate();
            LocalDate e = r.getToDate().isAfter(windowEnd) ? windowEnd : r.getToDate();
            total += (int) ChronoUnit.DAYS.between(s, e) + 1;
        }
        return total;
    }

    public record ApplyRequest(
            @NotNull LocalDate fromDate,
            @NotNull LocalDate toDate,
            String reason
    ) {}

    public record DecideRequest(@NotNull Boolean approve) {}
}
