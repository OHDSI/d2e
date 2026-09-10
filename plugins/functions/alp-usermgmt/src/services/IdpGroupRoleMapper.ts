/**
 * Upstream group identifiers to d2e roles.
 *
 * trex passes groups through raw and unmapped — the identifiers mean whatever
 * the upstream says they mean (an Entra group GUID, a Logto role name, ...) —
 * so the policy that turns them into d2e roles lives here. Keyed by provider,
 * because two upstreams can legitimately use the same identifier to mean
 * different things.
 *
 * Pure: no I/O, no env access. The caller (`grant-roles-by-scopes`) is
 * responsible for reading the token claims and the mapping configuration and
 * passing them in — that split is what makes this testable without a token or
 * an env var in sight.
 */
export function mapGroupsToRoles(
  groups: string[],
  provider: string,
  mapping: Record<string, Record<string, string>>,
): string[] {
  if (!Array.isArray(groups) || groups.length === 0 || !provider) return []

  // `provider` is a token claim and `mapping` is operator-supplied JSON, so an
  // own-property check is what keeps a claim like `constructor`, `toString` or
  // `__proto__` from resolving to something off Object.prototype.
  if (!mapping || !Object.hasOwn(mapping, provider)) return []

  const forProvider = mapping[provider]
  if (!forProvider) return []

  const held = new Set(groups)
  return Object.keys(forProvider).filter(role => held.has(forProvider[role]))
}
