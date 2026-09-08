import { formatNumber } from '../NumberUtils'

describe('formatNumber', () => {
  it('formats zero as "0"', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('formats small numbers without commas', () => {
    expect(formatNumber(42)).toBe('42')
    expect(formatNumber(999)).toBe('999')
  })

  it('formats thousands with comma separator', () => {
    expect(formatNumber(1000)).toBe('1,000')
    expect(formatNumber(1234)).toBe('1,234')
  })

  it('formats large numbers with multiple comma separators', () => {
    expect(formatNumber(854765)).toBe('854,765')
    expect(formatNumber(9003281)).toBe('9,003,281')
    expect(formatNumber(1234567890)).toBe('1,234,567,890')
  })

  it('handles null by returning "0"', () => {
    expect(formatNumber(null)).toBe('0')
  })

  it('handles undefined by returning "0"', () => {
    expect(formatNumber(undefined)).toBe('0')
  })

  it('handles NaN by returning "0"', () => {
    expect(formatNumber(NaN)).toBe('0')
  })

  it('formats negative numbers correctly', () => {
    expect(formatNumber(-1000)).toBe('-1,000')
    expect(formatNumber(-1234567)).toBe('-1,234,567')
  })

  it('returns non-numeric string values as-is (for error states)', () => {
    expect(formatNumber('--')).toBe('--')
    expect(formatNumber('N/A')).toBe('N/A')
  })

  it('formats numeric strings with comma separator', () => {
    expect(formatNumber('1000')).toBe('1,000')
    expect(formatNumber('1234567')).toBe('1,234,567')
  })
})
