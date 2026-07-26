# Working in this repo

Conventions for anyone changing this codebase. [README.md](README.md) has the
stack and the dev loop; [TESTING.md](TESTING.md) has the test suite.

---

## Git workflow

**Never commit directly to `main`.** Every change gets a branch, and `main` only
ever moves through a merge.

```powershell
git checkout -b fix/player-fill      # branch off main
# ... work ...
cd frontend ; npm run verify         # must be green before the merge
git commit
git checkout main
git merge --no-ff fix/player-fill
git branch -d fix/player-fill
```

`--no-ff` is the whole point. It keeps each change one identifiable unit in the
history, so a feature can be read or reverted as a whole later instead of being
reconstructed from loose commits. A fast-forward merge would leave exactly the
flat history this convention exists to avoid.

| Prefix | For |
|---|---|
| `feat/` | New behaviour |
| `fix/` | Corrected behaviour |
| `test/` | Tests only |
| `docs/` | Documentation only |
| `chore/` | Tooling, dependencies, configuration |

There is no remote, so there are no pull requests to open. If one is added
later the branch step is already in place and only the final merge changes.

**Merging is the author's call, not the agent's.** An agent working here should
branch, commit, and stop — leaving the merge to a human who has read the diff.
Review is the reason the branch exists.

### Commit messages

Conventional Commits — `type(scope): subject` — and the body explains **why**,
since the diff already shows what. Where a fix turned on some non-obvious
mechanism, name the mechanism: the next person to touch that code is the
audience.

---

## Before you commit

```powershell
cd frontend
npm run verify          # lint → typecheck → unit → build → e2e
```

Green `verify` is the bar for merging into `main`. `npm run verify:prod` runs
the same chain against a production build and is the bar before a deploy.

---

## Environment

**Node is installed through NVM for Windows and is not on `PATH` in a
non-interactive shell.** `node`, `npm` and `npx` all appear missing. Prepend the
symlink directory first:

```powershell
$env:Path = "C:\nvm4w\nodejs;$env:Path"
```

A dev server may already be running on `:4200` from another session. Playwright
reuses it (`reuseExistingServer`), so specs need no server started by hand;
`npm start` will simply fail with "port already in use", which is harmless.

---

## Things that are deliberate

Several oddities here look like mistakes and are not. Before "fixing" one, check
whether it is load-bearing:

- **The odd design values** (`13.8px`, `line-height: 1.55`) come from the
  prototypes in `Docs/Design/`, which are the source of truth and final.
- **The YouTube facade** exists so no Google request happens on page view. That
  is what keeps the site free of a cookie-consent obligation, so
  `disablePlaceholder` and `disableCookies` are not stylistic choices.
- **The placeholder video** is Big Buck Bunny, chosen because it is openly
  licensed and unmistakably not a cookery video. Any replacement must clear the
  same bar — never substitute copyrighted content.
- **The e2e fixture** in `frontend/e2e/fixtures.ts` fails tests on console
  errors and failed requests even when assertions pass. That is the highest-value
  behaviour in the suite; do not bypass it.

Deviations from the prototypes get an ADR in `Docs/adr/`.

---

## A caution about the test suite

The e2e specs stub the YouTube API, so they assert **calls, not geometry**. A
green suite has already coexisted with a visibly broken player — the iframe
rendered as a 150px strip inside a 378px box while every test passed.

When a change is visual, measure it in a real browser rather than trusting the
suite, and add the assertion that would have caught it.
