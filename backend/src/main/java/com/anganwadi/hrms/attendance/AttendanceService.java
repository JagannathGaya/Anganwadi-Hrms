package com.anganwadi.hrms.attendance;

import com.anganwadi.hrms.common.ConflictException;
import com.anganwadi.hrms.common.NotFoundException;
import com.anganwadi.hrms.config_org.Geofence;
import com.anganwadi.hrms.config_org.OrgConfig;
import com.anganwadi.hrms.config_org.OrgConfigRepository;
import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class AttendanceService {

    private final AttendanceRepository repo;
    private final OrgConfigRepository orgRepo;
    private final EmployeeRepository employees;

    public AttendanceService(AttendanceRepository repo,
                             OrgConfigRepository orgRepo,
                             EmployeeRepository employees) {
        this.repo = repo;
        this.orgRepo = orgRepo;
        this.employees = employees;
    }

    @Transactional
    public Attendance checkIn(Long employeeId, Double lat, Double lng) {
        ensureInsideGeofence(lat, lng);
        repo.findFirstByEmployeeIdAndCheckOutAtIsNullOrderByCheckInAtDesc(employeeId)
                .ifPresent(a -> { throw new ConflictException("already checked in"); });
        Attendance a = new Attendance();
        a.setEmployeeId(employeeId);
        a.setCheckInAt(OffsetDateTime.now());
        a.setCheckInLat(lat);
        a.setCheckInLng(lng);
        return repo.save(a);
    }

    @Transactional
    public Attendance checkOut(Long employeeId, Double lat, Double lng) {
        ensureInsideGeofence(lat, lng);
        Attendance a = repo.findFirstByEmployeeIdAndCheckOutAtIsNullOrderByCheckInAtDesc(employeeId)
                .orElseThrow(() -> new NotFoundException("no open check-in to close"));
        a.setCheckOutAt(OffsetDateTime.now());
        a.setCheckOutLat(lat);
        a.setCheckOutLng(lng);
        return repo.save(a);
    }

    public List<Attendance> listForEmployee(Long employeeId, OffsetDateTime from, OffsetDateTime to) {
        return repo.findByEmployeeIdAndCheckInAtBetweenOrderByCheckInAtAsc(employeeId, from, to);
    }

    /** Today's attendance for one employee — most recent first. */
    public List<Attendance> today(Long employeeId) {
        var range = todayRange();
        return repo.findByEmployeeIdAndCheckInAtBetweenOrderByCheckInAtDesc(
                employeeId, range[0], range[1]);
    }

    /** Today's attendance across all employees, joined with names. */
    public List<TodayAttendanceDto> todayAcrossOrg() {
        var range = todayRange();
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

    private OffsetDateTime[] todayRange() {
        LocalDate today = LocalDate.now();
        OffsetDateTime from = today.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime to   = today.atTime(23, 59, 59).atOffset(ZoneOffset.UTC);
        return new OffsetDateTime[]{ from, to };
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
