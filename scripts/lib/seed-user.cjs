// Resolve the account the setup scripts grant study roles to.
//
// This used to be a fixed id that was simultaneously usermgmt's primary key and
// the identity provider's subject for the initial user. That only held while one
// provider minted both. Granting to a stale id still succeeds — usermgmt has the
// row — and then propagates to nobody, so the account that actually signs in
// sees no datasets and the failure looks like a missing dataset rather than a
// missing grant.
//
// CommonJS on purpose, like idp-login.cjs beside it: the callers are built with
// tsc, which downlevels their imports to require(), and Node refuses to
// require() an ES module.

const seedEmail = (username, domain) =>
  username.includes("@") ? username : `${username}@${domain}`;

/**
 * @returns the initial user's usermgmt id.
 * @throws if it cannot be found, since granting to the wrong account is
 *   indistinguishable from granting to none.
 */
const resolveInitialUserId = async ({ gateway, bearerToken, dispatcher }) => {
  const username = process.env.IDP__INITIAL_USER__NAME || "admin";
  const domain = process.env.IDP__INITIAL_USER__DOMAIN || "d2e.local";
  const email = seedEmail(username, domain);

  const response = await fetch(`https://${gateway}/d2e/usermgmt/api/user`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    dispatcher,
  });
  if (!response.ok) {
    throw new Error(`Listing users failed: ${response.status}`);
  }

  const users = await response.json();
  const match = users.find((user) => user.username === email) ??
    users.find((user) => user.username === username);
  if (!match) {
    throw new Error(
      `No user named ${email} to grant study roles to. The initial account has ` +
        "to exist in both the identity provider and usermgmt before setup runs.",
    );
  }
  if (!match.idpUserId) {
    throw new Error(
      `${email} has no identity-provider subject recorded. Roles granted to it ` +
        "would not reach any token, so the grant is refused rather than silently lost.",
    );
  }
  return match.id;
};

module.exports = { resolveInitialUserId };
