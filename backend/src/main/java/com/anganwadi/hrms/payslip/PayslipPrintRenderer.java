package com.anganwadi.hrms.payslip;

import com.anganwadi.hrms.employee.Employee;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Renders a payslip as a self-contained printable HTML page. The user opens
 * this in their phone's browser via Linking, then uses the system "Save as
 * PDF" / "Share" controls to keep a copy.
 *
 * All CSS is inline — no external assets — so the page works offline if the
 * browser cached it, and renders identically across Android/iOS browsers.
 * The @media print block hides controls and tunes spacing for letter/A4.
 */
@Component
public class PayslipPrintRenderer {

    private static final DateTimeFormatter GENERATED_FMT =
            DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm");

    public String render(PayslipDetail detail, Employee employee, String orgName) {
        return render(detail, employee, orgName, false);
    }

    /**
     * @param autoPrint when true, embed a script that calls window.print()
     *                  shortly after page load — used by the mobile Download
     *                  flow so the user lands on the save dialog directly.
     */
    public String render(PayslipDetail detail, Employee employee, String orgName, boolean autoPrint) {
        Locale loc = Locale.forLanguageTag("en-IN");
        NumberFormat money = NumberFormat.getCurrencyInstance(loc);
        try {
            money.setCurrency(java.util.Currency.getInstance(detail.currency()));
        } catch (IllegalArgumentException ignored) { /* fall back to locale default */ }

        String empName  = escape(employee.getName());
        String empEmail = escape(employee.getEmail());
        String empCode  = String.format("EMP%04d", employee.getId());
        String period   = escape(detail.periodLabel());
        String orgLine  = escape(orgName == null ? "Anganwadi HRMS" : orgName);
        String generated = detail.generatedAt() == null ? "—"
                : GENERATED_FMT.format(detail.generatedAt());

        String paidBadge = "PAID".equals(detail.status())
                ? "<span class='pill pill-paid'>PAID</span>"
                : "<span class='pill pill-pending'>PENDING</span>";

        return ""
                + "<!DOCTYPE html>\n"
                + "<html lang='en'>\n"
                + "<head>\n"
                + "<meta charset='utf-8'>\n"
                + "<meta name='viewport' content='width=device-width, initial-scale=1'>\n"
                + "<title>Payslip · " + period + " · " + empName + "</title>\n"
                + "<style>\n"
                + "  :root { --navy: #1e3a8a; --ink: #0f172a; --muted: #64748b; --border: #e5e9ef; --pap: #f7f8fb; --pos: #047857; --warn: #b45309; }\n"
                + "  * { box-sizing: border-box; }\n"
                + "  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif; color: var(--ink); background: #f1f3f7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n"
                + "  .page { max-width: 780px; margin: 24px auto; background: #fff; padding: 36px; border-radius: 12px; box-shadow: 0 8px 24px rgba(15,23,42,0.06); }\n"
                + "  .hero { background: var(--navy); color: #fff; padding: 22px 24px; border-radius: 10px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }\n"
                + "  .hero h1 { margin: 0; font-size: 22px; letter-spacing: -0.4px; font-weight: 800; }\n"
                + "  .hero .sub { color: rgba(255,255,255,0.78); font-size: 13px; margin-top: 4px; }\n"
                + "  .hero .gross-label { font-size: 11px; font-weight: 800; letter-spacing: 1.2px; color: rgba(255,255,255,0.75); }\n"
                + "  .hero .gross { font-size: 30px; font-weight: 800; letter-spacing: -0.6px; font-variant-numeric: tabular-nums; }\n"
                + "  .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 0.4px; }\n"
                + "  .pill-paid { background: #d1fae5; color: #047857; }\n"
                + "  .pill-pending { background: #fef3c7; color: var(--warn); }\n"
                + "  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; padding: 8px 4px 24px; }\n"
                + "  .meta .k { font-size: 11px; color: var(--muted); font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }\n"
                + "  .meta .v { font-size: 14px; font-weight: 600; color: var(--ink); margin-top: 2px; }\n"
                + "  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }\n"
                + "  .card { border: 0.5px solid var(--border); border-radius: 10px; padding: 16px; }\n"
                + "  .card h3 { margin: 0 0 12px; font-size: 11px; font-weight: 800; color: var(--navy); letter-spacing: 1.2px; text-transform: uppercase; }\n"
                + "  .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px; }\n"
                + "  .row .lbl { color: var(--muted); }\n"
                + "  .row .val { font-weight: 600; font-variant-numeric: tabular-nums; }\n"
                + "  .row.total { border-top: 1px solid var(--border); margin-top: 6px; padding-top: 10px; font-size: 15px; }\n"
                + "  .row.total .lbl { color: var(--ink); font-weight: 700; }\n"
                + "  .row.total .val { font-weight: 800; }\n"
                + "  .net { background: var(--navy); color: #fff; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin: 16px 0 0; }\n"
                + "  .net .lbl { font-size: 11px; font-weight: 800; letter-spacing: 1.2px; color: rgba(255,255,255,0.75); }\n"
                + "  .net .val { font-size: 26px; font-weight: 800; letter-spacing: -0.4px; font-variant-numeric: tabular-nums; }\n"
                + "  .days { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 4px; }\n"
                + "  .day-tile { background: var(--pap); border-radius: 8px; padding: 10px; }\n"
                + "  .day-tile .v { font-size: 18px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }\n"
                + "  .day-tile .k { font-size: 10px; font-weight: 800; color: var(--muted); letter-spacing: 0.6px; text-transform: uppercase; margin-top: 2px; }\n"
                + "  .footer { margin-top: 28px; padding-top: 16px; border-top: 0.5px solid var(--border); display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }\n"
                + "  .controls { position: sticky; top: 0; background: var(--navy); color: #fff; padding: 12px 16px; margin: -36px -36px 24px; display: flex; gap: 12px; justify-content: flex-end; border-radius: 12px 12px 0 0; }\n"
                + "  .controls button { background: rgba(255,255,255,0.15); border: 0.5px solid rgba(255,255,255,0.25); color: #fff; padding: 8px 14px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; }\n"
                + "  .controls button:hover { background: rgba(255,255,255,0.25); }\n"
                + "  @media print {\n"
                + "    body { background: #fff; }\n"
                + "    .page { margin: 0; padding: 24px; box-shadow: none; max-width: none; }\n"
                + "    .controls { display: none; }\n"
                + "    .net { -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n"
                + "  }\n"
                + "  @media (max-width: 480px) {\n"
                + "    .page { margin: 0; border-radius: 0; padding: 20px; }\n"
                + "    .controls { margin: -20px -20px 16px; border-radius: 0; }\n"
                + "    .grid-2 { grid-template-columns: 1fr; }\n"
                + "    .meta { grid-template-columns: 1fr 1fr; }\n"
                + "    .days { grid-template-columns: repeat(2, 1fr); }\n"
                + "  }\n"
                + "</style>\n"
                + "</head>\n"
                + "<body>\n"
                + "<div class='page'>\n"
                + "  <div class='controls'>\n"
                + "    <button onclick='window.print()'>Save / Print PDF</button>\n"
                + "  </div>\n"
                + "  <div class='hero'>\n"
                + "    <div>\n"
                + "      <h1>" + orgLine + "</h1>\n"
                + "      <div class='sub'>Payslip · " + period + "</div>\n"
                + "    </div>\n"
                + "    <div style='text-align:right;'>\n"
                + "      <div class='gross-label'>GROSS PAY</div>\n"
                + "      <div class='gross'>" + escape(money.format(toNumber(detail.grossPay()))) + "</div>\n"
                + "      <div style='margin-top:6px;'>" + paidBadge + "</div>\n"
                + "    </div>\n"
                + "  </div>\n"
                + "  <div class='meta'>\n"
                + "    <div><div class='k'>Employee</div><div class='v'>" + empName + "</div></div>\n"
                + "    <div><div class='k'>Employee ID</div><div class='v'>" + escape(empCode) + "</div></div>\n"
                + "    <div><div class='k'>Email</div><div class='v'>" + empEmail + "</div></div>\n"
                + "    <div><div class='k'>Pay period</div><div class='v'>" + period + "</div></div>\n"
                + "  </div>\n"
                + "  <div class='grid-2'>\n"
                + "    <div class='card'>\n"
                + "      <h3>Earnings</h3>\n"
                + "      <div class='row'><span class='lbl'>Regular pay</span><span class='val'>" + escape(money.format(toNumber(detail.regularPay()))) + "</span></div>\n"
                + "      <div class='row'><span class='lbl'>Overtime pay" + (detail.manualOvertimePay() != null ? " (admin set)" : "") + "</span><span class='val'>" + escape(money.format(toNumber(detail.overtimePay()))) + "</span></div>\n"
                + (toNumber(detail.bonusAmount()) > 0
                    ? "      <div class='row'><span class='lbl'>" + escape(detail.bonusNote() != null && !detail.bonusNote().isBlank() ? "Bonus · " + detail.bonusNote() : "Bonus") + "</span><span class='val'>+" + escape(money.format(toNumber(detail.bonusAmount()))) + "</span></div>\n"
                    : "")
                + "      <div class='row total'><span class='lbl'>Gross earnings</span><span class='val'>" + escape(money.format(toNumber(detail.grossPay()))) + "</span></div>\n"
                + "    </div>\n"
                + "    <div class='card'>\n"
                + "      <h3>Deductions</h3>\n"
                + (toNumber(detail.deductions()) > 0 && detail.deductionNote() != null && !detail.deductionNote().isBlank()
                    ? "      <div class='row'><span class='lbl'>" + escape(detail.deductionNote()) + "</span><span class='val'>−" + escape(money.format(toNumber(detail.deductions()))) + "</span></div>\n"
                    : "      <div class='row'><span class='lbl'>Total deductions</span><span class='val'>−" + escape(money.format(toNumber(detail.deductions()))) + "</span></div>\n")
                + "    </div>\n"
                + "  </div>\n"
                + "  <div class='net'>\n"
                + "    <div class='lbl'>NET PAY</div>\n"
                + "    <div class='val'>" + escape(money.format(toNumber(detail.netPay()))) + "</div>\n"
                + "  </div>\n"
                + "  <div class='grid-2' style='margin-top:16px;'>\n"
                + "    <div class='card'>\n"
                + "      <h3>Hours</h3>\n"
                + "      <div class='row'><span class='lbl'>Regular</span><span class='val'>" + toNumber(detail.regularHours()) + " h</span></div>\n"
                + "      <div class='row'><span class='lbl'>Overtime</span><span class='val'>" + toNumber(detail.overtimeHours()) + " h</span></div>\n"
                + "      <div class='row total'><span class='lbl'>Total worked</span><span class='val'>" + toNumber(detail.totalHours()) + " h</span></div>\n"
                + "    </div>\n"
                + "    <div class='card'>\n"
                + "      <h3>Pay rates</h3>\n"
                + "      <div class='row'><span class='lbl'>Monthly</span><span class='val'>" + escape(money.format(toNumber(detail.monthlySalary()))) + "</span></div>\n"
                + "      <div class='row'><span class='lbl'>Daily</span><span class='val'>" + escape(money.format(toNumber(detail.dailyRate()))) + "</span></div>\n"
                + "      <div class='row'><span class='lbl'>Hourly</span><span class='val'>" + escape(money.format(toNumber(detail.hourlyRate()))) + "</span></div>\n"
                + "    </div>\n"
                + "  </div>\n"
                + "  <div class='card' style='margin-top:16px;'>\n"
                + "    <h3>Days in " + period + "</h3>\n"
                + "    <div class='days'>\n"
                + "      <div class='day-tile'><div class='v'>" + detail.daysWorked()  + "</div><div class='k'>Worked</div></div>\n"
                + "      <div class='day-tile'><div class='v'>" + detail.daysOnLeave() + "</div><div class='k'>Leave</div></div>\n"
                + "      <div class='day-tile'><div class='v'>" + detail.daysHoliday() + "</div><div class='k'>Holiday</div></div>\n"
                + "      <div class='day-tile'><div class='v'>" + detail.daysAbsent()  + "</div><div class='k'>Absent</div></div>\n"
                + "    </div>\n"
                + "  </div>\n"
                + "  <div class='footer'>\n"
                + "    <span>Generated " + escape(generated) + "</span>\n"
                + "    <span>Payslip #" + detail.id() + "</span>\n"
                + "  </div>\n"
                + "</div>\n"
                + (autoPrint
                    ? "<script>\n"
                    + "  // Wait for fonts/layout to settle so the print preview\n"
                    + "  // renders correctly, then open the OS print dialog.\n"
                    + "  window.addEventListener('load', function () {\n"
                    + "    setTimeout(function () { try { window.print(); } catch (e) {} }, 350);\n"
                    + "  });\n"
                    + "</script>\n"
                    : "")
                + "</body>\n"
                + "</html>\n";
    }

    private static double toNumber(Object x) {
        if (x == null) return 0d;
        if (x instanceof BigDecimal bd) return bd.doubleValue();
        if (x instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(x.toString()); } catch (NumberFormatException e) { return 0d; }
    }

    /** Tiny HTML-escape to keep names, emails, periods safe in the rendered page. */
    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
