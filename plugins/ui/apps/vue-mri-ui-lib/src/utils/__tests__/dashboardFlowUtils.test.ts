import { describe, expect, it } from 'vitest'
import {
  getWizardGroupCompletionHint,
  getWizardGroupValidationMessage,
  getWizardFlow,
  isWizardFieldDisabledByGroupLimit,
  isWizardVisibleOnSurface,
  numericFilterContainsNegativeValue,
  normalizeWizardFieldValueForComparison,
  parseNumericInput,
  resolveWizardFormLayout,
  validateRequiredFields,
  type WizardFieldDefinition,
  type WizardFormSection,
} from '../dashboardFlowUtils'

const createExpression = (operator: string, value: string | number) => ({
  type: 'Expression' as const,
  operator,
  value,
})

const createAttribute = (configPath: string, expressions: Array<{ operator: string; value: string | number }>) => ({
  type: 'Attribute' as const,
  configPath,
  constraints: {
    type: 'BooleanContainer' as const,
    op: 'OR' as const,
    content: expressions.map(exp => createExpression(exp.operator, exp.value)),
  },
})

const createFilterCard = (configPath: string, attributes: any[]) => ({
  type: 'FilterCard' as const,
  configPath,
  attributes: {
    type: 'BooleanContainer' as const,
    op: 'AND' as const,
    content: attributes,
  },
})

describe('validateRequiredFields', () => {
  it('marks field as missing when no matching filter card path exists', () => {
    const wizard = {
      id: 'demo-dashboard',
      fields: [
        {
          id: 'age',
          label: 'Age',
          required: true,
          type: 'num',
          configPath: 'patient.attributes.Age',
        },
      ],
    }

    const cards = {
      type: 'BooleanContainer' as const,
      op: 'AND' as const,
      content: [],
    }

    const result = validateRequiredFields(wizard, cards)

    expect(result.missingFields).toHaveLength(1)
    expect(result.missingFields[0].reason).toBe('NO_MATCHING_CARD')
  })

  it('marks field as missing when fixed attributes do not match in same card', () => {
    const wizard = {
      id: 'demo-dashboard',
      fields: [
        {
          id: 'weight',
          label: 'Weight',
          required: true,
          type: 'num',
          configPath: 'patient.interactions.measurement.attributes.numval',
          filterCardPath: 'patient.interactions.measurement',
          fixedAttributes: [
            {
              configPath: 'patient.interactions.measurement.attributes.meas_concept_name',
              operator: '=',
              value: 'Body Weight',
            },
          ],
        },
      ],
    }

    const cards = {
      type: 'BooleanContainer' as const,
      op: 'AND' as const,
      content: [
        createFilterCard('patient.interactions.measurement', [
          createAttribute('patient.interactions.measurement.attributes.meas_concept_name', [
            { operator: '=', value: 'Body Height' },
          ]),
          createAttribute('patient.interactions.measurement.attributes.numval', [{ operator: '>=', value: 50 }]),
        ]),
      ],
    }

    const result = validateRequiredFields(wizard, cards)

    expect(result.missingFields).toHaveLength(1)
    expect(result.missingFields[0].reason).toBe('MISSING_FIXED_ATTRIBUTES')
  })

  it('treats field as satisfied when fixed attributes and value are present', () => {
    const wizard = {
      id: 'demo-dashboard',
      fields: [
        {
          id: 'weight',
          label: 'Weight',
          required: true,
          type: 'num',
          configPath: 'patient.interactions.measurement.attributes.numval',
          filterCardPath: 'patient.interactions.measurement',
          fixedAttributes: [
            {
              configPath: 'patient.interactions.measurement.attributes.meas_concept_name',
              operator: '=',
              value: 'Body Weight',
            },
          ],
        },
      ],
    }

    const cards = {
      type: 'BooleanContainer' as const,
      op: 'AND' as const,
      content: [
        createFilterCard('patient.interactions.measurement', [
          createAttribute('patient.interactions.measurement.attributes.meas_concept_name', [
            { operator: '=', value: 'Body Weight' },
          ]),
          createAttribute('patient.interactions.measurement.attributes.numval', [{ operator: '>=', value: 50 }]),
        ]),
      ],
    }

    const result = validateRequiredFields(wizard, cards)

    expect(result.missingFields).toHaveLength(0)
    expect(result.breakdown[0].satisfied).toBe(true)
  })

  it('marks field as empty constraint when attribute exists without expressions', () => {
    const wizard = {
      id: 'demo-dashboard',
      fields: [
        {
          id: 'gender',
          label: 'Gender',
          required: true,
          type: 'text',
          configPath: 'patient.attributes.Gender_concept_name',
        },
      ],
    }

    const cards = {
      type: 'BooleanContainer' as const,
      op: 'AND' as const,
      content: [
        createFilterCard('patient', [
          {
            type: 'Attribute' as const,
            configPath: 'patient.attributes.Gender_concept_name',
            constraints: {
              type: 'BooleanContainer' as const,
              op: 'OR' as const,
              content: [],
            },
          },
        ]),
      ],
    }

    const result = validateRequiredFields(wizard, cards)

    expect(result.missingFields).toHaveLength(1)
    expect(result.missingFields[0].reason).toBe('EMPTY_CONSTRAINT')
  })
})

