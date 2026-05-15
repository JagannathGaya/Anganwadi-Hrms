package com.anganwadi.hrms.payslip;

import com.anganwadi.hrms.attendance.Attendance;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SalaryCalculatorTest {

    private static final BigDecimal DAILY = new BigDecimal("6.00");
    // 31 days in May 2026 → daily_pay = 9300/31 = 300 exactly. Easy to assert.
    private static final BigDecimal SALARY_31_DAY = new BigDecimal("9300.00");
    private static final YearMonth MAY_2026 = YearMonth.of(2026, 5);

    private static Attendance entry(OffsetDateTime in, double hours) {
        Attendance a = new Attendance();
        a.setCheckInAt(in);
        a.setCheckOutAt(in.plusMinutes((long) (hours * 60)));
        return a;
    }

    @Test
    void noEntries_zeroPay() {
        var r = SalaryCalculator.compute(MAY_2026, SALARY_31_DAY, DAILY, List.of(), Set.of());
        assertEquals(new BigDecimal("0.00"), r.totalHours);
        assertEquals(new BigDecimal("0.00"), r.regularPay);
        assertEquals(new BigDecimal("0.00"), r.overtimePay);
        assertEquals(new BigDecimal("0.00"), r.grossPay);
    }

    @Test
    void oneFullSixHourDay_paysOneDayPro_rata() {
        OffsetDateTime mon = OffsetDateTime.of(2026, 5, 4, 9, 0, 0, 0, ZoneOffset.UTC);
        var r = SalaryCalculator.compute(
                MAY_2026, SALARY_31_DAY, DAILY,
                List.of(entry(mon, 6)),
                Set.of());
        assertEquals(new BigDecimal("6.00"), r.totalHours);
        assertEquals(new BigDecimal("300.00"), r.regularPay);   // 1 * (9300/31)
        assertEquals(new BigDecimal("0.00"),   r.overtimePay);
        assertEquals(new BigDecimal("300.00"), r.grossPay);
    }

    @Test
    void halfADay_paysHalfTheDailyRate() {
        OffsetDateTime mon = OffsetDateTime.of(2026, 5, 4, 9, 0, 0, 0, ZoneOffset.UTC);
        var r = SalaryCalculator.compute(
                MAY_2026, SALARY_31_DAY, DAILY,
                List.of(entry(mon, 3)),  // 3h of a 6h day → 0.5 credit
                Set.of());
        assertEquals(new BigDecimal("3.00"),   r.totalHours);
        assertEquals(new BigDecimal("150.00"), r.regularPay);
        assertEquals(new BigDecimal("0.00"),   r.overtimePay);
    }

    @Test
    void overtime_paysHourlyEquivalentTimesOnePointFive() {
        OffsetDateTime mon = OffsetDateTime.of(2026, 5, 4, 9, 0, 0, 0, ZoneOffset.UTC);
        // 8h day → full credit (300) + 2h OT @ (300/6)*1.5 = 50*1.5 = 75 each = 150
        var r = SalaryCalculator.compute(
                MAY_2026, SALARY_31_DAY, DAILY,
                List.of(entry(mon, 8)),
                Set.of());
        assertEquals(new BigDecimal("8.00"),   r.totalHours);
        assertEquals(new BigDecimal("300.00"), r.regularPay);
        assertEquals(new BigDecimal("150.00"), r.overtimePay);
        assertEquals(new BigDecimal("450.00"), r.grossPay);
    }

    @Test
    void fullMonth_paysExactlyMonthlySalary() {
        // 31 days in May, 6h every day → totalDayCredit = 31, regular = monthly_salary
        Set<LocalDate> all = new HashSet<>();
        for (LocalDate d = MAY_2026.atDay(1); !d.isAfter(MAY_2026.atEndOfMonth()); d = d.plusDays(1)) {
            all.add(d); // treat them as credited (e.g. holidays/leaves) — same effect
        }
        var r = SalaryCalculator.compute(MAY_2026, SALARY_31_DAY, DAILY, List.of(), all);
        assertEquals(new BigDecimal("9300.00"), r.regularPay);
        assertEquals(new BigDecimal("0.00"),    r.overtimePay);
        assertEquals(new BigDecimal("9300.00"), r.grossPay);
    }

    @Test
    void holidayCreditedFullDay_evenWithoutAttendance() {
        var r = SalaryCalculator.compute(
                MAY_2026, SALARY_31_DAY, DAILY,
                List.of(),
                Set.of(LocalDate.of(2026, 5, 4), LocalDate.of(2026, 5, 5)));
        assertEquals(new BigDecimal("12.00"),  r.totalHours);
        assertEquals(new BigDecimal("600.00"), r.regularPay);  // 2 * (9300/31)
        assertEquals(new BigDecimal("0.00"),   r.overtimePay);
    }

    @Test
    void holidayTakesPrecedenceOverAttendance() {
        OffsetDateTime mon = OffsetDateTime.of(2026, 5, 4, 9, 0, 0, 0, ZoneOffset.UTC);
        var r = SalaryCalculator.compute(
                MAY_2026, SALARY_31_DAY, DAILY,
                List.of(entry(mon, 9)),  // attendance ignored when day is credited
                Set.of(LocalDate.of(2026, 5, 4)));
        assertEquals(new BigDecimal("6.00"),   r.totalHours);
        assertEquals(new BigDecimal("300.00"), r.regularPay);
        assertEquals(new BigDecimal("0.00"),   r.overtimePay);
    }

    @Test
    void entriesOutsideTargetMonth_areIgnored() {
        OffsetDateTime apr = OffsetDateTime.of(2026, 4, 27, 9, 0, 0, 0, ZoneOffset.UTC);
        OffsetDateTime may = OffsetDateTime.of(2026, 5, 4,  9, 0, 0, 0, ZoneOffset.UTC);
        var r = SalaryCalculator.compute(
                MAY_2026, SALARY_31_DAY, DAILY,
                List.of(entry(apr, 6), entry(may, 3)),
                Set.of());
        assertEquals(new BigDecimal("3.00"),   r.totalHours);
        assertEquals(new BigDecimal("150.00"), r.regularPay);
    }

    @Test
    void openCheckIn_isIgnored() {
        Attendance open = new Attendance();
        open.setCheckInAt(OffsetDateTime.of(2026, 5, 4, 9, 0, 0, 0, ZoneOffset.UTC));
        var r = SalaryCalculator.compute(
                MAY_2026, SALARY_31_DAY, DAILY, List.of(open), Set.of());
        assertEquals(new BigDecimal("0.00"), r.totalHours);
    }

    @Test
    void zeroSalary_returnsZeroPay() {
        OffsetDateTime mon = OffsetDateTime.of(2026, 5, 4, 9, 0, 0, 0, ZoneOffset.UTC);
        var r = SalaryCalculator.compute(
                MAY_2026, BigDecimal.ZERO, DAILY,
                List.of(entry(mon, 8)),
                Set.of());
        assertTrue(r.totalHours.compareTo(BigDecimal.ZERO) > 0);
        assertEquals(new BigDecimal("0.00"), r.regularPay);
        assertEquals(new BigDecimal("0.00"), r.overtimePay);
    }
}
