package com.anganwadi.hrms.payslip;

import com.anganwadi.hrms.auth.AuthPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.YearMonth;
import java.time.format.DateTimeParseException;

@RestController
@RequestMapping("/payslip")
public class PayslipController {

    private final PayslipService payslipService;

    public PayslipController(PayslipService payslipService) {
        this.payslipService = payslipService;
    }

    /**
     * Rich payslip detail for the given month — includes the calendar
     * breakdown (worked/leave/holiday/absent days), daily/hourly rates, a
     * deductions placeholder, and the derived net pay.
     *
     * The response shape is now PayslipDetail. Older clients that only read
     * the flat fields (id, month, totalHours, regularPay, overtimePay,
     * grossPay, paid, generatedAt) continue to work — those names are
     * preserved as a strict subset of the new payload.
     */
    @GetMapping
    public ResponseEntity<PayslipDetail> mySlip(@AuthenticationPrincipal AuthPrincipal principal,
                                                @RequestParam("month") String month) {
        YearMonth ym = parseMonth(month);
        return ResponseEntity.ok(payslipService.generateDetail(principal.employeeId(), ym));
    }

    static YearMonth parseMonth(String s) {
        try {
            return YearMonth.parse(s);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("month must be YYYY-MM");
        }
    }
}
