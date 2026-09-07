import 'reflect-metadata'
import assert from 'node:assert/strict'
import axios from '../../../_shared/_axios.ts'
import { LogtoAPI } from './LogtoAPI.ts'

function createApi(): LogtoAPI {
  const api = new LogtoAPI()
  // Bypass real token acquisition against Logto
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(api as any).getRequestConfig = async () => ({ headers: { Authorization: 'Bearer test' } })
  return api
}

async function withStubbedPost(fake: (...args: any[]) => Promise<any>, testFn: () => Promise<void>) {
  const original = axios.post
  axios.post = fake as typeof axios.post
  try {
    await testFn()
  } finally {
    axios.post = original
  }
}

Deno.test('checkPasswordPolicy returns accepted for a compliant password', async () => {
  const api = createApi()
  await withStubbedPost(
    async () => ({ status: 200, data: {} }),
    async () => {
      const result = await api.checkPasswordPolicy('Str0ng!Pass')
      assert.deepEqual(result, { accepted: true })
    }
  )
})

Deno.test('checkPasswordPolicy returns rejection details when the policy rejects the password', async () => {
  const api = createApi()
  const rejection = { code: 'password_rejected.character_types', data: { min: 3 } }
  await withStubbedPost(
    async () => {
      throw { response: { status: 400, data: rejection } }
    },
    async () => {
      const result = await api.checkPasswordPolicy('weakpass')
      assert.deepEqual(result, { accepted: false, rejection })
    }
  )
})

Deno.test('checkPasswordPolicy throws on non-policy failures', async () => {
  const api = createApi()
  await withStubbedPost(
    async () => {
      throw { response: { status: 503 }, message: 'Service Unavailable' }
    },
    async () => {
      await assert.rejects(() => api.checkPasswordPolicy('Str0ng!Pass'))
    }
  )
})
