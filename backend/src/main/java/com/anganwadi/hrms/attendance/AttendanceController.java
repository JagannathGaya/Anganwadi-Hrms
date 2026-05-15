package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.auth.AuthPrincipal;
import com.anganwadi.hrms.config_org.OrgConfigRepository;
import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import com.anganwadi.hrms.shift.Shift;
import com.anganwadi.hrms.shift.ShiftRef;
import com.anganwadi.hrms.shift.ShiftRepository;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.List;

@RestController
@RequestMapping("/attendance")
public class AttendanceController {

    private final AttendanceService service;
    private final EmployeeRepository employees;
    private final ShiftRepository shifts;
    private final OrgConfigRepository orgRepo;

    public AttendanceController(AttendanceService service,
                                EmployeeRepository employees,
                                ShiftRepository shifts,
                                OrgConfigRepository orgRepo) {
        this.service = service;
        this.employees = employees;
        this.shifts = shifts;
        this.orgRepo = orgRepo;
    }

    @PostMapping("/checkin")
    public ResponseEntity<Attendance> checkIn(@AuthenticationPrincipal AuthPrincipal me,
                                              @Valid @RequestBody CheckRequest req) {
        return ResponseEntity.ok(service.checkIn(me.employeeId(), req.lat(), req.lng()));
    }

    @PostMapping("/checkout")
    public ResponseEntity<Attendance> checkOut(@AuthenticationPrincipal AuthPrincipal me,
                                               @Valid @RequestBody CheckRequest req) {
        return ResponseEntity.ok(service.checkOut(me.employeeId(), req.lat(), req.lng()));
    }

    /** Today's per-session log for the signed-in employee, newest first. */
    @GetMapping("/today")
    public ResponseEntity<List<Attendance>> today(@AuthenticationPrincipal AuthPrincipal me) {
        return ResponseEntity.ok(service.today(me.employeeId()));
    }

    /**
     * Today's rollup for the signed-in employee:
     *   - the per-session log (newest first)
     *   - total worked hours so far
     *   - expected hours from their assigned shift (or org default)
     *   - openSession flag
     *   - shortfall + alert text once the employee has stopped working
     */
    @GetMapping("/today/summary")
    public ResponseEntity<TodaySummary> todaySummary(@AuthenticationPrincipal AuthPrincipal me) {
        List<Attendance> log = service.today(me.employeeId());
        Employee e = employees.findById(me.employeeId()).orElseThrow();
        Shift shift = e.getShiftId() == null ? null : shifts.findById(e.getShiftId()).orElse(null);
        BigDecimal expected = shift != null ? shift.getDailyHours() : orgRepo.getSingleton().getDailyHours();

        BigDecimal total = BigDecimal.ZERO;
        boolean openSession = false;
        for (Attendance a : log) {
            if (a.getCheckOutAt() == null) { openSession = true; continue; }
            long secs = Duration.between(a.getCheckInAt(), a.getCheckOutAt()).getSeconds();
            if (secs > 0) total = total.add(BigDecimal.valueOf(secs)
                    .divide(BigDecimal.valueOf(3600), 4, RoundingMode.HALF_UP));
        }
        total = total.setScale(2, RoundingMode.HALF_UP);

        boolean shortfall = !openSession && !log.isEmpty() && total.compareTo(expected) < 0;
        String alert = null;
        if (shortfall) {
            BigDecimal short_ = expected.subtract(total).setScale(2, RoundingMode.HALF_UP);
            alert = String.format(
                    "You worked %.2f h today, but your shift expects %.2f h. You're %.2f h short — please complete the shift or notify your supervisor.",
                    total, expected, short_);
        }

        return ResponseEntity.ok(new TodaySummary(
                ShiftRef.from(shift),
                expected,
                total,
                log.size(),
                openSession,
                shortfall,
                alert,
                log
        ));
    }
}
