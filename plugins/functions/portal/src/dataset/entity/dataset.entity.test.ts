import { describe, it } from '@std/testing/bdd'
import { assertEquals } from '@std/assert'
import { Dataset, resolveCacheId, sanitizeIdForCacheId } from './dataset.entity.ts'

// Issue #2877: a non-HANA `source` dataset was given cache_id = sanitizeIdForCacheId(id),
// naming a DuckDB catalog that is never built. The HANA rule (databaseCode) must survive
// alongside the new source rule — the two branches hold for different reasons and neither
// subsumes the other.

const DS_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const SANITIZED = '_3f2504e0_4f89_11d3_9a0c_0305e82c3301'

describe('sanitizeIdForCacheId', () => {
  it('replaces hyphens with underscores', () => {
    assertEquals(sanitizeIdForCacheId('a-b-c'), 'a_b_c')
  })

  it('prefixes an underscore when the id starts with a digit', () => {
    assertEquals(sanitizeIdForCacheId(DS_ID), SANITIZED)
  })

  it('leaves an id starting with a letter unprefixed', () => {
    assertEquals(sanitizeIdForCacheId('ff2504e0-4f89'), 'ff2504e0_4f89')
  })
})

describe('resolveCacheId — the dialect/type matrix', () => {
  it('hana + source -> databaseCode', () => {
    assertEquals(
      resolveCacheId({ dialect: 'hana', type: 'source', id: DS_ID, databaseCode: 'HANA_DB' }),
      'HANA_DB'
    )
  })

  // This row is the reason the dialect branch cannot be replaced by the type branch:
  // isWebApiManaged gates on the OMOP data model, not on dialect, so hana + webapi is
  // reachable and only the dialect check covers it.
  it('hana + webapi -> databaseCode (dialect branch is load-bearing on its own)', () => {
    assertEquals(
      resolveCacheId({ dialect: 'hana', type: 'webapi', id: DS_ID, databaseCode: 'HANA_DB' }),
      'HANA_DB'
    )
  })

  it('hana + cache dataset type -> databaseCode', () => {
    assertEquals(
      resolveCacheId({ dialect: 'hana', type: 'hana__omop', id: DS_ID, databaseCode: 'HANA_DB' }),
      'HANA_DB'
    )
  })

  // The bug in #2877.
  it('postgres + source -> databaseCode (was the sanitized id)', () => {
    assertEquals(
      resolveCacheId({ dialect: 'postgres', type: 'source', id: DS_ID, databaseCode: 'pg_db' }),
      'pg_db'
    )
  })

  // fc0eb12 (#3064) sent these down the sanitized-id branch. Nothing attaches a
  // per-snapshot catalog in trex, and the datamart cache flow connects to trex on this
  // value and issues catalog-qualified DDL, so the run failed on its first task.
  it('postgres + omop cache dataset -> databaseCode', () => {
    assertEquals(
      resolveCacheId({ dialect: 'postgres', type: 'omop', id: DS_ID, databaseCode: 'pg_db' }),
      'pg_db'
    )
  })

  // omop is not special: `study` and `non_omop` are equally selectable cache types
  // (CopyStudyDialog / AddStudyDialog) and hit the same flow with no type guard
  // (router.ts /snapshot). Fixing only 'omop' would leave these broken.
  it('postgres + study cache dataset -> databaseCode', () => {
    assertEquals(
      resolveCacheId({ dialect: 'postgres', type: 'study', id: DS_ID, databaseCode: 'pg_db' }),
      'pg_db'
    )
  })

  it('postgres + non_omop cache dataset -> databaseCode', () => {
    assertEquals(
      resolveCacheId({ dialect: 'postgres', type: 'non_omop', id: DS_ID, databaseCode: 'pg_db' }),
      'pg_db'
    )
  })

  it('duckdb + non_omop cache dataset -> databaseCode', () => {
    assertEquals(
      resolveCacheId({ dialect: 'duckdb', type: 'non_omop', id: DS_ID, databaseCode: 'fhir_db' }),
      'fhir_db'
    )
  })

  // Guard against over-reach: `webapi` and `fhir` are NOT cache types. A cache file really
  // is built per-dataset for these, and createDataset does call trex /attach for them.
  it('postgres + webapi -> sanitized id (unchanged; a cache really is built for these)', () => {
    assertEquals(
      resolveCacheId({ dialect: 'postgres', type: 'webapi', id: DS_ID, databaseCode: 'pg_db' }),
      SANITIZED
    )
  })

  it('duckdb + fhir -> sanitized id (unchanged; out of scope for #2877)', () => {
    assertEquals(
      resolveCacheId({ dialect: 'duckdb', type: 'fhir', id: DS_ID, databaseCode: 'fhir_db' }),
      SANITIZED
    )
  })

  it('falls back to databaseCode when there is no id', () => {
    assertEquals(
      resolveCacheId({ dialect: 'postgres', type: 'webapi', databaseCode: 'pg_db' }),
      'pg_db'
    )
  })

  it('returns null when neither an id nor a databaseCode is available', () => {
    assertEquals(resolveCacheId({ dialect: 'postgres', type: 'webapi' }), null)
  })

  it('returns null for a source row with no databaseCode rather than a bogus catalog', () => {
    assertEquals(resolveCacheId({ dialect: 'postgres', type: 'source', id: DS_ID }), null)
  })
})

describe('Dataset.applyCacheIdDefault', () => {
  function makeDataset(fields: Partial<Dataset>): Dataset {
    const ds = new Dataset()
    Object.assign(ds, fields)
    return ds
  }

  it('assigns databaseCode for a postgres source dataset', () => {
    const ds = makeDataset({
      id: DS_ID,
      dialect: 'postgres',
      type: 'source',
      databaseCode: 'pg_db',
      cacheId: null
    })
    ds.applyCacheIdDefault()
    assertEquals(ds.cacheId, 'pg_db')
  })

  it('preserves the HANA rule', () => {
    const ds = makeDataset({
      id: DS_ID,
      dialect: 'hana',
      type: 'webapi',
      databaseCode: 'HANA_DB',
      cacheId: null
    })
    ds.applyCacheIdDefault()
    assertEquals(ds.cacheId, 'HANA_DB')
  })

  it('assigns the sanitized id for a postgres webapi dataset', () => {
    const ds = makeDataset({
      id: DS_ID,
      dialect: 'postgres',
      type: 'webapi',
      databaseCode: 'pg_db',
      cacheId: null
    })
    ds.applyCacheIdDefault()
    assertEquals(ds.cacheId, SANITIZED)
  })

  it('never overwrites an explicitly supplied cacheId', () => {
    const ds = makeDataset({
      id: DS_ID,
      dialect: 'postgres',
      type: 'source',
      databaseCode: 'pg_db',
      cacheId: 'explicit_catalog'
    })
    ds.applyCacheIdDefault()
    assertEquals(ds.cacheId, 'explicit_catalog')
  })
})
