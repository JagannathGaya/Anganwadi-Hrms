package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.common.ConflictException;
import com.anganwadi.hrms.common.NotFoundException;
import com.anganwadi.hrms.config_org.OrgConfigRepository;
import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import com.anganwadi.hrms.payslip.PayslipService;
import com.anganwadi.hrms.shift.Shift;
import com.anganwadi.hrms.shift.ShiftRef;
import com.anganwadi.hrms.shift.ShiftRepository;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin/attendance")
public class AdminAttendanceController {

    private final AttendanceService service;
    private final AttendanceRepository repo;
    private final AttendanceViewService viewService;
    private final PayslipService payslipService;
    private final EmployeeRepository employees;
    private final ShiftRepository shifts;
    private final OrgConfigRepository orgRepo;
    private final ZoneId zone;

    public AdminAttendanceController(AttendanceService service,
                                     AttendanceRepository repo,
                                     AttendanceViewService viewService,
                                     PayslipService payslipService,
                                     EmployeeRepository employees,
                                     ShiftRepository shifts,
                                     OrgConfigRepository orgRepo,
                                     @Value("${app.timezone:Asia/Kolkata}") String tz) {
        this.service = service;
        this.repo = repo;
        this.viewService = viewService;
        this.payslipService = payslipService;
        this.employees = employees;
        this.shifts = shifts;
        this.orgRepo = orgRepo;
        this.zone = ZoneId.of(tz);
    }

    @GetMapping
    public ResponseEntity<List<Attendance>> list(
            @RequestParam("employee_id") Long employeeId,
            @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam("to")   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        OffsetDateTime fromTs = from.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime toTs   = to.plusDays(1).atStartOfDay(zone).minusSeconds(1).toOffsetDateTime();
        return ResponseEntity.ok(service.listForEmployee(employeeId, fromTs, toTs));
    }

    /**
     * Monthly rollup for a specific employee — the per-day calendar with hours,
     * lateness and overtime. Reuses the same view service the mobile calendar
     * uses, so admin and employee see the same numbers.
     */
    @GetMapping("/month")
    public ResponseEntity<MonthAttendance> month(@RequestParam("employee_id") Long employeeId,
                                                 @RequestParam("month") String monthStr) {
        YearMonth target;
        try {
            target = YearMonth.parse(monthStr);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("month must be YYYY-MM");
        }
        return ResponseEntity.ok(viewService.buildMonth(employeeId, target));
    }

    /**
     * Edit a single attendance row. Admins can move the check-in or check-out
     * timestamp; lat/lng can be cleared too. Either timestamp may be omitted
     * to leave it unchanged. The body must keep checkOutAt strictly after
     * checkInAt when both are present.
     */
    @PatchMapping("/{id}")
    @Transactional
    public ResponseEntity<Attendance> patch(@PathVariable("id") Long id,
                                            @Valid @RequestBody PatchRequest body) {
        Attendance a = repo.findById(id).orElseThrow(() -> new NotFoundException("attendance not found"));
        if (body.checkInAt()  != null) a.setCheckInAt(body.checkInAt());
        if (body.checkOutAt() != null) a.setCheckOutAt(body.checkOutAt());
        if (body.clearCheckOut() != null && body.clearCheckOut()) a.setCheckOutAt(null);
        if (body.checkInLat()  != null) a.setCheckInLat(body.checkInLat());
        if (body.checkInLng()  != null) a.setCheckInLng(body.checkInLng());
        if (body.checkOutLat() != null) a.setCheckOutLat(body.checkOutLat());
        if (body.checkOutLng() != null) a.setCheckOutLng(body.checkOutLng());
        if (a.getCheckOutAt() != null && !a.getCheckOutAt().isAfter(a.getCheckInAt())) {
            throw new ConflictException("check-out must be strictly after check-in");
        }
        return ResponseEntity.ok(repo.save(a));
    }

    /** Delete a single attendance row entirely. Use sparingly — prefer editing. */
    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        if (!repo.existsById(id)) throw new NotFoundException("attendance not found");
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Mark a month "complete" for an employee — generates+releases their
     * payslip for that month so the employee can view it from the mobile app.
     *
     * With `full_salary=true`, the slip skips the attendance-based math
     * entirely and pays the employee their full monthly salary regardless of
     * actual hours worked. Useful for new hires, special circumstances, or
     * exception cases where management has decided to pay in full.
     *
     * Refuses if the month hasn't ended yet.
     */
    @PostMapping("/complete")
    @Transactional
    public ResponseEntity<Map<String, Object>> completeMonth(
            @RequestParam("employee_id") Long employeeId,
            @RequestParam("month") String monthStr,
            @RequestParam(value = "full_salary", required = false, defaultValue = "false") boolean fullSalary) {
        YearMonth target;
        try {
            target = YearMonth.parse(monthStr);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("month must be YYYY-MM");
        }
        YearMonth currentMonth = YearMonth.now(zone);
        if (!target.isBefore(currentMonth)) {
            throw new ConflictException(
                    "Cannot complete " + target + " — the month is still in progress. " +
                    "Wait until " + currentMonth.plusMonths(1).atDay(1) + ".");
        }

        var slip = fullSalary
                ? payslipService.generateFullSalary(employeeId, target)
                : payslipService.generateOrRefresh(employeeId, target);
        // generateFullSalary already sets released = true. For the normal
        // path we have to release explicitly.
        if (!fullSalary) {
            payslipService.setReleased(slip.getId(), true);
        }
        return ResponseEntity.ok(Map.of(
                "employeeId", employeeId,
                "month", target.toString(),
                "payslipId", slip.getId(),
                "released", true,
                "fullSalary", fullSalary,
                "grossPay", slip.getGrossPay()
        ));
    }

