# Working in this repo

**The conventions for this codebase are in `deploy/CLAUDE.md`. Read that file
before changing anything here.**

@deploy/CLAUDE.md

---

## Why this file is nearly empty

`deploy/` is the private `CodingHedi/bonapphedi-ops` repository, mounted as a
submodule. The working conventions moved into it on 2026-08-18 because this
repository is public and they are not meant to be.

Nothing secret was in them — no addresses, credentials or keys, all of which
were already private — so the history here was not rewritten. Everything
committed before that date is still readable in this repository's log. What
changed is what gets published from now on.

## If `deploy/CLAUDE.md` is not there

You are in a clone without access to the private repository, and that is a
supported state: the build, both test suites and CI all pass without it. What
you do not get is the conventions or the ability to deploy.

With access, fetch it:

```powershell
git submodule update --init deploy
```

Without access, the things most likely to catch you out are:

- **Never commit to `main`.** Branch, get `cd frontend ; npm run verify` green,
  then merge with `--no-ff` and delete the branch.
- **Node is not on `PATH`** in a non-interactive shell — it is installed through
  NVM for Windows. Prepend `C:\nvm4w\nodejs`.
- **Maven is not installed by design.** Use `backend\mvnw.cmd`.
- **`Docs/Design/` is the visual source of truth and is never edited.**
  Deviations from it get an ADR in `Docs/adr/`.

`README.md` has the stack and the dev loop; `TESTING.md` has the test suite.
Both are public and neither moved.
