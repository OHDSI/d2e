import env from "../env";

const nameProp = env.REACT_APP_IDP_NAME_PROP;

/**
 * The account name to display and to match saved work against.
 *
 * Reads the claim the deployment names, falling back to the standard OpenID
 * Connect ones. Providers differ on which they emit - `username` is an
 * extension, `name` and `preferred_username` are the standard claims - and
 * reading only the configured claim leaves the name undefined against a
 * provider that emits a different one. That reaches the point of use as a
 * lookup for nobody: saved cohorts are matched to their owner by name, so a
 * missing name reports them as absent rather than as somebody else's.
 */
export const resolveIdTokenName = (
  claims: Record<string, unknown> | undefined | null,
): string | undefined => {
  if (!claims) return undefined;

  const candidates = [nameProp, "username", "name", "preferred_username"].filter(Boolean) as string[];
  for (const claim of candidates) {
    const value = claims[claim];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
};
