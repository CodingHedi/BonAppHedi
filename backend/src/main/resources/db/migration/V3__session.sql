-- Spring Session JDBC's tables, transcribed for SQLite.
--
-- Spring Session ships schema scripts for nine databases and SQLite is not one
-- of them, so its own initializer has nothing to run and is switched off
-- (spring.session.jdbc.initialize-schema=never). Without this file the context
-- starts perfectly and then every single request fails on "no such table:
-- SPRING_SESSION" - including anonymous ones, because saving the request before
-- a redirect creates a session too.
--
-- Column names, index names and the two-table split are Spring Session's, not
-- ours: JdbcIndexedSessionRepository builds its SQL from them. The only changes
-- are the types, mapped onto SQLite's four storage classes:
--
--   BIGINT  -> INTEGER  (millisecond timestamps)
--   BYTEA   -> BLOB     (the Java-serialized attribute)
--   VARCHAR -> TEXT
--
-- Sessions live here rather than in memory so a restart does not sign everyone
-- out, and so the whole deployment stays one file (ADR 0003).

CREATE TABLE SPRING_SESSION (
    PRIMARY_ID            TEXT NOT NULL,
    SESSION_ID            TEXT NOT NULL,
    CREATION_TIME         INTEGER NOT NULL,
    LAST_ACCESS_TIME      INTEGER NOT NULL,
    MAX_INACTIVE_INTERVAL INTEGER NOT NULL,
    EXPIRY_TIME           INTEGER NOT NULL,
    -- Indexed so Spring Security can find every session belonging to one person,
    -- which is what makes "sign out everywhere" possible later.
    PRINCIPAL_NAME        TEXT,
    CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
    SESSION_PRIMARY_ID TEXT NOT NULL,
    ATTRIBUTE_NAME     TEXT NOT NULL,
    ATTRIBUTE_BYTES    BLOB NOT NULL,
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
    -- Live only because foreign_keys=on is in the JDBC URL (ADR 0002). Without
    -- it, expiring a session would leave its attributes behind for good.
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID)
        REFERENCES SPRING_SESSION (PRIMARY_ID) ON DELETE CASCADE
);
