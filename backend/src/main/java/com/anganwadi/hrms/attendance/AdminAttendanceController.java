package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.config_org.OrgConfigRepository;
import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import com.anganwadi.hrms.shift.Shift;
import com.anganwadi.hrms.shift.ShiftRef;
import com.anganwadi.hrms.shift.ShiftRepository;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin/attendance")
public class AdminAttendanceController {

    private final AttendanceService service;
    private final EmployeeRepository employees;
    private final ShiftRepository shifts;
    private final OrgConfigRepository orgRepo;

    public AdminAttendanceController(AttendanceService service,
                                     EmployeeRepository employees,
                                     ShiftRepository shifts,
                                     OrgConfigRepository orgRepo) {
        this.service = service;
        this.employees = employees;
        this.shifts = shifts;
        this.orgRepo = orgRepo;
    }

    @GetMapping
    public ResponseEntity<List<Attendance>> list(
            @RequestParam("employee_id") Long employeeId,
            @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam("to")   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        OffsetDateTime fromTs = from.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime toTs   = to.atTime(23, 59, 59).atOffset(ZoneOffset.UTC);
        return ResponseEntity.ok(service.listForEmployee(employeeId, fromTs, toTs));
    }

    /** Per-session log of today's check-ins/outs across the org, newest first. */
    @GetMapping("/today")
    public ResponseEntity<List<TodayAttendanceDto>> today() {
        return ResponseEntity.ok(service.todayAcrossOrg());
    }

    /**
     * Per-employee rollup of today: for every employee with attendance today,
     * total hours, expected hours from their shift (or org default), and a
     * shortfall flag once the employee has at least one closed session.
     */
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
