package com.anganwadi.hrms.payslip;

import com.anganwadi.hrms.attendance.Attendance;
import com.anganwadi.hrms.attendance.AttendanceRepository;
import com.anganwadi.hrms.common.NotFoundException;
import com.anganwadi.hrms.config_org.OrgConfigRepository;
import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import com.anganwadi.hrms.holiday.Holiday;
import com.anganwadi.hrms.holiday.HolidayRepository;
import com.anganwadi.hrms.leave_req.LeaveRepository;
import com.anganwadi.hrms.leave_req.LeaveRequest;
import com.anganwadi.hrms.leave_req.LeaveStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class PayslipService {

    private final EmployeeRepository employees;
    private final AttendanceRepository attendances;
    private final PayslipRepository payslips;
    private final HolidayRepository holidays;
    private final LeaveRepository leaves;
    private final OrgConfigRepository orgRepo;

    public PayslipService(EmployeeRepository employees,
                          AttendanceRepository attendances,
                          PayslipRepository payslips,
                          HolidayRepository holidays,
                          LeaveRepository leaves,
                          OrgConfigRepository orgRepo) {
        this.employees = employees;
        this.attendances = attendances;
        this.payslips = payslips;
        this.holidays = holidays;
        this.leaves = leaves;
        this.orgRepo = orgRepo;
    }

    /**
     * Returns the payslip for (employee, month) and re-computes it from
     * attendance entries, holidays, and approved leave records.
     */
    @Transactional
    public Payslip generateOrRefresh(Long employeeId, YearMonth month) {
        Employee employee = employees.findById(employeeId)
                .orElseThrow(() -> new NotFoundException("employee not found"));

        LocalDate monthStart = month.atDay(1);
        LocalDate monthEnd   = month.atEndOfMonth();
        OffsetDateTime from = monthStart.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime to   = monthEnd.atTime(23, 59, 59).atOffset(ZoneOffset.UTC);

        List<Attendance> entries = attendances
                .findByEmployeeIdAndCheckInAtBetweenOrderByCheckInAtAsc(employeeId, from, to);

        Set<LocalDate> credited = new HashSet<>();
        for (Holiday h : holidays.findByDateBetweenOrderByDateAsc(monthStart, monthEnd)) {
            credited.add(h.getDate());
        }
        List<LeaveRequest> approved = leaves
                .findByEmployeeIdAndStatusAndFromDateLessThanEqualAndToDateGreaterThanEqual(
                        employeeId, LeaveStatus.APPROVED, monthEnd, monthStart);
        for (LeaveRequest lr : approved) {
            LocalDate s = lr.getFromDate().isBefore(monthStart) ? monthStart : lr.getFromDate();
            LocalDate e = lr.getToDate().isAfter(monthEnd)      ? monthEnd   : lr.getToDate();
            for (LocalDate d = s; !d.isAfter(e); d = d.plusDays(1)) credited.add(d);
        }

        var dailyHours = orgRepo.getSingleton().getDailyHours();
        SalaryCalculator.Result r = SalaryCalculator.compute(
                month, employee.getMonthlySalary(), dailyHours, entries, credited);

        String monthKey = month.toString();
        Payslip slip = payslips.findByEmployeeIdAndMonth(employeeId, monthKey)
                .orElseGet(() -> {
                    Payslip p = new Payslip();
                    p.setEmployeeId(employeeId);
                    p.setMonth(monthKey);
                    return p;
                });
        slip.setTotalHours(r.totalHours);
        slip.setRegularPay(r.regularPay);
        slip.setOvertimePay(r.overtimePay);
        slip.setGrossPay(r.grossPay);
        slip.setGeneratedAt(OffsetDateTime.now());
        return payslips.save(slip);
    }

    @Transactional
    public Payslip markPaid(Long payslipId) {
        Payslip p = payslips.findById(payslipId)
                .orElseThrow(() -> new NotFoundException("payslip not found"));
        p.setPaid(true);
        return payslips.save(p);
    }

    public List<Payslip> listForMonth(String month) {
        return payslips.findByMonthOrderByEmployeeIdAsc(month);
    }
}
