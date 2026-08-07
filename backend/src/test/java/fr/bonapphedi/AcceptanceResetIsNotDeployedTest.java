package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The reset endpoint must not exist outside the acceptance run.
 *
 * <p>It drops every table and re-runs the migrations. Reachable in production
 * that is not a bug, it is the whole site — recipes, comments, ratings and
 * accounts — behind one unauthenticated POST. Nothing about the endpoint itself
 * defends against that; the only thing standing between it and a live database
 * is {@code @Profile("acceptance")}, and a single careless edit removes it.
 *
 * <p>So it gets a test, for the same reason {@code ApiSecurityMatrixTest} exists:
 * every other security rule here covers something somebody remembered to write
 * down, and the dangerous thing is the one nobody thought about.
 *
 * <p>Two assertions rather than one, deliberately. The 404 is what an attacker
 * would meet; the absent bean is why. Checking only the route would still pass
 * if the controller were mapped somewhere else, and checking only the bean would
 * pass if something else exposed the same behaviour.
 *
 * <p>Confirmed to fail by removing the profile annotation once. It does.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {"spring.datasource.url=jdbc:sqlite:file:./target/test-no-reset.db?foreign_keys=on"})
class AcceptanceResetIsNotDeployedTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ApplicationContext context;

    @Test
    void theEndpointIsNotThereWithoutTheAcceptanceProfile() throws Exception {
        // No profile is active here, which is what a jar started by the systemd
        // unit looks like before --spring.profiles.active=prod is applied.
        //
        // `with(csrf())` matters and is not boilerplate: without it this answers
        // 403 whether the endpoint exists or not, because the CSRF filter runs
        // long before anything looks for a handler. The test then passes for a
        // reason unrelated to what it claims to check, and would keep passing
        // with the profile annotation removed.
        mvc.perform(post("/api/test/reset").with(csrf())).andExpect(status().isNotFound());
    }

    @Test
    void nothingEvenBuildsTheControllerWithoutTheAcceptanceProfile() {
        assertThat(context.getBeanNamesForType(fr.bonapphedi.api.AcceptanceResetController.class))
                .as("the reset controller exists outside the acceptance profile")
                .isEmpty();
    }
}
