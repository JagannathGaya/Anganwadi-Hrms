package com.anganwadi.hrms.leave_req;

import com.anganwadi.hrms.auth.AuthPrincipal;
import com.anganwadi.hrms.common.NotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@RestController
public class LeaveController {

    private final LeaveRepository repo;

    public LeaveController(LeaveRepository repo) { this.repo = repo; }

    /* ---------- self ---------- */

    @GetMapping("/leaves")
    public ResponseEntity<List<LeaveRequest>> mine(@AuthenticationPrincipal AuthPrincipal me) {
        return ResponseEntity.ok(repo.findByEmployeeIdOrderByAppliedAtDesc(me.employeeId()));
    }

    @PostMapping("/leaves")
    public ResponseEntity<LeaveRequest> apply(
            @AuthenticationPrincipal AuthPrincipal me,
            @Valid @RequestBody ApplyRequest body) {
        if (body.toDate().isBefore(body.fromDate())) {
            throw new IllegalArgumentException("to_date must be on or after from_date");
        }
        LeaveRequest lr = new LeaveRequest();
        lr.setEmployeeId(me.employeeId());
        lr.setFromDate(body.fromDate());
        lr.setToDate(body.toDate());
        lr.setReason(body.reason());
        lr.setStatus(LeaveStatus.PENDING);
        return ResponseEntity.ok(repo.save(lr));
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
        lr.setStatus(body.approve() ? LeaveStatus.APPROVED : LeaveStatus.REJECTED);
        lr.setDecidedAt(OffsetDateTime.now());
        lr.setDecidedBy(admin.employeeId());
        return ResponseEntity.ok(repo.save(lr));
    }

    public record ApplyRequest(
            @NotNull LocalDate fromDate,
            @NotNull LocalDate toDate,
            String reason
    ) {}

    public record DecideRequest(@NotNull Boolean approve) {}
}
