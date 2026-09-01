export interface Summary {
  baseCount: number
  finalCount: number
  lostCount: number
  percentMatched: string
}

export interface InclusionRuleStat {
  id: number
  name: string
  isExclude: boolean
  percentExcluded: string
  percentSatisfying: string
  countSatisfying: number
}

export interface TreemapData {
  name: string
  children: TreemapDataChildren[]
}

export interface TreemapDataChildren {
  name: string
  children: TreemapNodeChildren[]
}

export interface TreemapNodeChildren {
  name: string
  size: number
}

export interface FilterCardDetailAttribute {
  name: string
  visibleConstraints: string[]
}

export interface FilterCardDetail {
  name: string
  visibleAttributes: FilterCardDetailAttribute[]
  visibleAdvanceTime: string[]
  isExcluded: boolean
  /** True for the patient-level Basic Data card, whose rules are split per attribute */
  isBasicData: boolean
}

/** Each rule can have multiple filter cards (joined by OR) */
export type RuleFilterCardDetails = FilterCardDetail[]

export interface InclusionReportResponse {
  summary: Summary
  inclusionRuleStats: InclusionRuleStat[]
  treemapData: TreemapData | string
}

export interface AttritionApiResponse {
  summary: Summary
  attritionStats: Array<{
    id: number
    name: string
    isExclude: boolean
    cumulativeCountSatisfying: number
  }>
}

/**
 * Parse treemapData which may be a JSON string (from legacy backends) or an already-parsed object.
 * Returns null if the input is falsy or cannot be parsed.
 */
export function parseTreemapData(raw: TreemapData | string | null | undefined): TreemapData | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as TreemapData
    } catch {
      return null
    }
  }
  return raw
}