describe('parseNumericInput', () => {
  it('parses operator-based input', () => {
    expect(parseNumericInput('>=65')).toEqual([{ op: '>=', value: 65 }])
  })

  it('parses inclusive range input', () => {
    expect(parseNumericInput('[50-80]')).toEqual([
      {
        and: [
          { op: '>=', value: 50 },
          { op: '<=', value: 80 },
        ],
      },
    ])
  })

  it('parses comma separated expressions', () => {
    expect(parseNumericInput('>50,<=70')).toEqual([
      { op: '>', value: 50 },
      { op: '<=', value: 70 },
    ])
  })

  it('returns empty array for invalid input', () => {
    expect(parseNumericInput('abc')).toEqual([])
  })
})

describe('numericFilterContainsNegativeValue', () => {
  it.each([
    [{ op: '=', value: -5 }],
    [{ op: '=', value: -0 }],
    [
      {
        and: [
          { op: '>=', value: -10 },
          { op: '<=', value: 5 },
        ],
      },
    ],
    [
      [
        { op: '>=', value: 5 },
        { op: '<=', value: -1.5 },
      ],
    ],
  ])('detects a negative parsed operand in %j', parsedValue => {
    expect(numericFilterContainsNegativeValue(parsedValue)).toBe(true)
  })

  it.each([
    [{ op: '=', value: 0 }],
    [{ op: '>=', value: 5 }],
    [
      {
        and: [
          { op: '>=', value: 5 },
          { op: '<=', value: 10 },
        ],
      },
    ],
  ])('ignores non-negative parsed operands in %j', parsedValue => {
    expect(numericFilterContainsNegativeValue(parsedValue)).toBe(false)
  })
})

describe('wizard metadata helpers', () => {
  it('shows deployed configs without surfaces on all wizard-aware surfaces', () => {
    expect(isWizardVisibleOnSurface({}, 'wizardApp')).toBe(true)
    expect(isWizardVisibleOnSurface({}, 'cohortBuilder')).toBe(true)
  })

  it('respects explicit surface lists', () => {
    const wizard = { surfaces: ['cohortBuilder' as const] }

    expect(isWizardVisibleOnSurface(wizard, 'wizardApp')).toBe(false)
    expect(isWizardVisibleOnSurface(wizard, 'cohortBuilder')).toBe(true)
  })

  it('defaults missing flow to required-fields', () => {
    expect(getWizardFlow({})).toBe('required-fields')
    expect(getWizardFlow({ flow: 'table1-config' })).toBe('table1-config')
  })
})

describe('wizard field value helpers', () => {
  it('treats null, undefined, and an empty string as the same empty form value', () => {
    expect(normalizeWizardFieldValueForComparison(null)).toBe('')
    expect(normalizeWizardFieldValueForComparison(undefined)).toBe('')
    expect(normalizeWizardFieldValueForComparison('')).toBe('')
  })

  it('preserves non-empty field values', () => {
    expect(normalizeWizardFieldValueForComparison('FEMALE')).toBe('FEMALE')
  })
})

describe('wizard form sections', () => {
  const fields: WizardFieldDefinition[] = [
    { id: 'height', label: 'Height', type: 'num' },
    { id: 'weight', label: 'Weight', type: 'num' },
    { id: 'bmi', label: 'BMI', type: 'num' },
    { id: 'condition1', label: 'Condition 1', type: 'text' },
  ]
  const sections: WizardFormSection[] = [
    {
      id: 'measurement',
      title: 'Measurement',
      groups: [
        {
          id: 'body-measurement',
          fieldIds: ['height', 'weight', 'bmi', 'missing-field'],
          validation: { minAnswered: 1, maxAnswered: 2 },
        },
      ],
    },
  ]

  it('resolves shared field IDs and preserves ungrouped fields', () => {
    const layout = resolveWizardFormLayout(fields, sections)

    expect(layout.sections[0].groups[0].fields.map(field => field.id)).toEqual(['height', 'weight', 'bmi'])
    expect(layout.ungroupedFields.map(field => field.id)).toEqual(['condition1'])
  })

  it('enforces minAnswered and maxAnswered at the group level', () => {
    const group = resolveWizardFormLayout(fields, sections).sections[0].groups[0]

    expect(getWizardGroupValidationMessage(group, {})).toBe('Complete at least 1 field in this group.')
    expect(getWizardGroupValidationMessage(group, { height: '170' })).toBeNull()
    expect(getWizardGroupValidationMessage(group, { height: '170', weight: '70' })).toBeNull()
    expect(getWizardGroupValidationMessage(group, { height: '170', weight: '70', bmi: '24.2' })).toBe(
      'Complete no more than 2 fields in this group.'
    )
    expect(getWizardGroupCompletionHint(group)).toBe('Enter 1 to 2 of Height, Weight, and BMI.')
  })

  it('uses configured group guidance when provided', () => {
    const configuredSections: WizardFormSection[] = [
      {
        ...sections[0],
        groups: [
          {
            ...sections[0].groups[0],
            validation: {
              minAnswered: 1,
              maxAnswered: 2,
              message: 'Enter 1 or 2 of Height, Weight, and BMI.',
            },
          },
        ],
      },
    ]
    const group = resolveWizardFormLayout(fields, configuredSections).sections[0].groups[0]

    expect(getWizardGroupCompletionHint(group)).toBe('Enter 1 or 2 of Height, Weight, and BMI.')
  })

  it('disables only unanswered fields after the group reaches its maximum', () => {
    const group = resolveWizardFormLayout(fields, sections).sections[0].groups[0]

    expect(isWizardFieldDisabledByGroupLimit(group, 'bmi', { height: '170', weight: '70' })).toBe(true)
    expect(isWizardFieldDisabledByGroupLimit(group, 'height', { height: '170', weight: '70' })).toBe(false)
    expect(isWizardFieldDisabledByGroupLimit(group, 'bmi', { height: '170' })).toBe(false)
  })
})
