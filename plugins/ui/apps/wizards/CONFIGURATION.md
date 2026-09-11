# Wizards Configuration Guide

This guide explains how to configure and customize wizards for different CDW (Clinical Data Warehouse) configurations.

## Overview

Wizards use `configPath` values to map to CDW config attribute names. The default `wizards-config.json` is based on standard OMOP CDW configurations, but different systems (like HANA Lean) may use different attribute names.

## Pre-built Config Examples

- **`wizards-config.json`** - Standard OMOP configuration (default)
- **`wizards-config-hana-lean.json`** - HANA Lean with corrected attribute paths

## When You Need to Customize

You should customize the wizards configuration when:
- Using HANA Lean or non-standard OMOP configurations
- Your CDW config uses different attribute names

## Common Attribute Mappings

| Standard OMOP | HANA Lean |
|---------------|-----------|
| `Gender_concept_name` | `Gender` |
| `ethnicityName` | `ethnicity` |
| `raceName` | `race` |
| `meas_concept_name` | `measurementconceptname` |
| `condition_occ_concept_name` | `conditionconceptname` |

## Discovering Your Attribute Paths

### Method 1: Browser Dev Tools

1. Open the portal and navigate to **Analytics**
2. Open browser developer tools (F12)
3. Go to the **Network** tab and filter for `analytics.xsjs`
4. Look for the `getMyConfig` request and click on it
5. In the **Response** tab, search for the interaction name (e.g., `conditionoccurrence`)
6. Extract the attribute keys under the `attributes` section

### Method 2: Direct API Call

```bash
curl "https://your-domain/d2e/analytics-svc/pa/services/analytics.xsjs?action=getMyConfig&datasetId=YOUR_DATASET_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Search the JSON response for the interaction name to find available attribute names.

## Customizing the Config File

1. Download the appropriate template (`wizards-config.json` or `wizards-config-hana-lean.json`)
2. Replace attribute paths using the names discovered in the previous step

## Numeric Fields and Negative Values

CDW attributes continue to use `"type": "num"` for all numeric data. Wizard
configuration adds a field-level `allowNegative` option so each form can apply
the domain rule it needs without changing the CDW config:

```json
{
  "id": "signedLabResult",
  "type": "num",
  "label": "Signed lab result",
  "required": false,
  "allowNegative": true
}
```

- Missing or `false` means negative operands are rejected. The numeric tooltip
  also omits its negative-value guidance.
- `true` accepts negative scalars, comparisons, and interval endpoints and shows
  the corresponding tooltip guidance.
- Positive scalars (`60`), comparisons (`>=60`), and intervals (`[50-80]`) are
  supported by both policies.

The checked-in templates explicitly mark their age, anthropometric, and vital
fields with `"allowNegative": false`. If an active PA Wizard config contains a
field whose domain legitimately includes signed values, set `allowNegative` to
`true` before rollout. Updating these repository templates does not modify
already persisted PA configurations.

## Form Notes

Use `formNote` on an individual wizard to customize the italic note displayed with its form:

```json
{
  "id": "calculate-incidence",
  "formNote": "Note: this is a starting point for a more comprehensive analysis."
}
```

- A missing `formNote` preserves the standalone Wizards app's legacy approximation note.
- A string displays the configured note. Cohort Builder also displays explicitly configured notes.
- `null`, an empty string, or whitespace hides the note.

## Form Sections And Groups

Define `sections` on each wizard because the section presence and order can differ between analyses. Groups reference existing field IDs, so field definitions do not need section properties:

```json
{
  "wizards": [
    {
      "id": "calculate-incidence",
      "sections": [
        {
          "id": "measurement",
          "title": "Measurement",
          "groups": [
            {
              "id": "body-measurement",
              "label": "Body measurement",
              "fieldIds": ["height", "weight", "bmi"],
              "columns": 3,
              "validation": {
                "minAnswered": 1,
                "maxAnswered": 2,
                "message": "Enter 1 or 2 of Height, Weight, and BMI."
              }
            }
          ]
        }
      ],
      "fields": []
    }
  ]
}
```

- Missing field IDs are ignored.
- Fields not referenced by that wizard's layout appear in an automatically generated **Additional** section.
- A wizard without `sections` uses the legacy flat field layout.
- `columns` supports `1`, `2`, or `3` columns on desktop and collapses to one column on small screens.
- `validation.minAnswered` and `validation.maxAnswered` constrain how many fields in the group contain values.
- A positive `minAnswered` marks the group as required, disables the form action until the minimum is met, and adds a required marker to the group label.
- `validation.message` is optional guidance displayed from the group's information icon. Without it, guidance is generated from the limits and field labels.
- Once `maxAnswered` is reached, unanswered fields in the group are disabled and explain the limit on hover or focus.
- Individual field `required` rules remain independent. For an interchangeable group such as Height/Weight/BMI, keep the fields optional and express the required count on the group.

## Uploading the Config

### Via Portal
1. Go to **Settings** → **PA Config**
2. Navigate to the **Wizards** tab
3. Click **Upload JSON** and select your customized config file

### Via API
```bash
curl -X POST "https://your-domain/pa-config-svc/wizards/config?datasetId=YOUR_DATASET_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @your-custom-wizards-config.json
```

## Verification Steps

After uploading the configuration:

1. Open **Analytics** → **Wizards** tab
2. Verify wizard cards load without errors
3. Check the browser console - there should be no red error messages
4. Click into a wizard and verify fields render correctly
5. Test running a wizard query
6. If fields are empty or missing, check the `configPath` values in your config

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `TypeError: Cannot read properties of undefined` | Attribute path is incorrect | Verify the `configPath` matches an existing attribute in your CDW config |
| Empty dropdowns | `configPath` doesn't match CDW attribute | Use browser dev tools to discover correct attribute names |
| Wizards not loading | Config upload failed | Check API response for errors and re-upload |

### Rollback

If you need to revert to the previous configuration:

- Via Portal: Settings → PA Config → Wizards tab → Restore previous version
- Via API: Re-upload the previous working config file

## Notes

- Always verify attribute paths against your specific CDW configuration
- Keep a backup of working configurations before making changes
