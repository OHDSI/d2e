import { env } from "../env.ts";

// The initial account has to exist in the IdP before usermgmt can seed a row
// for it, because usermgmt propagates group memberships to the IdP by subject
// id (see UserGroupService). Seeding a row whose idp_user_id is absent, or is
// carried over from another IdP, produces a user that looks provisioned and
// silently receives no roles.
export interface SeedAccount {
  email: string;
  idpUserId: string;
}

const parseSeedUser = (raw: string | undefined): { username: string; password: string } | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.username === "string" && typeof parsed?.initialPassword === "string") {
      return { username: parsed.username, password: parsed.initialPassword };
    }
  } catch {
    // Fall through to the explicit warning below rather than aborting the
    // whole init on a malformed value.
  }
  return undefined;
};

// usermgmt matches users by username while the IdP knows them by email, so the
// two have to agree on one string or a login creates a second, role-less row
// alongside the seeded one.
export const seedEmail = (username: string): string =>
  username.includes("@") ? username : `${username}@${env.IDP__INITIAL_USER__DOMAIN}`;

const createAccount = async (
  authUrl: string,
  serviceRoleKey: string,
  email: string,
  password: string,
): Promise<string | undefined> => {
  const res = await fetch(`${authUrl}/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ email, password }),
  });

  if (res.status === 422) {
    // Already there. The IdP exposes no way to look a user up by email, so the
    // subject is recovered by signing in below.
    await res.body?.cancel();
    return undefined;
  }
  if (!res.ok) {
    throw new Error(`Creating the initial account failed: ${res.status}`);
  }
  const created = await res.json();
  if (typeof created?.id !== "string") {
    throw new Error("The IdP accepted the initial account but returned no id");
  }
  return created.id;
};

const subjectFromSignIn = async (
  authUrl: string,
  email: string,
  password: string,
): Promise<string | undefined> => {
  const res = await fetch(`${authUrl}/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    await res.body?.cancel();
    return undefined;
  }
  const body = await res.json();
  const token = typeof body?.access_token === "string" ? body.access_token : undefined;
  if (!token) return undefined;

  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(
        // The segment is base64url and unpadded; atob wants neither.
        Uint8Array.from(
          atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    return typeof decoded?.sub === "string" ? decoded.sub : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Ensure the initial account exists in the IdP and return its subject.
 *
 * Returns undefined when the account cannot be resolved — an existing account
 * whose password has since been changed is the case that cannot be recovered,
 * since the IdP offers no lookup by email. The caller seeds nothing rather than
 * seeding a row that would silently never receive roles.
 */
export const ensureSeedAccount = async (): Promise<SeedAccount | undefined> => {
  const seedUser = parseSeedUser(env.D2E__SEED_USER);
  if (!seedUser) {
    console.warn("No usable D2E__SEED_USER; skipping initial account provisioning");
    return undefined;
  }
  if (!env.TREX_AUTH_URL) {
    console.warn("No IdP auth URL; skipping initial account provisioning");
    return undefined;
  }

  const email = seedEmail(seedUser.username);

  // Signing in comes first because it needs no privileged credential and
  // answers the only question that matters: which subject is this account. The
  // service-role key is required solely to create one that is not there yet.
  const existing = await subjectFromSignIn(env.TREX_AUTH_URL, email, seedUser.password);
  if (existing) {
    return { email, idpUserId: existing };
  }

  if (!env.TREX_SERVICE_ROLE_KEY) {
    console.warn(
      `No service-role key, so ${email} cannot be created here. It has to exist in ` +
        "the identity provider before usermgmt can record its subject.",
    );
    return undefined;
  }

  const created = await createAccount(
    env.TREX_AUTH_URL,
    env.TREX_SERVICE_ROLE_KEY,
    email,
    seedUser.password,
  );
  if (!created) {
    console.warn(
      `The initial account ${email} already exists but its subject could not be resolved; ` +
        "seeding it would produce a user that receives no roles",
    );
    return undefined;
  }
  return { email, idpUserId: created };
};
