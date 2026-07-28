# 7. Avatars are chosen on the site, not fetched from the provider

Date: 2026-07-27 · Status: accepted

## Context

`comment.avatar_url` holds whatever picture URL Google returned at sign-in, and
the comment thread renders it directly. So opening a recipe with signed comments
makes the visitor's browser request `lh3.googleusercontent.com`, disclosing their
IP address to Google.

That is precisely the request the YouTube facade, the self-hosted fonts and the
plain-link share bar all exist to prevent (ADR 6). It is the one place the site
does the thing it is otherwise built not to do, and it was found while writing
the privacy policy — which then had to admit it in `privacy.commentAvatar`.

Three ways out were considered and two rejected:

**Proxy the picture through the backend.** Removes the browser's request to
Google but keeps ours, on every cache miss, in the path of a page view. Provider
picture URLs also expire, so the failure mode is avatars that silently stop
working months later.

**Fetch it once at sign-in and store the bytes locally.** Removes the request
properly, but buys an outbound HTTP client with a timeout, a size cap and a
content-type allowlist, a serving endpoint, a storage location to back up, and a
copy of somebody's photograph to declare in the privacy policy. A lot of
machinery to keep a picture nobody asked us to hold.

**Stop having provider pictures at all.** The visitor picks an avatar on the
site instead. No request, no bytes, nothing to declare.

The third is what this ADR records, and the reason it wins is not only privacy:
the site has no photography anywhere yet — every recipe image is the placeholder
panel — so a real photograph beside a placeholder was going to be the only
photographic content on the page regardless.

## Decision

### An avatar is a token, not an image

`app_user.avatar` stores a short string such as `carrot/3` or `carrot/3/5`: an
icon name from a fixed set, a palette slot for the disc, and optionally a second
slot for the ink the icon is drawn in. Rendering it is a lookup in a registry the
frontend already has, so an avatar costs the width of the string over the wire
and nothing else.

The two-segment form is not a legacy spelling awaiting migration — it *is* how
the default ink is written, and `formatAvatar` emits exactly one of the two forms
for any given choice. One state, one spelling, so the column never holds two
strings meaning the same avatar.

This is the whole reason the feature is small. There is no upload, so there is
no file storage, no size limit, no content-type sniffing, no malware surface, and
no moderation queue for the picture somebody chose to represent themselves with.
An unrecognised token renders the existing initial-in-a-tint placeholder, so a
value this build has never heard of degrades instead of breaking.

### The selection and the generator are the same mechanism

Both halves of what was asked for fall out of one representation: the
*selection* is the grid of icon × palette × ink, and the *generator* is a button
that rolls a random combination. So there is one renderer and one stored form,
not two parallel systems that both have to be maintained and tested.

### Only hues are stored, which is why the ink can be offered at all

Letting somebody choose the background *and* the icon colour is the ordinary way
to end up with an invisible avatar — dark on dark. This design cannot produce
one, because a token carries only hues: the disc's lightness comes from the
`.tinted` wash and the ink's from the avatar component, both fixed per theme.

So the picker is swatches rather than a colour wheel, and that is a consequence
rather than a restriction. A free picker would need a contrast check to make the
same promise, and a contrast check is a curated palette arrived at the hard way —
with the added cost that it has to reject choices the visitor has already made.

`profile.spec.ts` measures every background × ink pair in both themes and fails
below 3:1, the WCAG 1.4.11 bar for non-text contrast. The worst pair as built is
3.93:1 in the light theme and 6.29:1 in the dark one.

### Comments resolve the avatar live, and no longer copy it

`V5__comment_avatar.sql` copied the avatar onto the comment row, on the same
reasoning as `display_name` beside it: a comment outlives the account that wrote
it, since `user_id` is `ON DELETE SET NULL`, and joining `app_user` would blank
the picture on every historical comment the moment somebody deleted their
account.

That reasoning does not survive the avatar becoming a *choice*. A profile page
where changing your avatar left your existing comments showing the old one is not
a profile page anybody would recognise. So the avatar is read through `user_id`
and the copy stops.

The consequence is accepted deliberately: deleting your account does drop the
avatar from your past comments, which then show the initial placeholder. The name
still has to be copied — `display_name` is `NOT NULL` and it is what attributes
the comment — but the avatar is decoration, and losing decoration when the
account goes is the more defensible half of the trade, not the worse one.

### The chosen name is copied *and rewritten*, which is not the same trade

`V7__chosen_name.sql` lets an account choose the name it is shown under, and the
obvious move — resolve it through the join, as the avatar now is — is wrong here.

A join falls back to the copy the moment `user_id` goes `NULL`. For an avatar that
means losing decoration. For a name it means **resurrecting the real name the
person chose to hide**, at exactly the moment they are least able to do anything
about it. A privacy feature whose guarantee expires on account deletion is not one.

So the copy stays and is kept correct instead: choosing a name rewrites
`comment.display_name` on every comment the account has posted, and clearing it
rewrites them back to the provider's. `DisplayNameService` does both writes in one
transaction, because half of it is worse than neither — an account claiming a
pseudonym while its published comments still carry the real name.

The rule the two sections add up to: **copy what attributes, join what decorates,
and rewrite the copies when the thing they attribute is allowed to change.**

### The provider picture is not read, not stored, and not kept

`ProviderProfile` stops mapping `picture` (and Facebook's
`picture.data.url`) entirely. Declining to *render* a URL we still hold would
leave the personal data in the database and the leak one careless template away;
not reading it means there is nothing to leak.

The migration also has to **clear the URLs already stored** in
`app_user.avatar_url` and `comment.avatar_url`. Those columns hold real Google
URLs for every account that has ever signed in, and a fix that leaves them in
place is cosmetic.

### A profile page, at `/fr/profil` · `/en/profile`

Not in the prototypes — a deviation, hence this ADR rather than a note in ADR 6,
because it adds a screen rather than changing one.

It is the first page on the site that exists for a signed-in visitor who is not
the author. ADR 6 records that the header account button appears only once
signed in and that it signs out, with the reasoning that "there is no account
page". There is now, so the header button gets somewhere to go and signing out
moves inside it.

## Consequences

`AuthUser.avatarUrl` and `CommentAuthor.avatarUrl` become `avatar` in
`core/api/models.ts`. That is a change to the contract ADR 1 froze, which is
allowed now milestone 2 is closed and its acceptance run is recorded — but it
means the mocks, the unit tests and the e2e suite move with it, in one branch, or
the suites go red halfway through.

`privacy.commentAvatar` was going to be deleted — there is no longer a leak to
disclose — but it is reworded instead. "No picture is taken from your provider"
is worth more to a reader than the absence of a sentence, and a privacy policy
that says what a site declines to collect is doing its job. `commentPublic`
changes with it: what is public is now the avatar you chose, not your picture.

The recipe *author* avatar (`author.avatar_url`, seeded and served from our own
origin) is untouched. It was never a provider URL and never leaked anything.
