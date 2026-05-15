package com.anganwadi.hrms.employee;

import com.anganwadi.hrms.common.ConflictException;
import com.anganwadi.hrms.common.NotFoundException;
import com.anganwadi.hrms.shift.Shift;
import com.anganwadi.hrms.shift.ShiftRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class EmployeeService {

    private final EmployeeRepository repo;
    private final ShiftRepository shifts;
    private final PasswordEncoder encoder;

    public EmployeeService(EmployeeRepository repo, ShiftRepository shifts, PasswordEncoder encoder) {
        this.repo = repo;
        this.shifts = shifts;
        this.encoder = encoder;
    }

    public Employee getById(Long id) {
        return repo.findById(id).orElseThrow(() -> new NotFoundException("employee not found"));
    }

    public Shift shiftFor(Employee e) {
        if (e == null || e.getShiftId() == null) return null;
        return shifts.findById(e.getShiftId()).orElse(null);
    }

    public Map<Long, Shift> shiftsByEmployees(List<Employee> es) {
        var ids = es.stream().map(Employee::getShiftId).filter(java.util.Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) return Map.of();
        return shifts.findAllById(ids).stream().collect(Collectors.toMap(Shift::getId, Function.identity()));
    }

    public List<Employee> search(String q) {
        if (q == null || q.isBlank()) return repo.findAll();
        return repo.findByNameContainingIgnoreCaseOrEmailContainingIgnoreCaseOrderByNameAsc(q, q);
    }

    @Transactional
    public Employee updateSelf(Long id, String name, String phone) {
        Employee e = getById(id);
        if (name != null && !name.isBlank()) e.setName(name);
        if (phone != null) e.setPhone(phone);
        return repo.save(e);
    }

    @Transactional
    public Employee createByAdmin(String name, String email, String phone,
                                  String password, BigDecimal monthlySalary, Role role,
                                  Long shiftId) {
        String norm = email.trim().toLowerCase();
        if (repo.existsByEmail(norm)) throw new ConflictException("email already in use");
        if (shiftId != null && !shifts.existsById(shiftId))
            throw new NotFoundException("shift not found");
        Employee e = new Employee();
        e.setName(name);
        e.setEmail(norm);
        e.setPhone(phone);
        e.setPasswordHash(encoder.encode(password));
        e.setRole(role == null ? Role.EMPLOYEE : role);
        e.setMonthlySalary(monthlySalary == null ? BigDecimal.ZERO : monthlySalary);
        e.setShiftId(shiftId);
        e.setActive(true);
        return repo.save(e);
    }

    @Transactional
    public Employee updateByAdmin(Long id, String name, String phone,
                                  BigDecimal monthlySalary, Boolean active, Role role,
                                  Long shiftId, boolean shiftIdProvided,
                                  String newPassword) {
        Employee e = getById(id);
        if (name != null && !name.isBlank()) e.setName(name);
        if (phone != null) e.setPhone(phone);
        if (monthlySalary != null) e.setMonthlySalary(monthlySalary);
        if (active != null) e.setActive(active);
        if (role != null) e.setRole(role);
        if (shiftIdProvided) {
            if (shiftId != null && !shifts.existsById(shiftId))
                throw new NotFoundException("shift not found");
            e.setShiftId(shiftId);
        }
        if (newPassword != null && !newPassword.isBlank()) {
            e.setPasswordHash(encoder.encode(newPassword));
        }
        return repo.save(e);
    }

    @Transactional
    public void deactivate(Long id) {
        Employee e = getById(id);
        e.setActive(false);
        repo.save(e);
    }
}
