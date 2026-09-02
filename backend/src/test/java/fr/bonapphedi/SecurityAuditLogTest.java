package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import fr.bonapphedi.auth.AppUser;
import fr.bonapphedi.auth.AppUserPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
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

    @Autowired
    private JdbcClient jdbc;

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
                .as("nothing was written to fr.bonapphedi.security, so the event left no trace")
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

    @Test
    void aModerationDecisionIsRecorded() throws Exception {
        // Criterion 4 of ADR 17 names three things — a failed admin attempt, a
        // 401, and a moderation action. The first two are held above. This one
        // was written in AdminController and asserted nowhere, so deleting the
        // audit.info call broke the criterion and left every test green.
        //
        // It is not a refusal, so it does not go through the filter at all: it
        // is the only line the application writes about something that
        // succeeded, and the only record of who decided what about a stranger's
        // remark.

        // Put the seeded pending comment back rather than trusting it to be
        // there. This test approves it, the database file persists between
        // runs, and a second `mvnw test` would otherwise find nothing PENDING
        // and fail on an empty result rather than on the thing being asserted.
        jdbc.sql("DELETE FROM comment WHERE display_name = 'Anonyme'").update();
        jdbc.sql(
                        """
                        INSERT INTO comment (recipe_id, user_id, display_name, body_markdown, body_html, status, created_at)
                        VALUES (2, NULL, 'Anonyme', 'premier !!!', '<p>premier !!!</p>', 'PENDING', '2026-07-25T12:00:00Z')
                        """)
                .update();

        long id = jdbc.sql("SELECT id FROM comment WHERE status = 'PENDING'")
                .query(Long.class)
                .single();

        mvc.perform(post("/api/admin/comments/{id}/moderate", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true}")
                        .with(oauth2Login().oauth2User(new AppUserPrincipal(
                                new AppUser(1, "google", "g-1", "Hédi", "hedi@example.com", true))))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        assertThat(onlyLine()).contains("moderated comment=" + id).contains("approved=true");
    }
}
