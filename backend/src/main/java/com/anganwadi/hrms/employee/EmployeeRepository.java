package com.anganwadi.hrms.employee;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

public interface EmployeeRepository extends JpaRepository<Employee, Long> {
    Optional<Employee> findByEmail(String email);

    boolean existsByEmail(String email);

    List<Employee> findByActiveTrueOrderByNameAsc();

    List<Employee> findByNameContainingIgnoreCaseOrEmailContainingIgnoreCaseOrderByNameAsc(String name, String email);

    long countByActiveTrue();

    long countByCreatedAtAfter(OffsetDateTime since);
}
