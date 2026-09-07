export const cdwFHIRConfigDuckdb = {
  patient: {
    conditions: {},
    interactions: {
      questionnaireresponse: {
        name: [
          {
            lang: "",
            value: "Questionnaire Response",
          },
        ],
        disabledLangName: [
          {
            lang: "de",
            value: "",
            visible: true,
          },
          {
            lang: "fr",
            value: "",
            visible: true,
          },
          {
            lang: "es",
            value: "",
            visible: true,
          },
          {
            lang: "pt",
            value: "",
            visible: true,
          },
          {
            lang: "zh",
            value: "",
            visible: true,
          },
          {
            lang: "en",
            value: "",
            visible: true,
          },
        ],
        defaultFilter: "1=1",
        defaultPlaceholder: "@QUESTIONNAIRERESPONSE",
        order: 1,
        parentInteraction: [""],
        parentInteractionLabel: "parent",
        attributes: {
          question1: {
            name: [
              {
                lang: "",
                value:
                  "In which areas would you like to focus your rehabilitation?",
              },
            ],
            disabledLangName: [
              {
                lang: "en",
                value: "",
                visible: true,
              },
              {
                lang: "de",
                value: "",
                visible: true,
              },
              {
                lang: "fr",
                value: "",
              },
              {
                lang: "es",
                value: "",
              },
              {
                lang: "pt",
                value: "",
              },
              {
                lang: "zh",
                value: "",
              },
            ],
            type: "text",
            expression:
              "replace( list_reduce( CAST(list_transform( @QUESTIONNAIRERESPONSE.content.item[0].answer::json[], e -> e.valueCoding.display) AS varchar[]), (acc, e) -> concat(acc, ', ', e) ), '\"', '' )",
            order: 1,
            domainFilter: "",
            standardConceptCodeFilter: "",
            cohortDefinitionKey: "",
            conceptIdentifierType: "",
          },
          question2: {
            name: [
              {
                lang: "",
                value: "Describe your goal in a short sentence:",
              },
            ],
            disabledLangName: [
              {
                lang: "en",
                value: "",
                visible: true,
              },
              {
                lang: "de",
                value: "",
                visible: true,
              },
              {
                lang: "fr",
                value: "",
              },
              {
                lang: "es",
                value: "",
              },
              {
                lang: "pt",
                value: "",
              },
              {
                lang: "zh",
                value: "",
              },
            ],
            type: "text",
            expression:
              "replace( @QUESTIONNAIRERESPONSE.content.item[1].answer[0].valueString, '\"', '' )",
            order: 2,
            domainFilter: "",
            standardConceptCodeFilter: "",
            cohortDefinitionKey: "",
            conceptIdentifierType: "",
          },
          question3: {
            name: [
              {
                lang: "",
                value: "Do you think your goal is clearly defined?",
              },
            ],
            disabledLangName: [
              {
                lang: "en",
                value: "",
                visible: true,
              },
              {
                lang: "de",
                value: "",
                visible: true,
              },
              {
                lang: "fr",
                value: "",
              },
              {
                lang: "es",
                value: "",
              },
              {
                lang: "pt",
                value: "",
              },
              {
                lang: "zh",
                value: "",
              },
            ],
            type: "text",
            expression:
              "replace( list_reduce( CAST(list_transform( @QUESTIONNAIRERESPONSE.content.item[2].answer::json[], e -> e.valueCoding.display) AS varchar[]), (acc, e) -> concat(acc, ', ', e) ), '\"', '' )",
            order: 3,
            domainFilter: "",
            standardConceptCodeFilter: "",
            cohortDefinitionKey: "",
            conceptIdentifierType: "",
          },
          question4: {
            name: [
              {
                lang: "",
                value: "Is your goal clearly measurable?",
              },
            ],
            disabledLangName: [
              {
                lang: "en",
                value: "",
                visible: true,
              },
              {
                lang: "de",
                value: "",
                visible: true,
              },
              {
                lang: "fr",
                value: "",
              },
              {
                lang: "es",
                value: "",
              },
              {
                lang: "pt",
                value: "",
              },
              {
                lang: "zh",
                value: "",
              },
            ],
            type: "text",
            expression:
              "replace( list_reduce( CAST(list_transform( @QUESTIONNAIRERESPONSE.content.item[3].answer::json[], e -> e.valueCoding.display) AS varchar[]), (acc, e) -> concat(acc, ', ', e) ), '\"', '' )",
            order: 4,
            domainFilter: "",
            standardConceptCodeFilter: "",
            cohortDefinitionKey: "",
            conceptIdentifierType: "",
          },
          question5: {
            name: [
              {
                lang: "",
                value: "Do you think you can achieve your goal?",
              },
            ],
            disabledLangName: [
              {
                lang: "en",
                value: "",
                visible: true,
              },
              {
                lang: "de",
                value: "",
                visible: true,
              },
              {
                lang: "fr",
                value: "",
              },
              {
                lang: "es",
                value: "",
              },
              {
                lang: "pt",
                value: "",
              },
              {
                lang: "zh",
                value: "",
              },
            ],
            type: "text",
            expression:
              "replace( list_reduce( CAST(list_transform( @QUESTIONNAIRERESPONSE.content.item[4].answer::json[], e -> e.valueCoding.display) AS varchar[]), (acc, e) -> concat(acc, ', ', e) ), '\"', '' )",
            order: 5,
            domainFilter: "",
            standardConceptCodeFilter: "",
            cohortDefinitionKey: "",
            conceptIdentifierType: "",
          },
          question6: {
            name: [
              {
                lang: "",
                value:
                  "Do you think achieving your goal will have a positive impact on your rehabilitation?",
              },
            ],
            disabledLangName: [
              {
                lang: "en",
                value: "",
                visible: true,
              },
              {
                lang: "de",
                value: "",
                visible: true,
              },
              {
                lang: "fr",
                value: "",
              },
              {
                lang: "es",
                value: "",
              },
              {
                lang: "pt",
                value: "",
              },
              {
                lang: "zh",
                value: "",
              },
            ],
            type: "text",
            expression:
              "replace( list_reduce( CAST(list_transform( @QUESTIONNAIRERESPONSE.content.item[5].answer::json[], e -> e.valueCoding.display) AS varchar[]), (acc, e) -> concat(acc, ', ', e) ), '\"', '' )",
            order: 6,
            domainFilter: "",
            standardConceptCodeFilter: "",
            cohortDefinitionKey: "",
            conceptIdentifierType: "",
          },
          question7: {
            name: [
              {
                lang: "",
                value: "Would you like to adjust your goal again?",
              },
            ],
            disabledLangName: [
              {
                lang: "en",
                value: "",
                visible: true,
              },
              {
                lang: "de",
                value: "",
                visible: true,
              },
              {
                lang: "fr",
                value: "",
              },
              {
                lang: "es",
                value: "",
              },
              {
                lang: "pt",
                value: "",
              },
              {
                lang: "zh",
                value: "",
              },
            ],
            type: "text",
            expression:
              "replace( @QUESTIONNAIRERESPONSE.content.item[6].answer[0].valueString, '\"', '' )",
            order: 7,
            domainFilter: "",
            standardConceptCodeFilter: "",
            cohortDefinitionKey: "",
            conceptIdentifierType: "",
          },
        },
      },
    },
    attributes: {
      pid: {
        name: [
          {
            lang: "",
            value: "Person id",
          },
        ],
        disabledLangName: [
          {
            lang: "en",
            value: "",
          },
          {
            lang: "de",
            value: "",
          },
          {
            lang: "fr",
            value: "",
          },
          {
            lang: "es",
            value: "",
          },
          {
            lang: "pt",
            value: "",
          },
          {
            lang: "zh",
            value: "",
          },
        ],
        type: "text",
        expression: "@PATIENT.id",
        order: 0,
        annotations: ["person_id"],
        domainFilter: "",
        standardConceptCodeFilter: "",
      },
      pcount: {
        name: [
          {
            lang: "",
            value: "Patient Count",
          },
        ],
        disabledLangName: [
          {
            lang: "en",
            value: "",
          },
          {
            lang: "de",
            value: "",
          },
          {
            lang: "fr",
            value: "",
          },
          {
            lang: "es",
            value: "",
          },
          {
            lang: "pt",
            value: "",
          },
          {
            lang: "zh",
            value: "",
          },
        ],
        type: "num",
        measureExpression: "COUNT(DISTINCT(@PATIENT.id))",
        order: 1,
        domainFilter: "",
        standardConceptCodeFilter: "",
      },
      monthOfBirth: {
        name: [
          {
            lang: "",
            value: "Month of Birth",
          },
        ],
        disabledLangName: [
          {
            lang: "en",
            value: "",
          },
          {
            lang: "de",
            value: "",
          },
          {
            lang: "fr",
            value: "",
          },
          {
            lang: "es",
            value: "",
          },
          {
            lang: "pt",
            value: "",
          },
          {
            lang: "zh",
            value: "",
          },
        ],
        type: "num",
        expression: "@PATIENT.birthDate",
        order: 2,
        domainFilter: "",
        standardConceptCodeFilter: "",
      },
      yearOfBirth: {
        name: [
          {
            lang: "",
            value: "Year of Birth",
          },
        ],
        disabledLangName: [
          {
            lang: "en",
            value: "",
          },
          {
            lang: "de",
            value: "",
          },
          {
            lang: "fr",
            value: "",
          },
          {
            lang: "es",
            value: "",
          },
          {
            lang: "pt",
            value: "",
          },
          {
            lang: "zh",
            value: "",
          },
        ],
        type: "num",
        expression: "@PATIENT.birthDate",
        order: 3,
        domainFilter: "",
        standardConceptCodeFilter: "",
      },
      dateOfBirth: {
        name: [
          {
            lang: "",
            value: "Birth Datetime",
          },
        ],
        disabledLangName: [
          {
            lang: "en",
            value: "",
          },
          {
            lang: "de",
            value: "",
          },
          {
            lang: "fr",
            value: "",
          },
          {
            lang: "es",
            value: "",
          },
          {
            lang: "pt",
            value: "",
          },
          {
            lang: "zh",
            value: "",
          },
        ],
        type: "datetime",
        expression: "@PATIENT.birthDate",
        order: 4,
        annotations: ["birth_datetime"],
        domainFilter: "",
        standardConceptCodeFilter: "",
      },
      gendersourcevalue: {
        name: [
          {
            lang: "",
            value: "Gender source value",
          },
        ],
        disabledLangName: [
          {
            lang: "en",
            value: "",
            visible: true,
          },
          {
            lang: "de",
            value: "",
            visible: true,
          },
          {
            lang: "fr",
            value: "",
            visible: true,
          },
          {
            lang: "es",
            value: "",
            visible: true,
          },
          {
            lang: "pt",
            value: "",
            visible: true,
          },
          {
            lang: "zh",
            value: "",
            visible: true,
          },
        ],
        type: "text",
        expression: "@PATIENT.gender",
        order: 5,
        domainFilter: "",
        standardConceptCodeFilter: "",
      },
      Age: {
        name: [
          {
            lang: "",
            value: "Age",
          },
        ],
        disabledLangName: [
          {
            lang: "de",
            value: "",
            visible: true,
          },
          {
            lang: "fr",
            value: "",
            visible: true,
          },
          {
            lang: "es",
            value: "",
            visible: true,
          },
          {
            lang: "pt",
            value: "",
            visible: true,
          },
          {
            lang: "zh",
            value: "",
            visible: true,
          },
          {
            lang: "en",
            value: "",
          },
        ],
        type: "num",
        expression: "YEAR(CURRENT_DATE) - YEAR(@PATIENT.birthDate::DATE)",
        order: 6,
        domainFilter: "",
        standardConceptCodeFilter: "",
      },
      patientname: {
        name: [
          {
            lang: "",
            value: "Patient Name",
          },
        ],
        disabledLangName: [
          {
            lang: "de",
            value: "",
            visible: true,
          },
          {
            lang: "fr",
            value: "",
            visible: true,
          },
          {
            lang: "es",
            value: "",
            visible: true,
          },
          {
            lang: "pt",
            value: "",
            visible: true,
          },
          {
            lang: "zh",
            value: "",
            visible: true,
          },
          {
            lang: "en",
            value: "",
          },
        ],
        type: "text",
        expression:
          "replace(list_reduce(CAST(@PATIENT.content->'$.name[*].family' AS varchar[]), (acc, e) -> concat(acc, ' ', e)), '\"',  '')",
        order: 7,
        domainFilter: "",
        standardConceptCodeFilter: "",
      },
      familyname: {
        name: [
          {
            lang: "",
            value: "Family Name",
          },
        ],
        disabledLangName: [
          {
            lang: "de",
            value: "",
            visible: true,
          },
          {
            lang: "fr",
            value: "",
            visible: true,
          },
          {
            lang: "es",
            value: "",
            visible: true,
          },
          {
            lang: "pt",
            value: "",
            visible: true,
          },
          {
            lang: "zh",
            value: "",
            visible: true,
          },
          {
            lang: "en",
            value: "",
          },
        ],
        type: "text",
        expression:
          "replace(list_reduce(CAST(@PATIENT.content->'$.name[*].family' AS varchar[]), (acc, e) -> concat(acc, ' ', e)), '\"',  '')",
        order: 7,
        domainFilter: "",
        standardConceptCodeFilter: "",
      },
      givenname: {
        name: [
          {
            lang: "",
            value: "Given Name",
          },
        ],
        disabledLangName: [
          {
            lang: "de",
            value: "",
            visible: true,
          },
          {
            lang: "fr",
            value: "",
            visible: true,
          },
          {
            lang: "es",
            value: "",
            visible: true,
          },
          {
            lang: "pt",
            value: "",
            visible: true,
          },
          {
            lang: "zh",
            value: "",
            visible: true,
          },
          {
            lang: "en",
            value: "",
          },
        ],
        type: "text",
        expression:
          "replace(list_reduce(CAST(@PATIENT.content->'$.name[*].given[*]' AS varchar[]), (acc, e) -> concat(acc, ' ', e)), '\"',  '')",
        order: 8,
        domainFilter: "",
        standardConceptCodeFilter: "",
      },
    },
  },
  censor: {},
  advancedSettings: {
    tableTypePlaceholderMap: {
      factTable: {
        placeholder: "@PATIENT",
        attributeTables: [],
      },
      dimTables: [
        {
          placeholder: "@QUESTIONNAIRERESPONSE",
          attributeTables: [],
          hierarchy: false,
          time: true,
          oneToN: false,
          condition: false,
        },
      ],
    },
    tableMapping: {
      "@QUESTIONNAIRERESPONSE": "$$SCHEMA$$.QuestionnaireResponse",
      "@QUESTIONNAIRERESPONSE.PATIENT_ID": "patient[9:]", // Skip first 9 characters which is a prefix `Patient/`
      "@PATIENT": '$$SCHEMA$$."Patient"',
      "@PATIENT.PATIENT_ID": "id",
      "@PATIENT.DOD": "deathDate",
      "@PATIENT.DOB": "birthDate",
    },
    guardedTableMapping: {
      "@PATIENT": '$$SCHEMA$$."Patient"',
    },
    language: ["en", "de", "fr", "es", "pt", "zh"],
    others: {},
    settings: {
      fuzziness: 0.7,
      maxResultSize: 5000,
      errorDetailsReturnOn: false,
      errorStackTraceReturnOn: false,
      enableFreeText: true,
      vbEnabled: true,
      dateFormat: "YYYY-MM-dd",
      timeFormat: "HH:mm:ss",
      otsTableMap: {
        "@code": "$$VOCAB_SCHEMA$$.concept",
      },
    },
    shared: {},
    schemaVersion: "3",
  },
};

