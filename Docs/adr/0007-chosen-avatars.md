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

`app_user.avatar` stores a short string such as `carrot/3`: an icon name from a
fixed set, and a palette slot. Rendering it is a lookup in a registry the
frontend already has, so an avatar costs the width of the string over the wire
and nothing else.

This is the whole reason the feature is small. There is no upload, so there is
no file storage, no size limit, no content-type sniffing, no malware surface, and
no moderation queue for the picture somebody chose to represent themselves with.
An unrecognised token renders the existing initial-in-a-tint placeholder, so a
value this build has never heard of degrades instead of breaking.

### The selection and the generator are the same mechanism

Both halves of what was asked for fall out of one representation: the
*selection* is the grid of icon × palette, and the *generator* is a button that
rolls a random pair. So there is one renderer and one stored form, not two
parallel systems that both have to be maintained and tested.

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

`privacy.commentAvatar` is deleted rather than reworded. The privacy policy gets
shorter, which is the outcome worth having: the honest sentence about a leak is
replaced by no sentence, because there is no longer anything to disclose.

The recipe *author* avatar (`author.avatar_url`, seeded and served from our own
origin) is untouched. It was never a provider URL and never leaked anything.
