package fr.bonapphedi.config;

import java.time.Instant;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.data.convert.ReadingConverter;
import org.springframework.data.convert.WritingConverter;
import org.springframework.data.jdbc.core.convert.JdbcCustomConversions;
import org.springframework.data.relational.core.dialect.Dialect;

/**
 * The two pieces Spring Data JDBC cannot infer for SQLite.
 */
@Configuration
public class JdbcConfig {

    /**
     * Overrides Boot's {@code jdbcDialect}, which resolves by asking the driver
     * and has nothing to offer for SQLite.
     */
    @Bean
    public Dialect jdbcDialect() {
        return SqliteDialect.INSTANCE;
    }

    /**
     * SQLite has no date or time type - everything is TEXT, INTEGER or REAL - so
     * the driver will not map an Instant in either direction and these have to
     * be registered explicitly (ADR 0002).
     *
     * <p>ISO-8601 UTC as TEXT rather than an epoch number, because it sorts
     * lexicographically, which is what every "newest first" query relies on, and
     * because a human reading the database file can tell what it says.
     */
    @Bean
    public JdbcCustomConversions jdbcCustomConversions() {
        return new JdbcCustomConversions(List.of(InstantToString.INSTANCE, StringToInstant.INSTANCE));
    }

    @WritingConverter
    enum InstantToString implements Converter<Instant, String> {
        INSTANCE;

        @Override
        public String convert(Instant source) {
            return source.toString();
        }
    }

    @ReadingConverter
    enum StringToInstant implements Converter<String, Instant> {
        INSTANCE;

        @Override
        public Instant convert(String source) {
            return Instant.parse(source);
        }
    }
}
