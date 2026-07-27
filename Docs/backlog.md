# Backlog

Things worth doing that are not scheduled, and not urgent enough to interrupt a
milestone. Anything with a real decision behind it belongs in `Docs/adr/`
instead; this is for work whose *shape* is already obvious and whose only open
question is when.

Delete an entry when it ships. An entry that has sat here through two milestones
is probably not wanted — say so and remove it rather than letting the list rot.

---

## Search runs entirely in the browser

`RecipeListPage` fetches the catalogue once per locale and every filter — the
query, the tags, the author, the sort — runs in a computed over the result. That
is deliberate and it is right at this size: filtering in the browser is instant,
and typing fires no request at all.

Two things will end that, and neither has yet:

**Volume.** Every recipe is shipped to every visitor before the first keystroke.
At six recipes that is nothing. At a few hundred it is the page-load budget, and
at that point the list needs real pagination and the filters need to move to
`RecipeQueryDao`, which already understands `query`, `tag`, `author` and `sort`
and has been sitting unused by the list page since M2.

**The typo tolerance.** `matchesFuzzy` walks every word of every recipe's
`searchText` and runs a bounded edit distance against each. It only runs when the
exact search has found nothing, so most keystrokes never reach it — but it is the
part that scales worst, and Levenshtein in SQLite is not a thing you want to
discover you need on a deadline.

Not urgent, and moving it early would make the search *slower* for the current
catalogue: a round trip per keystroke where there is now none. The trigger to
watch is the recipe count, not the calendar.

## scripts/verify.ps1

`TESTING.md` referred to it for months; it has never existed. The two halves are
verified separately, which works and is what everyone actually types.

Worth it only if CI or a deploy step needs one command. If that day does not
come, delete this entry rather than writing the script to make an old sentence
true.
