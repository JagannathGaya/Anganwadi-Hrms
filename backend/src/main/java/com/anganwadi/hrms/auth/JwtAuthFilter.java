package com.anganwadi.hrms.auth;

import com.anganwadi.hrms.employee.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    /**
     * Endpoints that may accept the JWT in a `?token=` query parameter as a
     * fallback. Needed for browser-launched downloads (mobile uses
     * `Linking.openURL` to open the printable payslip page; browsers don't
     * attach an Authorization header on that kind of navigation).
     *
     * Keep this list tight — every entry here is a place a token could end up
     * in browser history, so only use it for personal, read-only resources.
     */
    private static final List<String> QUERY_TOKEN_ALLOWED_PATHS = List.of(
            "/payslip/print"
    );

    public JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String token = extractToken(request);
        if (token != null) {
            try {
                Claims claims = jwtService.parse(token);
                Long employeeId = jwtService.subjectAsId(claims);
                Role role = jwtService.roleOf(claims);
                String email = (String) claims.get("email");
                AuthPrincipal principal = new AuthPrincipal(employeeId, email, role);
                var auth = new UsernamePasswordAuthenticationToken(
                        principal, token,
                        List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (JwtException | IllegalArgumentException ignored) {
                SecurityContextHolder.clearContext();
            }
        }
        chain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        // 1. Standard: Authorization: Bearer <token>
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        // 2. Browser-launched-download fallback: ?token=<token>, but only for
        //    explicitly allow-listed paths.
        String path = request.getRequestURI();
        if (path != null && QUERY_TOKEN_ALLOWED_PATHS.contains(path)) {
            String qp = request.getParameter("token");
            if (qp != null && !qp.isBlank()) return qp;
        }
        return null;
    }
}
