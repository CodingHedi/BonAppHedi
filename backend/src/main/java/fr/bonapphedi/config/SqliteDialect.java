package fr.bonapphedi.config;

import org.springframework.data.relational.core.dialect.AbstractDialect;
import org.springframework.data.relational.core.dialect.LimitClause;
import org.springframework.data.relational.core.dialect.LockClause;
import org.springframework.data.relational.core.sql.IdentifierProcessing;
import org.springframework.data.relational.core.sql.IdentifierProcessing.LetterCasing;
import org.springframework.data.relational.core.sql.IdentifierProcessing.Quoting;
import org.springframework.data.relational.core.sql.LockOptions;

/**
 * Spring Data JDBC ships dialects for Postgres, MySQL, H2, HSQLDB, SQL Server,
 * Oracle and DB2 - and not for SQLite. Without one the context fails to start at
 * {@code jdbcDialect}, which is the first thing anybody hits after choosing
 * SQLite (ADR 0002).
 *
 * <p>SQLite's SQL is close enough to ANSI that only two things actually differ
 * and both are encoded here.
 */
public final class SqliteDialect extends AbstractDialect {

    public static final SqliteDialect INSTANCE = new SqliteDialect();

    private SqliteDialect() {}

    private static final LimitClause LIMIT_CLAUSE = new LimitClause() {

        @Override
        public String getLimit(long limit) {
            return "LIMIT " + limit;
        }

        /**
         * SQLite refuses OFFSET without a preceding LIMIT, and -1 is its
         * documented idiom for "no limit". Emitting a bare OFFSET is a syntax
         * error rather than a slow query.
         */
        @Override
        public String getOffset(long offset) {
            return "LIMIT -1 OFFSET " + offset;
        }

        @Override
        public String getLimitOffset(long limit, long offset) {
            return "LIMIT %d OFFSET %d".formatted(limit, offset);
        }

        @Override
        public Position getClausePosition() {
            return Position.AFTER_ORDER_BY;
        }
    };

    /**
     * SQLite locks the whole database file for a write and has no row-level
     * locking, so there is no SELECT ... FOR UPDATE to emit. Returning an empty
     * clause is correct rather than a stub: the exclusivity the caller is asking
     * for is already what a write transaction gives them.
     */
    private static final LockClause LOCK_CLAUSE = new LockClause() {

        @Override
        public String getLock(LockOptions lockOptions) {
            return "";
        }

        @Override
        public Position getClausePosition() {
            return Position.AFTER_ORDER_BY;
        }
    };

    @Override
    public LimitClause limit() {
        return LIMIT_CLAUSE;
    }

    @Override
    public LockClause lock() {
        return LOCK_CLAUSE;
    }

    @Override
    public IdentifierProcessing getIdentifierProcessing() {
        return IdentifierProcessing.create(new Quoting("\""), LetterCasing.AS_IS);
    }
}
