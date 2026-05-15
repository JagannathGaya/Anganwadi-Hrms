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

    @GetMapping
    public ResponseEntity<Payslip> mySlip(@AuthenticationPrincipal AuthPrincipal principal,
                                          @RequestParam("month") String month) {
        YearMonth ym = parseMonth(month);
        return ResponseEntity.ok(payslipService.generateOrRefresh(principal.employeeId(), ym));
    }

    static YearMonth parseMonth(String s) {
        try {
            return YearMonth.parse(s);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("month must be YYYY-MM");
        }
    }
}
