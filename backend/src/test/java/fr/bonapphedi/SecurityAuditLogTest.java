package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The security log says something, and says the right things (ADR 17).
 *
 * <p>Worth a test for the same reason the sign-out notice was: a log line is
 * invisible to every other kind of check. Nothing fails when it stops being
 * written, no assertion covers it, and the way you find out is by going looking
 * for a refused request after somebody has been probing — which is the one
 * moment it must already have been working.
 *
 * <p>The negative assertions matter as much as the positive ones. The privacy
 * page says this application stores no raw address, and a security log is
 * exactly where one would end up by accident — {@code request.getRemoteAddr()}
 * is one call away and looks obviously useful. So this checks a refusal is
 * recorded <em>and</em> that the address and the query string are not in it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = "spring.datasource.url=jdbc:sqlite:file:./target/test-audit.db?foreign_keys=on")
class SecurityAuditLogTest {

    @Autowired
    private MockMvc mvc;

    private ListAppender<ILoggingEvent> captured;
    private ch.qos.logback.classic.Logger audit;

    @BeforeEach
    void captureTheSecurityLogger() {
        audit = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger("fr.bonapphedi.security");
        captured = new ListAppender<>();
        captured.start();
        audit.addAppender(captured);
    }

    @AfterEach
    void stopCapturing() {
        audit.detachAppender(captured);
        captured.stop();
    }

    private String onlyLine() {
        assertThat(captured.list)
                .as("nothing was written to fr.bonapphedi.security, so a refusal left no trace")
                .isNotEmpty();
        return captured.list.get(0).getFormattedMessage();
    }

    @Test
    void anAnonymousVisitorAskingForTheAdminAreaIsRecorded() throws Exception {
        mvc.perform(get("/api/admin/recipes")).andExpect(status().isUnauthorized());

        assertThat(onlyLine())
                .contains("status=401")
                .contains("method=GET")
                .contains("path=/api/admin/recipes")
                .contains("user=anonymous");
    }

    @Test
    void theLineCarriesNoAddressAndNoQueryString() throws Exception {
        // The query string is where a bookmarks share link puts somebody's saved
        // recipes, and the address is what the privacy page promises is not
        // stored. Both are one obvious-looking call away from being in here.
        mvc.perform(get("/api/admin/recipes").param("r", "babka,shakshuka").with(request -> {
                    request.setRemoteAddr("203.0.113.42");
                    return request;
                }))
                .andExpect(status().isUnauthorized());

        assertThat(onlyLine()).doesNotContain("203.0.113.42").doesNotContain("babka");
    }

    @Test
    void anOrdinaryRequestIsNotLogged() throws Exception {
        // A log that records everything is one nobody reads. Only refusals.
        mvc.perform(get("/api/recipes").param("locale", "fr")).andExpect(status().isOk());

        assertThat(captured.list)
                .as("a successful public read should leave the security log alone")
                .isEmpty();
    }

    @Test
    void refusalsAreWarnings() throws Exception {
        // The nightly digest selects on level as well as on logger name, and a
        // refusal logged at INFO would be filtered out of it silently.
        mvc.perform(get("/api/admin/recipes")).andExpect(status().isUnauthorized());

        assertThat(captured.list.get(0).getLevel()).isEqualTo(Level.WARN);
    }
}