    /** Per-session log of today's check-ins/outs across the org, newest first. */
    @GetMapping("/today")
    public ResponseEntity<List<TodayAttendanceDto>> today() {
        return ResponseEntity.ok(service.todayAcrossOrg());
    }

    @GetMapping("/today/summary")
    public ResponseEntity<List<EmployeeTodaySummary>> todaySummary() {
        List<TodayAttendanceDto> rows = service.todayAcrossOrg();
        if (rows.isEmpty()) return ResponseEntity.ok(List.of());

        BigDecimal orgDefault = orgRepo.getSingleton().getDailyHours();
        Map<Long, List<TodayAttendanceDto>> byEmp = new HashMap<>();
        for (TodayAttendanceDto r : rows) byEmp.computeIfAbsent(r.employeeId(), k -> new ArrayList<>()).add(r);

        Map<Long, Employee> empById = employees.findAllById(byEmp.keySet()).stream()
                .collect(java.util.stream.Collectors.toMap(Employee::getId, java.util.function.Function.identity()));
        var shiftIds = empById.values().stream()
                .map(Employee::getShiftId).filter(java.util.Objects::nonNull).distinct().toList();
        Map<Long, Shift> shiftById = shiftIds.isEmpty() ? Map.of()
                : shifts.findAllById(shiftIds).stream()
                        .collect(java.util.stream.Collectors.toMap(Shift::getId, java.util.function.Function.identity()));

        List<EmployeeTodaySummary> out = new ArrayList<>();
        for (var entry : byEmp.entrySet()) {
            List<TodayAttendanceDto> sessions = entry.getValue();
            sessions.sort(Comparator.comparing(TodayAttendanceDto::checkInAt));
            BigDecimal total = BigDecimal.ZERO;
            boolean openSession = false;
            for (var s : sessions) {
                if (s.checkOutAt() == null) { openSession = true; continue; }
                long secs = Duration.between(s.checkInAt(), s.checkOutAt()).getSeconds();
                if (secs > 0) {
                    total = total.add(BigDecimal.valueOf(secs)
                            .divide(BigDecimal.valueOf(3600), 4, RoundingMode.HALF_UP));
                }
            }
            total = total.setScale(2, RoundingMode.HALF_UP);

            Employee e = empById.get(entry.getKey());
            Shift shift = e == null || e.getShiftId() == null ? null : shiftById.get(e.getShiftId());
            BigDecimal expected = shift != null ? shift.getDailyHours() : orgDefault;

            boolean shortfall = !openSession && total.compareTo(expected) < 0 && total.signum() > 0;
            out.add(new EmployeeTodaySummary(
                    entry.getKey(),
                    e != null ? e.getName() : "—",
                    e != null ? e.getEmail() : "—",
                    ShiftRef.from(shift),
                    expected,
                    total,
                    sessions.size(),
                    openSession,
                    shortfall,
                    sessions.get(0).checkInAt(),
                    sessions.get(sessions.size() - 1).checkOutAt()
            ));
        }
        out.sort(Comparator.comparing((EmployeeTodaySummary s) -> s.shortfall() ? 0 : 1)
                .thenComparing(EmployeeTodaySummary::employeeName));
        return ResponseEntity.ok(out);
    }

    // ── DTOs ────────────────────────────────────────────────────────────

    /** Patch payload — every field is optional. */
    public record PatchRequest(
            OffsetDateTime checkInAt,
            OffsetDateTime checkOutAt,
            /** Pass true to clear the check-out timestamp (re-open the session). */
            Boolean clearCheckOut,
            Double checkInLat,
            Double checkInLng,
            Double checkOutLat,
            Double checkOutLng
    ) {}

    public record EmployeeTodaySummary(
            Long employeeId,
            String employeeName,
            String employeeEmail,
            ShiftRef shift,
            BigDecimal expectedHours,
            BigDecimal totalHours,
            Integer sessions,
            Boolean openSession,
            Boolean shortfall,
            OffsetDateTime firstCheckIn,
            OffsetDateTime lastCheckOut
    ) {}
}
