import type {
  FilterCardDetail,
  FilterCardDetailAttribute,
  RuleFilterCardDetails,
} from '@/query-filter/types/InclusionReportTypes'

/** Callback to resolve an attribute configPath to a display name */
type GetAttributeNameFn = (configPath: string) => string

/** Callback to format an advance time filter object into an HTML string */
type GetAdvanceTimeFilterFormattedFn = (filter: any) => string

/**
 * Resolves an attribute configPath to a human-readable display name.
 * @param type - pass 'list' to skip path shortening (used by FilterCardSummary)
 */
export function getAttributeName(attributeId: string, mriFrontendConfig: any, type?: string): string {
  const attributePath = attributeId.split('.')
  if (attributePath.length > 3 && type !== 'list') {
    const attributePathEnd1 = attributePath.pop()
    const attributePathEnd2 = attributePath.pop()
    attributePath.pop()
    attributePath.push(attributePathEnd2!)
    attributePath.push(attributePathEnd1!)
  }
  const attributeConfigPath = attributePath.join('.')
  const attribute = mriFrontendConfig?.getAttributeByPath(attributeConfigPath)
  if (attribute?.oInternalConfigAttribute?.name) {
    return attribute.oInternalConfigAttribute.name
  }
  return attributeId
}

/** Resolves a temporal filter origin key (startdate/enddate/overlap) to display text */
export function getOriginSelectionOption(val: string, getText: (key: string) => string): string {
  const originSelectionOptions = [
    { key: 'startdate', text: getText('MRI_PA_TEMPORAL_FILTER_START') || 'Start' },
    { key: 'enddate', text: getText('MRI_PA_TEMPORAL_FILTER_END') || 'End' },
    { key: 'overlap', text: getText('MRI_PA_TEMPORAL_FILTER_OVERLAP') || 'Overlap' },
  ]
  const o = originSelectionOptions.find(option => option.key === val)
  return o ? o.text : val
}

/** Resolves a temporal filter target key (before_start/after_start/etc.) to display text */
export function getTargetSelectionOption(afterBefore: string, other: string, getText: (key: string) => string): string {
  const targetSelectionOptions = [
    { key: 'before_start', text: getText('MRI_PA_TEMPORAL_FILTER_BEFORE_START') || 'before start' },
    { key: 'after_start', text: getText('MRI_PA_TEMPORAL_FILTER_AFTER_START') || 'after start' },
    { key: 'before_end', text: getText('MRI_PA_TEMPORAL_FILTER_BEFORE_END') || 'before end' },
    { key: 'after_end', text: getText('MRI_PA_TEMPORAL_FILTER_AFTER_END') || 'after end' },
  ]
  const o = targetSelectionOptions.find(option => option.key === afterBefore + '_' + other)
  return o ? o.text : afterBefore + '_' + other
}

/** Formats an advance time filter into an HTML string for display */
export function getAdvanceTimeFilterFormatted(
  filter: any,
  getFilterCardFn: (id: string) => any,
  getText: (key: string) => string
): string {
  let str = ''
  const filterCardName = getFilterCardFn(filter.value)?.props?.name || filter.value
  const { after_before, other, operator } = filter
  if (filter.this === 'overlap') {
    str = getOriginSelectionOption(filter.this, getText) + ' ' + filterCardName
  } else {
    str =
      '<b>' +
      getOriginSelectionOption(filter.this, getText) +
      ' ' +
      operator +
      '</b> ' +
      (getText('MRI_PA_TEMPORAL_FILTER_DAYS') || 'days') +
      ' <b>' +
      getTargetSelectionOption(after_before, other, getText) +
      '</b> ' +
      (getText('MRI_PA_TEMPORAL_FILTER_OF') || 'of') +
      ' <b>' +
      filterCardName +
      '</b>'
  }
  return str
}

/** Extracts visible constraints from a single attribute's constraints object */
function formatConstraints(constraints: any): string[] {
  const result: string[] = []
  for (const c of constraints.content) {
    if (c.content) {
      for (const sub of c.content) {
        result.push(`${sub.operator}${sub.value}`)
      }
    } else if (c.operator === '=') {
      try {
        const val = JSON.parse(c.value)
        if (val !== null && typeof val === 'object' && val.hasOwnProperty('sProcess')) {
          result.push(val.text)
        } else {
          result.push(c.value)
        }
      } catch {
        result.push(c.value)
      }
    } else {
      result.push(`${c.operator}${c.value}`)
    }
  }
  return result
}

