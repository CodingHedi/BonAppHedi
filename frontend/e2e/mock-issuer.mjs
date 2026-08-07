/**
 * An OIDC issuer the acceptance run can actually complete a sign-in against.
 *
 * Forty of the 132 milestone-1 specs need a signed-in session, and against the
 * real API they could never run: clicking a provider button navigates to Google,
 * and Playwright has no way to come back. Faking it in the browser is not an
 * option either — the token exchange and the userinfo call are server-to-server
 * and never touch the page (ADR 0001's amendment scoped the guarantee around
 * exactly this hole).
 *
 * So the browser is left alone and the *server* is given somewhere else to talk
 * to. `application-acceptance.yml` points `google`'s four endpoints here; the
 * full authorization-code flow then runs for real, start to finish, against an
 * issuer on loopback that approves without asking.
 *
 * This is a test harness and never ships. The application refuses to start if
 * these overrides are ever set under the prod profile — see
 * `ClientRegistrationConfig.rejectOverridesInProduction`, and the test that
 * proves it refuses.
 */
import { OAuth2Server } from 'oauth2-mock-server';

const PORT = Number(process.env['BAH_ISSUER_PORT'] ?? 9779);

/**
 * Two accounts, because one is not enough to test authorisation.
 *
 * `admin` is in `bah.admin.emails` in `application-acceptance.yml` and `reader`
 * deliberately is not, which is the entire difference between them — the server
 * decides, exactly as it does in production, rather than either side being told.
 * That is what makes "a signed-in non-admin is sent home" a real assertion
 * instead of a restatement of the fixture.
 *
 * A `.test` TLD, because RFC 6761 reserves it: neither address can ever be a
 * real mailbox somebody owns.
 */
const USERS = {
  admin: {
    sub: 'acceptance-admin',
    email: 'acceptance@bonapphedi.test',
    email_verified: true,
    // The names are the mock fixtures' names, and that is the point rather than
    // a coincidence. The specs assert what the header and the comment byline
    // say, so an issuer that invented its own would fail a dozen of them on
    // `Expected: "Hédi", Received: "Acceptance Run"` - a difference between two
    // fixtures, dressed up as a defect.
    name: 'Hédi',
    given_name: 'Hédi',
    family_name: 'Soumri',
  },
  reader: {
    sub: 'acceptance-reader',
    email: 'reader@bonapphedi.test',
    email_verified: true,
    name: 'Camille',
    given_name: 'Camille',
    family_name: 'Durand',
  },
};

/**
 * Who the next sign-in arrives as. Set through `/_identity`, below.
 *
 * A single value shared by the whole issuer, which is safe only because the
 * acceptance run is `--workers=1`. It already had to be: the specs share one
 * database and are not independent of each other however they are scheduled.
 * Run it in parallel and two workers would race for this as well — so if that
 * constraint is ever lifted, this is one of the things that has to change.
 */
let nextUser = USERS.admin;

const server = new OAuth2Server();

await server.issuer.keys.generate('RS256');

// Both hooks, because Spring reads the two separately and disagreeing is worse
// than either being wrong: the id_token establishes who signed in, and the
// userinfo response is what AppUser is actually built from. A name present in
// one and absent from the other produces an account called `null` with no
// obvious cause.
server.service.on('beforeTokenSigning', (token) => {
  Object.assign(token.payload, nextUser);
});

server.service.on('beforeUserinfo', (response) => {
  Object.assign(response.body, nextUser);
});

/**
 * Choose which account the next sign-in arrives as: `/_identity?who=reader`.
 *
 * Not part of OIDC and deliberately named so it cannot be mistaken for it. The
 * identity has to be chosen out of band because there is nowhere in the
 * authorization request to put it — `state` is Spring's and opaque, the scopes
 * are fixed, and a second registration would put a second button in the sign-in
 * row that the specs assert is not there.
 */
// `addRoute` hands the handler Node's own request and response, not Express's,
// so there is no res.json and no res.status - calling them throws inside the
// library and answers 500 with "most certainly a bug in the library code",
// which is a misleading thing to read while debugging your own harness. The
// selection still takes effect before the throw, which makes it worse: it half
// works.
server.service.addRoute('GET', '/_identity', (req, res) => {
  const who = req.query['who'];
  const known = Object.prototype.hasOwnProperty.call(USERS, who);

  if (known) {
    nextUser = USERS[who];
  }

  res.writeHead(known ? 200 : 400, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify(
      known
        ? { signingInAs: nextUser.email }
        : { error: `unknown identity '${who}'`, known: Object.keys(USERS) },
    ),
  );
});

// 127.0.0.1 rather than 'localhost', and this is not cosmetic. Bound to
// 'localhost' this listens on IPv4 only, while the JVM resolves 'localhost' to
// ::1 first and does not fall back - so the browser reaches /authorize happily,
// the server-side token exchange dies with "Connection refused", and sign-in
// fails at the last step with nothing wrong anywhere. curl hides it by trying
// both address families. `application-acceptance.yml` names 127.0.0.1 to match.
await server.start(PORT, '127.0.0.1');

console.log(`mock OIDC issuer listening on ${server.issuer.url}`);
console.log(`  admin  ${USERS.admin.email}`);
console.log(`  reader ${USERS.reader.email}   (choose with /_identity?who=reader)`);

// Ctrl+C during a Playwright run should not leave a listener holding the port,
// because the next run's health check would find it, assume it started the
// server itself, and reuse an issuer whose keys have changed.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void server.stop().then(() => process.exit(0));
  });
}
