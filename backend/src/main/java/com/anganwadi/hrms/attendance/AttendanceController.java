package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.auth.AuthPrincipal;
import com.anganwadi.hrms.config_org.OrgConfigRepository;
import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import com.anganwadi.hrms.shift.Shift;
import com.anganwadi.hrms.shift.ShiftRef;
import com.anganwadi.hrms.shift.ShiftRepository;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/attendance")
public class AttendanceController {

    private final AttendanceService service;
    private final AttendanceViewService viewService;
    private final EmployeeRepository employees;
    private final ShiftRepository shifts;
    private final OrgConfigRepository orgRepo;

    private final ZoneId zone;
    private final int graceMinutes;

    public AttendanceController(AttendanceService service,
                                AttendanceViewService viewService,
                                EmployeeRepository employees,
                                ShiftRepository shifts,
                                OrgConfigRepository orgRepo,
                                @Value("${app.timezone:Asia/Kolkata}") String tz,
                                @Value("${app.attendance.late-grace-minutes:5}") int graceMinutes) {
        this.service = service;
        this.viewService = viewService;
        this.employees = employees;
        this.shifts = shifts;
        this.orgRepo = orgRepo;
        this.zone = ZoneId.of(tz);
        this.graceMinutes = graceMinutes;
    }

    @PostMapping("/checkin")
    public ResponseEntity<AttendanceDto> checkIn(@AuthenticationPrincipal AuthPrincipal me,
                                                 @Valid @RequestBody CheckRequest req) {
        Attendance a = service.checkIn(me.employeeId(), req.lat(), req.lng());
        Shift shift  = resolveShift(me.employeeId());
        return ResponseEntity.ok(AttendanceDto.from(a, shift, zone, graceMinutes));
    }

    @PostMapping("/checkout")
    public ResponseEntity<AttendanceDto> checkOut(@AuthenticationPrincipal AuthPrincipal me,
                                                  @Valid @RequestBody CheckRequest req) {
        Attendance a = service.checkOut(me.employeeId(), req.lat(), req.lng());
        Shift shift  = resolveShift(me.employeeId());
        return ResponseEntity.ok(AttendanceDto.from(a, shift, zone, graceMinutes));
    }

    /** Today's per-session log for the signed-in employee, newest first. */
    @GetMapping("/today")
    public ResponseEntity<List<AttendanceDto>> today(@AuthenticationPrincipal AuthPrincipal me) {
        Shift shift = resolveShift(me.employeeId());
        List<Attendance> rows = service.today(me.employeeId());
        List<AttendanceDto> out = new ArrayList<>(rows.size());
        for (Attendance r : rows) out.add(AttendanceDto.from(r, shift, zone, graceMinutes));
        return ResponseEntity.ok(out);
    }