export const paFHIRConfigDuckdb = {
  filtercards: [
    {
      source: "patient",
      visible: true,
      order: 1,
      initial: true,
      attributes: [
        {
          source: "patient.attributes.pid",
          ordered: false,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: false,
          filtercard: {
            initial: false,
            visible: true,
            order: 1,
          },
          patientlist: {
            initial: true,
            visible: true,
            linkColumn: false,
          },
          modelName: "Person id",
        },
        {
          source: "patient.attributes.pcount",
          ordered: true,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: false,
          measure: true,
          filtercard: {
            initial: false,
            visible: false,
            order: 2,
          },
          patientlist: {
            initial: false,
            visible: false,
            linkColumn: false,
          },
          modelName: "Patient Count",
        },
        {
          source: "patient.attributes.monthOfBirth",
          ordered: true,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: true,
          filtercard: {
            initial: false,
            visible: true,
            order: 3,
          },
          patientlist: {
            initial: true,
            visible: true,
            linkColumn: false,
          },
          modelName: "Month of Birth",
        },
        {
          source: "patient.attributes.yearOfBirth",
          ordered: true,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: true,
          filtercard: {
            initial: false,
            visible: true,
            order: 4,
          },
          patientlist: {
            initial: true,
            visible: true,
            linkColumn: false,
          },
          modelName: "Year of Birth",
        },
        {
          source: "patient.attributes.dateOfBirth",
          ordered: false,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: false,
          filtercard: {
            initial: false,
            visible: true,
            order: 5,
          },
          patientlist: {
            initial: false,
            visible: true,
            linkColumn: false,
          },
          modelName: "Birth Datetime",
        },
        {
          source: "patient.attributes.gendersourcevalue",
          ordered: false,
          cached: true,
          useRefText: true,
          useRefValue: true,
          category: true,
          measure: false,
          filtercard: {
            initial: false,
            visible: true,
            order: 6,
          },
          patientlist: {
            initial: true,
            visible: true,
            linkColumn: false,
          },
          modelName: "Gender source value",
        },
        {
          source: "patient.attributes.Age",
          ordered: true,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: true,
          defaultBinSize: 10,
          filtercard: {
            initial: false,
            visible: true,
            order: 7,
          },
          patientlist: {
            initial: true,
            visible: true,
            linkColumn: false,
          },
          modelName: "Age",
        },
        {
          source: "patient.attributes.patientname",
          ordered: true,
          cached: true,
          useRefText: true,
          useRefValue: true,
          category: true,
          measure: true,
          filtercard: {
            initial: false,
            visible: true,
            order: 8,
          },
          patientlist: {
            initial: false,
            visible: true,
            linkColumn: false,
          },
          modelName: "Patient Name",
        },
        {
          source: "patient.attributes.familyname",
          ordered: true,
          cached: true,
          useRefText: true,
          useRefValue: true,
          category: true,
          measure: true,
          filtercard: {
            initial: false,
            visible: true,
            order: 9,
          },
          patientlist: {
            initial: true,
            visible: true,
            linkColumn: false,
          },
          modelName: "Family Name",
        },
        {
          source: "patient.attributes.givenname",
          ordered: true,
          cached: true,
          useRefText: true,
          useRefValue: true,
          category: true,
          measure: true,
          filtercard: {
            initial: false,
            visible: true,
            order: 10,
          },
          patientlist: {
            initial: true,
            visible: true,
            linkColumn: false,
          },
          modelName: "Given Name",
        },
      ],
      initialPatientlistColumn: true,
      modelName: "MRI_PA_SERVICES_FILTERCARD_TITLE_BASIC_DATA",
    },
    {
      source: "patient.interactions.questionnaireresponse",
      visible: true,
      order: 1,
      initial: true,
      attributes: [
        {
          source:
            "patient.interactions.questionnaireresponse.attributes.question1",
          ordered: false,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: false,
          filtercard: {
            initial: true,
            visible: true,
            order: 1,
          },
          patientlist: {
            initial: false,
            visible: true,
            linkColumn: false,
          },
          modelName:
            "In which areas would you like to focus your rehabilitation?",
        },
        {
          source:
            "patient.interactions.questionnaireresponse.attributes.question2",
          ordered: false,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: false,
          filtercard: {
            initial: true,
            visible: true,
            order: 2,
          },
          patientlist: {
            initial: false,
            visible: true,
            linkColumn: false,
          },
          modelName: "Describe your goal in a short sentence:",
        },
        {
          source:
            "patient.interactions.questionnaireresponse.attributes.question3",
          ordered: false,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: false,
          filtercard: {
            initial: true,
            visible: true,
            order: 3,
          },
          patientlist: {
            initial: false,
            visible: true,
            linkColumn: false,
          },
          modelName: "Do you think your goal is clearly defined?",
        },
        {
          source:
            "patient.interactions.questionnaireresponse.attributes.question4",
          ordered: false,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: false,
          filtercard: {
            initial: true,
            visible: true,
            order: 4,
          },
          patientlist: {
            initial: false,
            visible: true,
            linkColumn: false,
          },
          modelName: "Is your goal clearly measurable?",
        },
        {
          source:
            "patient.interactions.questionnaireresponse.attributes.question5",
          ordered: false,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: false,
          filtercard: {
            initial: true,
            visible: true,
            order: 5,
          },
          patientlist: {
            initial: false,
            visible: true,
            linkColumn: false,
          },
          modelName: "Do you think you can achieve your goal?",
        },
        {
          source:
            "patient.interactions.questionnaireresponse.attributes.question6",
          ordered: false,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: false,
          filtercard: {
            initial: true,
            visible: true,
            order: 6,
          },
          patientlist: {
            initial: false,
            visible: true,
            linkColumn: false,
          },
          modelName:
            "Do you think achieving your goal will have a positive impact on your rehabilitation?",
        },
        {
          source:
            "patient.interactions.questionnaireresponse.attributes.question7",
          ordered: false,
          cached: true,
          useRefText: false,
          useRefValue: false,
          category: true,
          measure: false,
          filtercard: {
            initial: true,
            visible: true,
            order: 7,
          },
          patientlist: {
            initial: false,
            visible: true,
            linkColumn: false,
          },
          modelName: "Would you like to adjust your goal again?",
        },
      ],
      initialPatientlistColumn: false,
      modelName: "Questionnaire Response",
    },
  ],
  chartOptions: {
    initialAttributes: {
      measures: ["patient.attributes.pcount"],
      categories: [
        "patient.attributes.gendersourcevalue",
        "patient.attributes.Age",
      ],
      stackCategory: [],
    },
    initialChart: "stacked",
    stacked: {
      visible: true,
      pdfDownloadEnabled: true,
      downloadEnabled: true,
      imageDownloadEnabled: true,
      collectionEnabled: true,
      beginVisible: true,
      fillMissingValuesEnabled: true,
      overlappingHistogramEnabled: false,
      overlappingBarChartEnabled: false,
      kernelDensityPlotEnabled: false,
    },
    boxplot: {
      visible: true,
      pdfDownloadEnabled: true,
      downloadEnabled: true,
      imageDownloadEnabled: true,
      collectionEnabled: true,
      beginVisible: true,
      fillMissingValuesEnabled: true,
    },
    km: {
      visible: true,
      pdfDownloadEnabled: true,
      downloadEnabled: true,
      imageDownloadEnabled: true,
      collectionEnabled: true,
      beginVisible: true,
      confidenceInterval: 1.95996398454,
      filters: [],
      selectedInteractions: [],
      selectedEndInteractions: [],
    },
    list: {
      visible: true,
      zipDownloadEnabled: true,
      downloadEnabled: true,
      collectionEnabled: true,
      beginVisible: true,
      pageSize: 20,
      maxPatientsExport: 2000000,
    },
    vb: {
      visible: true,
      referenceName: "GRCh37",
      enabled: false,
    },
    custom: {
      visible: true,
      customCharts: [],
    },
    sac: {
      visible: false,
      sacCharts: [],
      enabled: true,
    },
    shared: {
      enabled: false,
      systemName: "MRI",
    },
    minCohortSize: 0,
  },
  configInformations: {
    note: "",
  },
  panelOptions: {
    addToCohorts: true,
    domainValuesLimit: 5000,
    calcViewAccessPoint: true,
    externalAccessPoints: true,
    cohortEntryExit: false,
    inclusionReport: false,
    intersectViewInclusionReport: false,
  },
};
