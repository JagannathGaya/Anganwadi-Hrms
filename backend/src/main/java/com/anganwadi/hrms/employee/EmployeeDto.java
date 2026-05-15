package com.anganwadi.hrms.employee;

import com.anganwadi.hrms.shift.Shift;
import com.anganwadi.hrms.shift.ShiftRef;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record EmployeeDto(
        Long id,
        String name,
        String email,
        String phone,
        Role role,
        BigDecimal monthlySalary,
        boolean active,
        ShiftRef shift,
        OffsetDateTime createdAt
) {
    public static EmployeeDto from(Employee e) {
        return new EmployeeDto(e.getId(), e.getName(), e.getEmail(), e.getPhone(),
                e.getRole(), e.getMonthlySalary(), e.isActive(), null, e.getCreatedAt());
    }

    public static EmployeeDto from(Employee e, Shift shift) {
        return new EmployeeDto(e.getId(), e.getName(), e.getEmail(), e.getPhone(),
                e.getRole(), e.getMonthlySalary(), e.isActive(), ShiftRef.from(shift), e.getCreatedAt());
    }
}