    /**
     * Today's rollup for the signed-in employee with shift-aware punctuality
     * and a `nextAction` hint that tells the client what the user should do.
     */
    @GetMapping("/today/summary")
    public ResponseEntity<TodaySummary> todaySummary(@AuthenticationPrincipal AuthPrincipal me) {
        List<Attendance> log = service.today(me.employeeId());
        Employee e = employees.findById(me.employeeId()).orElseThrow();
        Shift shift = e.getShiftId() == null ? null : shifts.findById(e.getShiftId()).orElse(null);
        BigDecimal expected = shift != null ? shift.getDailyHours() : orgRepo.getSingleton().getDailyHours();

        // Banked vs in-progress hours
        BigDecimal closed = BigDecimal.ZERO;
        BigDecimal inProgress = BigDecimal.ZERO;
        boolean openSession = false;

        // Earliest check-in of the day (for lateness); aggregate overtime
        OffsetDateTime earliestCheckIn = null;
        Integer overtimeAccum = null;

        for (Attendance a : log) {
            if (a.getCheckInAt() != null && (earliestCheckIn == null || a.getCheckInAt().isBefore(earliestCheckIn))) {
                earliestCheckIn = a.getCheckInAt();
            }
            if (a.getCheckOutAt() == null) {
                openSession = true;
                inProgress = inProgress.add(service.secondsToHours(service.openSessionElapsedSeconds(a)));
            } else {
                closed = closed.add(service.closedSessionHours(a));
                Integer overtime = PunctualityCalculator.overtimeMinutes(
                        a.getCheckInAt(), a.getCheckOutAt(), shift, zone);
                if (overtime != null) {
                    overtimeAccum = (overtimeAccum == null ? 0 : overtimeAccum) + overtime;
                }
            }
        }
        closed     = closed.setScale(2, RoundingMode.HALF_UP);
        inProgress = inProgress.setScale(2, RoundingMode.HALF_UP);
        BigDecimal live = closed.add(inProgress);

        // Schedule for today (anchored at NOW so the dates resolve cleanly)
        OffsetDateTime nowAnchor = earliestCheckIn != null ? earliestCheckIn : OffsetDateTime.now(zone);
        OffsetDateTime expectedIn  = PunctualityCalculator.expectedCheckInAt(nowAnchor, shift, zone);
        OffsetDateTime expectedOut = PunctualityCalculator.expectedCheckOutAt(nowAnchor, shift, zone);

        // Lateness of the FIRST check-in
        Integer lateMinutes = PunctualityCalculator.lateMinutes(earliestCheckIn, shift, zone);
        var punctuality = PunctualityCalculator.status(lateMinutes, graceMinutes).name();

        // What should the user do next?
        String nextAction;
        if (shift == null)                  nextAction = "NO_SHIFT";
        else if (openSession)               nextAction = "CHECK_OUT";
        else if (log.isEmpty())             nextAction = "CHECK_IN";
        else                                nextAction = "DONE";

        boolean shortfall = !openSession && !log.isEmpty() && closed.compareTo(expected) < 0;
        String alert = null;
        if (shortfall) {
            BigDecimal deficit = expected.subtract(closed).setScale(2, RoundingMode.HALF_UP);
            alert = String.format(
                    "You worked %.2f h today, but your shift expects %.2f h. You're %.2f h short — please complete the shift or notify your supervisor.",
                    closed, expected, deficit);
        }

        // Enrich the session log
        List<AttendanceDto> dtoLog = new ArrayList<>(log.size());
        for (Attendance a : log) dtoLog.add(AttendanceDto.from(a, shift, zone, graceMinutes));

        return ResponseEntity.ok(new TodaySummary(
                ShiftRef.from(shift),
                expected,
                closed,
                inProgress,
                live,
                log.size(),
                openSession,
                shortfall,
                alert,
                log,
                expectedIn,
                expectedOut,
                lateMinutes,
                overtimeAccum,
                punctuality,
                nextAction,
                dtoLog
        ));
    }

    /**
     * Monthly attendance rollup for the calendar view on mobile.
     * `month` is YYYY-MM. If omitted, returns the current month.
     */
    @GetMapping("/month")
    public ResponseEntity<MonthAttendance> month(@AuthenticationPrincipal AuthPrincipal me,
                                                 @RequestParam(value = "month", required = false) String monthStr) {
        YearMonth target;
        if (monthStr == null || monthStr.isBlank()) {
            target = YearMonth.now(zone);
        } else {
            try {
                target = YearMonth.parse(monthStr);
            } catch (DateTimeParseException ex) {
                throw new IllegalArgumentException("month must be YYYY-MM");
            }
        }
        return ResponseEntity.ok(viewService.buildMonth(me.employeeId(), target));
    }

    // ── helpers ─────────────────────────────────────────────────────────
    private Shift resolveShift(Long employeeId) {
        Employee e = employees.findById(employeeId).orElse(null);
        if (e == null || e.getShiftId() == null) return null;
        return shifts.findById(e.getShiftId()).orElse(null);
    }
}
