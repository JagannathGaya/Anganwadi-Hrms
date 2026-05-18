package com.anganwadi.hrms.payslip;

import com.anganwadi.hrms.auth.AuthPrincipal;
import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import org.springframework.http.MediaType;
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
    private final PayslipPrintRenderer renderer;
    private final EmployeeRepository employees;

    public PayslipController(PayslipService payslipService,
                             PayslipPrintRenderer renderer,
                             EmployeeRepository employees) {
        this.payslipService = payslipService;
        this.renderer = renderer;
        this.employees = employees;
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

    /**
     * Printable HTML view of the authenticated employee's payslip. The user
     * opens this URL via Linking on mobile; the system browser handles
     * "Save as PDF" / share via the page's own button or the browser's menu.
     *
     * This endpoint is special-cased in `JwtAuthFilter` to also accept the
     * token as a `?token=` query parameter — needed because browsers don't
     * attach an Authorization header to a navigation-style URL open.
     *
     * Pass `?download=1` to make the page auto-fire the print / save dialog
     * on load — used by the mobile Download button so the user lands
     * directly on the save sheet without any extra taps.
     */
    @GetMapping(value = "/print", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> print(@AuthenticationPrincipal AuthPrincipal principal,
                                        @RequestParam("month") String month,
                                        @RequestParam(value = "download", required = false) String download) {
        YearMonth ym = parseMonth(month);
        PayslipDetail detail = payslipService.generateDetail(principal.employeeId(), ym);
        Employee employee = employees.findById(principal.employeeId()).orElseThrow();
        boolean autoPrint = "1".equals(download) || "true".equalsIgnoreCase(download);
        String html = renderer.render(detail, employee, "AnganwadiHrms", autoPrint);
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .body(html);
    }

    static YearMonth parseMonth(String s) {
        try {
            return YearMonth.parse(s);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("month must be YYYY-MM");
        }
    }
}
