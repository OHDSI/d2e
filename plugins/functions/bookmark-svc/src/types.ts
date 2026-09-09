/**
 * this file should have all the types in this repo
 */
import { Connection } from '@alp/alp-base-utils'
import ConnectionInterface = Connection.ConnectionInterface
import { Request } from 'express'
import { z } from 'zod'

export const bookmarkIdSchema = z.object({
  query: z.object({
    paConfigId: z.string().optional(),
  }),
})

export const bookmarkIdsSchema = z.object({
  query: z.object({
    ids: z.string(),
    paConfigId: z.string(),
  }),
})

export const createBookmarkSchema = z.object({
  body: z.object({
    bookmark: z.string(),
    bookmarkname: z.string().optional(),
    paConfigId: z.string(),
    cdmConfigId: z.string(),
    cdmConfigVersion: z.string(),
    shareBookmark: z.boolean(),
    cmd: z.string(),
  }),
})

export const updateBookmarkSchema = z.object({
  params: z.object({
    bookmarkId: z.string(),
  }),
  body: z.object({
    cmd: z.string(),
    newName: z.string().optional(),
    paConfigId: z.string(),
    cdmConfigId: z.string(),
    cdmConfigVersion: z.string(),
  }),
})

export const deleteBookmarkSchema = z.object({
  params: z.object({
    bookmarkId: z.string(),
  }),
  body: z.object({
    cmd: z.string(),
    paConfigId: z.string(),
    cdmConfigId: z.string(),
    cdmConfigVersion: z.string(),
  }),
})

export const duplicateBookmarkSchema = z.object({
  params: z.object({
    bookmarkId: z.string(),
  }),
  // No `cmd` here, unlike deleteBookmarkSchema. The command is this route's own
  // sub-path, and its handler sets `req.body.cmd` itself — but the handler runs
  // *after* this validation, so requiring the field rejected every honest
  // request with "body.cmd Required". Delete only gets away with it because its
  // caller goes through the generic fireBookmarkQuery, which happens to put
  // `cmd` in the body. Do not copy it back in.
  body: z.object({
    newName: z.string(),
    paConfigId: z.string(),
    cdmConfigId: z.string(),
    cdmConfigVersion: z.string(),
    datasetId: z.string(),
  }),
})

export interface IMRIRequest extends Request {
  dbConnections: {
    analyticsConnection: ConnectionInterface
    configConnection: ConnectionInterface
  }
  studiesDbMetadata: {
    studies: any
    cachedAt: number
  }
  fileName?: string
}
export interface Map<T> {
  [key: string]: T
}

export type Partial<T> = {
  [P in keyof T]?: T[P]
}

export type QueryObjectResultType<T> = {
  data: T
  sql: string
  sqlParameters: any[]
}

export type BookmarkQueryResultType = {
  bmkId: string
  bookmark: string
  bookmarkname: string
  modified: Date
  userid: string
  version: number
  viewname: string
}

export interface IBookmark {
  bookmarkname: string
  bookmark: string
  bmkId: string
}

export interface IDBCredentialsType {
  database: string
  schema: string
  dialect: string
  host: string
  port: number
  user: string
  password: string
  max?: number | undefined
  min?: number | undefined
  idleTimeoutMillis?: number | undefined
}

export interface BookmarkDto {
  id: string
  bookmark_name: string
  bookmark: string
  type: string | null
  view_name: string | null
  modified: string
  version: number
  pa_config_id: string
  cdm_config_id: string
  cdm_config_version: number
  user_id: string
  shared: boolean
}

export interface IMaterializedCohort {
  id: number
  name: string
  description: string
  creationTimestamp: string
  syntax: string
  patientCount: number
}

export interface IFormattedBookmark {
  bmkId: string
  bookmarkname: string
  bookmark: string
  viewname: string | null
  modified: string
  version: string | null
  user_id: string
  shared: boolean
  paConfigId?: string | undefined
}

export interface IAtlasCohortDefinition {
  id: number
  name: string
  description: string | null
  expressionType: string
  expression: unknown
  createdBy: string
  createdDate: number
  modifiedBy: string
  modifiedDate: number
  tags: string[]
}

export interface IFormattedAtlasCohortDefinition {
  id: number
  name: string
  username: string
  createdOn: string
  updatedOn: string
  cohortDefinitionId?: number | undefined
}

export interface IFrontendBookmark {
  schemaName: string
  bookmarks: IFormattedBookmark[]
}
