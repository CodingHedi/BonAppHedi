# 2. SQLite via Spring Data JDBC, not Hibernate

Date: 2026-07-25 · Status: accepted

## Context

SQLite was chosen for the database: a personal recipe blog is read-heavy, small,
and benefits enormously from the whole datastore being one file you can copy.
The default Spring persistence choice would be JPA/Hibernate.

## Decision

Use **Spring Data JDBC** with `JdbcClient` for read projections. Flyway owns the
schema.

Hibernate's SQLite support comes from `hibernate-community-dialects` — it is
community-maintained and best-effort. `hbm2ddl` emits DDL SQLite sometimes
rejects, there are no sequences, and `@Lob` and several locking modes misbehave.
None of that is worth absorbing for an application whose data model is a handful
of tables.

Spring Data JDBC also happens to fit the domain exactly: `Recipe` is an
aggregate root owning its ingredients, steps, tags and their translation rows,
and the library's delete-and-reinsert-children semantics on save is precisely
what "the admin submitted the whole recipe form" means.

## Consequences

- Read paths that need joins use hand-written SQL in `RecipeQueryDao`. This is a
  feature: the queries are visible and tunable.
- `Instant`↔`String` and `LocalDate`↔`String` converters must be registered
  explicitly; the driver won't map them.
- The following SQLite facts are constraints on every later decision, not
  trivia:
  - **One writer at a time.** Mitigated with WAL, `busy_timeout=5000`, a
    4-connection pool, batched analytics writes, and short write transactions.
    Never hold a write transaction across an HTTP call.
  - **Foreign keys are OFF by default** and must be enabled per connection via
    the JDBC URL. Without it every `ON DELETE CASCADE` in the schema is inert.
  - **No `ALTER COLUMN`.** Migrations are additive from V1 onward.
  - **Dynamic typing.** `CHECK` constraints are the only real validation;
    booleans are `INTEGER 0/1`.
  - **Local disk only.** No NFS, no SMB, no network-attached volume.
  - Hot backups use `VACUUM INTO`; plain `VACUUM` blocks.
- This does not survive horizontal scaling. If it ever needs to, the absence of
  Hibernate makes the Postgres port a Flyway-script migration rather than a
  dialect fight.
