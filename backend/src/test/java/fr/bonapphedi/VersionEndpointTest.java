package fr.bonapphedi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * {@code /api/version} says which commit is running.
 *
 * <p>The endpoint is three lines and the thing that can break is not in them.
 * It is the {@code build-info} execution in the pom: delete it and the
 * application still starts, still serves every page, and answers this route
 * with {@code "unknown"} for ever. Nothing else in the suite touches
 * {@code META-INF/build-info.properties}, so the first assertion here is the
 * only one that would notice - which is the same reason
 * {@code AppUserRegistryTest} grew a wiring test.
 *
 * <p>Anonymous, because the point of the endpoint is being able to ask the
 * running site what it is without holding a session or an ssh key.
 *
 * <p>Confirmed to fail by removing the pom execution once. It does, on the
 * first assertion, with the message below - but only under `mvnw clean test`.
 * The goal writes into target/classes and nothing deletes it, so a plain
 * `mvnw test` reads the file the previous build left and passes with the
 * execution already gone. CI checks out fresh and never sees that; a local run
 * that is asserting anything about this file has to clean first.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(
        properties = {"spring.datasource.url=jdbc:sqlite:file:./target/test-version.db?foreign_keys=on"})
class VersionEndpointTest {

    @Autowired
    private MockMvc mvc;

    private static Properties buildInfo() throws Exception {
        var resource = new ClassPathResource("META-INF/build-info.properties");
        assertThat(resource.exists())
                .as("META-INF/build-info.properties is not on the classpath, so the jar carries no identity "
                        + "and /api/version can only ever answer \"unknown\" - restore the build-info "
                        + "execution of spring-boot-maven-plugin in backend/pom.xml")
                .isTrue();

        var properties = new Properties();
        try (var in = resource.getInputStream()) {
            properties.load(in);
        }
        return properties;
    }

    @Test
    void theBuildRecordsWhichCommitItCameFrom() throws Exception {
        assertThat(buildInfo().getProperty("build.commit"))
                .as("the build-info execution no longer writes the commit - check <additionalProperties> "
                        + "and the bah.commit property in backend/pom.xml")
                .isNotBlank();
    }

    @Test
    void theEndpointReportsIt() throws Exception {
        var info = buildInfo();

        mvc.perform(get("/api/version"))
                .andExpect(status().isOk())
                // Equal to the file rather than merely non-empty: the controller
                // falls back to "unknown" on its own, so asserting "something is
                // there" would pass with the wiring gone.
                .andExpect(jsonPath("$.commit").value(info.getProperty("build.commit")))
                .andExpect(jsonPath("$.builtAt").value(notNullValue()));
    }
}
