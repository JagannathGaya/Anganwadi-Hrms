package com.anganwadi.hrms.holiday;

import com.anganwadi.hrms.common.ConflictException;
import com.anganwadi.hrms.common.NotFoundException;
import com.anganwadi.hrms.config_org.OrgConfigRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
public class HolidayController {

    private final HolidayRepository repo;
    private final OrgConfigRepository cfg;
    private final ZoneId zone;

    public HolidayController(HolidayRepository repo,
                             OrgConfigRepository cfg,
                             @Value("${app.timezone:Asia/Kolkata}") String tz) {
        this.repo = repo;
        this.cfg = cfg;
        this.zone = ZoneId.of(tz);
    }

    /**
     * Public holiday list. Accepts an optional `year` (returns the whole year)
     * or `from`/`to` (custom date range). With no params returns the full list
     * ordered chronologically.
     *
     * Response shape is `HolidayDetail` — each row carries the weekday and a
     * `daysUntil` count so the client doesn't have to redo date math.
     */
    @GetMapping("/holidays")
    public ResponseEntity<List<HolidayDetail>> list(
            @RequestParam(value = "year", required = false) Integer year,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(value = "to",   required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        List<Holiday> rows;
        if (year != null) {
            rows = repo.findByDateBetweenOrderByDateAsc(
                    LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
        } else if (from != null && to != null) {
            rows = repo.findByDateBetweenOrderByDateAsc(from, to);
        } else {
            rows = repo.findAllByOrderByDateAsc();
        }
        LocalDate today = LocalDate.now(zone);
        List<HolidayDetail> out = new ArrayList<>(rows.size());
        for (Holiday h : rows) out.add(HolidayDetail.from(h, today));
        return ResponseEntity.ok(out);
    }

    @GetMapping("/admin/holidays/quota")
    public ResponseEntity<Map<String, Object>> quota(
            @RequestParam(value = "year", required = false) Integer year) {
        int y = year != null ? year : LocalDate.now(zone).getYear();
        long used = repo.countByDateBetween(LocalDate.of(y, 1, 1), LocalDate.of(y, 12, 31));
        int quota = cfg.getSingleton().getAnnualHolidayQuota();
        return ResponseEntity.ok(Map.of("year", y, "used", used, "quota", quota,
                "remaining", Math.max(0, quota - used)));
    }

    @PostMapping("/admin/holidays")
    public ResponseEntity<Holiday> create(@Valid @RequestBody CreateRequest req) {
        Holiday h = new Holiday();
        h.setDate(req.date());
        h.setName(req.name().trim());
        try {
            return ResponseEntity.ok(repo.save(h));
        } catch (DataIntegrityViolationException e) {
            throw new ConflictException("a holiday already exists on " + req.date());
        }
    }

    @DeleteMapping("/admin/holidays/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        if (!repo.existsById(id)) throw new NotFoundException("holiday not found");
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    public record CreateRequest(@NotNull LocalDate date, @NotBlank String name) {}
}
