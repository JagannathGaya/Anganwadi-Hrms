package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.common.ConflictException;
import com.anganwadi.hrms.common.NotFoundException;
import com.anganwadi.hrms.config_org.Geofence;
import com.anganwadi.hrms.config_org.OrgConfig;
import com.anganwadi.hrms.config_org.OrgConfigRepository;
import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class AttendanceService {

    private final AttendanceRepository repo;
    private final OrgConfigRepository orgRepo;
    private final EmployeeRepository employees;

    /** Business timezone for "today" boundaries. */
    private final ZoneId zone;
    /** Open sessions are capped at this many hours when computing live totals. */
    private final long maxSessionSeconds;

    public AttendanceService(AttendanceRepository repo,
                             OrgConfigRepository orgRepo,
                             EmployeeRepository employees,
                             @Value("${app.timezone:Asia/Kolkata}") String tzId,
                             @Value("${app.attendance.max-session-hours:16}") int maxSessionHours) {
        this.repo = repo;
        this.orgRepo = orgRepo;
        this.employees = employees;
        this.zone = ZoneId.of(tzId);
        this.maxSessionSeconds = Math.max(1, maxSessionHours) * 3600L;
    }

    @Transactional
    public Attendance checkIn(Long employeeId, Double lat, Double lng) {
        ensureInsideGeofence(lat, lng);
        repo.findFirstByEmployeeIdAndCheckOutAtIsNullOrderByCheckInAtDesc(employeeId)
                .ifPresent(a -> { throw new ConflictException("already checked in"); });
        Attendance a = new Attendance();
        a.setEmployeeId(employeeId);
        a.setCheckInAt(OffsetDateTime.now(zone));
        a.setCheckInLat(lat);
        a.setCheckInLng(lng);
        return repo.save(a);
    }

    @Transactional
    public Attendance checkOut(Long employeeId, Double lat, Double lng) {
        ensureInsideGeofence(lat, lng);
        Attendance a = repo.findFirstByEmployeeIdAndCheckOutAtIsNullOrderByCheckInAtDesc(employeeId)
                .orElseThrow(() -> new NotFoundException("no open check-in to close"));

        OffsetDateTime now = OffsetDateTime.now(zone);
        // Guard against a clock-drifted or clearly-bad checkout that would
        // produce a zero or negative session. Bump to checkInAt + 1 second so
        // duration math is always > 0.
        if (!now.isAfter(a.getCheckInAt())) {
            now = a.getCheckInAt().plusSeconds(1);
        }
        a.setCheckOutAt(now);
        a.setCheckOutLat(lat);
        a.setCheckOutLng(lng);
        return repo.save(a);
    }

    public List<Attendance> listForEmployee(Long employeeId, OffsetDateTime from, OffsetDateTime to) {
        return repo.findByEmployeeIdAndCheckInAtBetweenOrderByCheckInAtAsc(employeeId, from, to);
    }

    /**
     * Today's attendance for one employee — most recent first.
     * Includes a session that opened yesterday and is still open today.
     */
    public List<Attendance> today(Long employeeId) {
        OffsetDateTime[] range = todayRange();
        return repo.findTodayForEmployee(employeeId, range[0], range[1]);
    }

    /** Today's attendance across all employees, joined with names. */
    public List<TodayAttendanceDto> todayAcrossOrg() {
        OffsetDateTime[] range = todayRange();
        List<Attendance> rows = repo.findByCheckInAtBetweenOrderByCheckInAtDesc(range[0], range[1]);
        if (rows.isEmpty()) return List.of();
        var ids = rows.stream().map(Attendance::getEmployeeId).distinct().toList();
        Map<Long, Employee> byId = employees.findAllById(ids).stream()
                .collect(Collectors.toMap(Employee::getId, Function.identity()));
        return rows.stream().map(a -> {
            Employee e = byId.get(a.getEmployeeId());
            return new TodayAttendanceDto(
                    a.getId(), a.getEmployeeId(),
                    e != null ? e.getName() : "—",
                    e != null ? e.getEmail() : "—",
                    a.getCheckInAt(), a.getCheckInLat(), a.getCheckInLng(),
                    a.getCheckOutAt(), a.getCheckOutLat(), a.getCheckOutLng());
        }).toList();
    }

    // ── Time helpers (package-private so the controller can reuse them) ─────

    /** Start of today through end of today in the business timezone. */
    OffsetDateTime[] todayRange() {
        LocalDate today = LocalDate.now(zone);
        OffsetDateTime from = today.atStartOfDay(zone).toOffsetDateTime();
        // End-of-day = start of tomorrow minus one second. Inclusive upper
        // bound means a check-in at 23:59:59 today still falls inside.
        OffsetDateTime to = today.plusDays(1).atStartOfDay(zone)
                .minusSeconds(1).toOffsetDateTime();
        return new OffsetDateTime[]{ from, to };
    }

    /**
     * Live elapsed seconds for an open session, capped at the configured
     * max-session-hours. Returns 0 for already-closed entries or sessions with
     * a negative duration (clock drift).
     */
    public long openSessionElapsedSeconds(Attendance a) {
        if (a == null || a.getCheckInAt() == null) return 0;
        if (a.getCheckOutAt() != null) return 0;
        long elapsed = Duration.between(a.getCheckInAt(), OffsetDateTime.now(zone)).getSeconds();
        if (elapsed < 0) return 0;
        return Math.min(elapsed, maxSessionSeconds);
    }

    /** Hours for a closed session (4dp internal), 0 if not closed. */
    public BigDecimal closedSessionHours(Attendance a) {
        if (a == null || a.getCheckInAt() == null || a.getCheckOutAt() == null) return BigDecimal.ZERO;
        long secs = Duration.between(a.getCheckInAt(), a.getCheckOutAt()).getSeconds();
        if (secs <= 0) return BigDecimal.ZERO;
        return BigDecimal.valueOf(secs)
                .divide(BigDecimal.valueOf(3600), 4, RoundingMode.HALF_UP);
    }

    public BigDecimal secondsToHours(long secs) {
        if (secs <= 0) return BigDecimal.ZERO;
        return BigDecimal.valueOf(secs)
                .divide(BigDecimal.valueOf(3600), 4, RoundingMode.HALF_UP);
    }

    private void ensureInsideGeofence(Double lat, Double lng) {
        if (lat == null || lng == null) {
            throw new IllegalArgumentException("lat and lng are required");
        }
        OrgConfig cfg = orgRepo.getSingleton();
        if (!cfg.hasGeofence()) return;
        if (!Geofence.isInside(cfg, lat, lng)) {
            double meters = Geofence.distanceMeters(
                    cfg.getGeofenceLat(), cfg.getGeofenceLng(), lat, lng);
            throw new ConflictException(String.format(
                    "outside geofence — you are %.0f m from the work site (allowed radius: %d m)",
                    meters, cfg.getGeofenceRadiusM()));
        }
    }
}
