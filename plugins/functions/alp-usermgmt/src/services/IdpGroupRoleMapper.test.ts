/**
 * Run: deno test --allow-env --no-check src/services/IdpGroupRoleMapper.test.ts
 */
import { assertEquals } from '@std/assert'
import { mapGroupsToRoles } from './IdpGroupRoleMapper.ts'

const mapping = {
  entra: { RESEARCHER: 'group-guid-1', ADMIN: 'group-guid-2' },
  logto: { RESEARCHER: 'researcher' },
}

Deno.test('maps a matching group to its role', () => {
  assertEquals(mapGroupsToRoles(['group-guid-1'], 'entra', mapping), ['RESEARCHER'])
})

Deno.test('maps several groups and de-duplicates', () => {
  assertEquals(
    mapGroupsToRoles(['group-guid-1', 'group-guid-2', 'group-guid-1'], 'entra', mapping).sort(),
    ['ADMIN', 'RESEARCHER']
  )
})

Deno.test('keys by provider, so the same id means different things', () => {
  assertEquals(mapGroupsToRoles(['researcher'], 'logto', mapping), ['RESEARCHER'])
  assertEquals(mapGroupsToRoles(['researcher'], 'entra', mapping), [])
})

Deno.test('returns nothing for an unknown provider', () => {
  assertEquals(mapGroupsToRoles(['group-guid-1'], 'physionet', mapping), [])
})

Deno.test('returns nothing for empty input rather than throwing', () => {
  assertEquals(mapGroupsToRoles([], 'entra', mapping), [])
})

Deno.test('returns nothing when groups is undefined-like (no crash on falsy input)', () => {
  // @ts-expect-error deliberately passing an unexpected shape to prove it does not throw
  assertEquals(mapGroupsToRoles(undefined, 'entra', mapping), [])
})

Deno.test('returns nothing when the provider is empty', () => {
  assertEquals(mapGroupsToRoles(['group-guid-1'], '', mapping), [])
})

Deno.test('returns nothing when the mapping config is empty', () => {
  assertEquals(mapGroupsToRoles(['group-guid-1'], 'entra', {}), [])
})

Deno.test('an inherited property name from the token does not resolve to a mapping', () => {
  // `provider` comes from a token claim while `mapping` is operator-supplied
  // JSON, so a name that exists on Object.prototype must not be treated as a
  // configured provider.
  for (const inherited of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
    assertEquals(mapGroupsToRoles(['group-guid-1'], inherited, mapping), [], inherited)
  }
})
