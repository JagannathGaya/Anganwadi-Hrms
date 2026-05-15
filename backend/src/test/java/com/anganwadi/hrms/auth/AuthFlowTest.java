package com.anganwadi.hrms.auth;

import com.anganwadi.hrms.employee.Employee;
import com.anganwadi.hrms.employee.EmployeeRepository;
import com.anganwadi.hrms.employee.Role;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import java.math.BigDecimal;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AuthFlowTest {

    @Autowired private MockMvc mvc;
    @Autowired private EmployeeRepository employees;
    @Autowired private PasswordEncoder encoder;
    @Autowired private ObjectMapper json;

    @BeforeEach
    void setup() {
        employees.deleteAll();
        Employee e = new Employee();
        e.setName("Test Employee");
        e.setEmail("emp@test.local");
        e.setPasswordHash(encoder.encode("password123"));
        e.setRole(Role.EMPLOYEE);
        e.setMonthlySalary(new BigDecimal("12000.00"));
        e.setActive(true);
        employees.save(e);

        Employee a = new Employee();
        a.setName("Test Admin");
        a.setEmail("admin@test.local");
        a.setPasswordHash(encoder.encode("password123"));
        a.setRole(Role.ADMIN);
        a.setActive(true);
        employees.save(a);
    }

    @Test
    void rejectsBadPassword() throws Exception {
        mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"emp@test.local\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void issuesTokenAndAccessesMe() throws Exception {
        String body = mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"emp@test.local\",\"password\":\"password123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode node = json.readTree(body);
        String token = node.get("token").asText();

        mvc.perform(get("/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("emp@test.local"))
                .andExpect(jsonPath("$.role").value("EMPLOYEE"));
    }

    @Test
    void employeeCannotHitAdminRoutes() throws Exception {
        String body = mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"emp@test.local\",\"password\":\"password123\"}"))
                .andReturn().getResponse().getContentAsString();
        String token = json.readTree(body).get("token").asText();

        mvc.perform(get("/admin/employees").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanHitAdminRoutes() throws Exception {
        String body = mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"admin@test.local\",\"password\":\"password123\"}"))
                .andReturn().getResponse().getContentAsString();
        String token = json.readTree(body).get("token").asText();

        mvc.perform(get("/admin/employees").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void unauthenticatedRequestRejected() throws Exception {
        mvc.perform(get("/me")).andExpect(status().isUnauthorized());
    }
}
