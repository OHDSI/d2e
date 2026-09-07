import { describe, it, expect } from 'vitest'
import { isTruncated } from '../components/truncation'

describe('isTruncated', () => {
  it('is false when the content fits', () => {
    expect(isTruncated({ scrollWidth: 100, clientWidth: 100 })).toBe(false)
    expect(isTruncated({ scrollWidth: 80, clientWidth: 100 })).toBe(false)
  })

  it('is false for a sub-pixel overhang, which is rounding not truncation', () => {
    expect(isTruncated({ scrollWidth: 101, clientWidth: 100 })).toBe(false)
  })

  it('is true once the content genuinely overflows', () => {
    expect(isTruncated({ scrollWidth: 102, clientWidth: 100 })).toBe(true)
    expect(isTruncated({ scrollWidth: 400, clientWidth: 100 })).toBe(true)
  })
})