/** Extracts a FilterCardDetail from a single IFR filter card entry */
export function extractFilterCardDetail(
  entry: any,
  getAttributeName: GetAttributeNameFn,
  getAdvanceTimeFilterFormatted: GetAdvanceTimeFilterFormattedFn,
  isBasicData = false
): FilterCardDetail {
  let attributes = entry.attributes
  let isExcluded = false
  let filterCardName = entry.name

  // Excluded filter cards have attributes one level further down (wrapped in NOT)
  if (!attributes && entry.content?.[0]) {
    attributes = entry.content[0].attributes
    isExcluded = true
    filterCardName = entry.content[0].name
  }

  const visibleAttributes: FilterCardDetailAttribute[] = []
  if (attributes?.content) {
    for (const attr of attributes.content) {
      if (attr.constraints?.content?.length > 0) {
        visibleAttributes.push({
          name: getAttributeName(attr.configPath),
          visibleConstraints: formatConstraints(attr.constraints),
        })
      }
    }
  }

  const visibleAdvanceTime: string[] = []
  if (entry.advanceTimeFilter?.filters) {
    for (const filter of entry.advanceTimeFilter.filters) {
      visibleAdvanceTime.push(getAdvanceTimeFilterFormatted(filter))
    }
  }

  return { name: filterCardName, visibleAttributes, visibleAdvanceTime, isExcluded, isBasicData }
}

/**
 * Maps IFR boolContainers to rule-aligned filter card details,
 * mirroring the backend's getInclusionReportFiltercards logic.
 *
 * Basic Data attributes with constraints are split into individual rules.
 * Non-Basic Data boolFilterContainers become rules (with exclusions separated).
 */
export function getInclusionReportFilterCardDetails(
  boolContainers: any[],
  getAttributeName: GetAttributeNameFn,
  getAdvanceTimeFilterFormatted: GetAdvanceTimeFilterFormattedFn
): RuleFilterCardDetails[] {
  const ruleDetails: RuleFilterCardDetails[] = []
  const extract = (entry: any, isBasicData = false) =>
    extractFilterCardDetail(entry, getAttributeName, getAdvanceTimeFilterFormatted, isBasicData)

  // --- Basic Data ---
  const isBasicDataContainer = (bc: any) =>
    bc.content?.[0]?.name === 'Basic Data' || bc.content?.[0]?.content?.[0]?.name === 'Basic Data'

  const basicDataContainer = boolContainers.find(isBasicDataContainer)

  if (basicDataContainer) {
    let basicEntry = basicDataContainer.content[0]
    if (!basicEntry.attributes && basicEntry.content?.[0]) {
      basicEntry = basicEntry.content[0]
    }

    const attrsWithConstraints = (basicEntry.attributes?.content ?? []).filter(
      (a: any) => a.constraints?.content?.length > 0
    )

    if (attrsWithConstraints.length === 1) {
      ruleDetails.push([extract(basicEntry, true)])
    } else {
      for (const attr of attrsWithConstraints) {
        ruleDetails.push([extract({ ...basicEntry, attributes: { ...basicEntry.attributes, content: [attr] } }, true)])
      }
    }
  }

  // --- Non-Basic Data ---
  // Two passes to match backend's parseNonBasicDataFilters ordering:
  // 1) All inclusion cards across all containers first
  // 2) All exclusion cards across all containers after
  const nonBasicContainers = boolContainers.filter(bc => !isBasicDataContainer(bc))

  for (const bc of nonBasicContainers) {
    const inclusionCards = bc.content.filter((e: any) => e.op !== 'NOT')
    if (inclusionCards.length > 0) {
      ruleDetails.push(inclusionCards.map((e: any) => extract(e)))
    }
  }

  for (const bc of nonBasicContainers) {
    const exclusionCards = bc.content.filter((e: any) => e.op === 'NOT')
    for (const excCard of exclusionCards) {
      ruleDetails.push(excCard.content.map((e: any) => extract(e)))
    }
  }

  return ruleDetails
}
