const VARIANT_INTERACTIONS = {
  "@INTERACTION": ``,
  "@INTERACTION.POSITION_START": `"POSITION_START"`,
  "@INTERACTION.GENE_NAME": `"GENE_NAME"`,
  "@INTERACTION.REGION": `"REGION"`,
  "@INTERACTION.VARIANT_TYPE": `"VARIANT_TYPE"`,
  "@INTERACTION.SEQUENCE_ALTERATION": `"SEQUENCE_ALTERATION"`,
  "@INTERACTION.AA_REF": `"AA_REF"`,
  "@INTERACTION.AA_ALT": `"AA_ALT"`,
  "@INTERACTION.DWAuditID": `"DWAuditID"`,
  "@INTERACTION.VariantIndex": `"VariantIndex"`,
  "@INTERACTION.AlleleIndex": `"AlleleIndex"`,
  "@INTERACTION.SampleIndex": `"SampleIndex"`,
};

const COLLECTIONS_AS_OBS = {
  "@OBS": ``,
};

export function getEmptyConfig(analyticsConnectionParameters: any): any {
    return {
        "patient": {
            "conditions": {},
            "interactions": {},
            "attributes": {}
        },
        "censor": {},
        "advancedSettings": {
            "tableTypePlaceholderMap": {
                "factTable": {
                    "placeholder": "@PATIENT",
                    "attributeTables": []
                },
                "dimTables": []
            },
            "tableMapping": {
                "@PATIENT": "",
                "@PATIENT.PATIENT_ID": "",
                "@PATIENT.DOD": "",
                "@PATIENT.DOB": "",
                "@REF": `"${analyticsConnectionParameters.vocabSchema}"."CONCEPT"`,
                "@REF.VOCABULARY_ID": "\"VOCABULARY_ID\"",
                "@REF.CODE": "\"CONCEPT_ID\"",
                "@REF.TEXT": "\"CONCEPT_NAME\"",
                "@TEXT": "",
                "@TEXT.INTERACTION_ID": "",
                "@TEXT.INTERACTION_TEXT_ID": "",
                "@TEXT.VALUE": ""
            },
            "guardedTableMapping": {
                "@PATIENT": ""
            },
            "language": [
                "en",
                "de",
                "fr",
                "es",
                "pt",
                "zh"
            ],
            "others": {},
            "settings": {
                "fuzziness": 0.7,
                "maxResultSize": 5000,
                "errorDetailsReturnOn": false,
                "errorStackTraceReturnOn": false,
                "enableFreeText": true,
                "vbEnabled": true,
                "dateFormat": "YYYY-MM-dd",
                "timeFormat": "HH:mm:ss",
                "otsTableMap": {
                    "@CODE": ""
                }
            },
            "shared": {},
            "schemaVersion": "3"
        }
    }
}

export function generateDefaultAttributes(placeholderMap: PholderTableMapType): { patient: CDMConfigPatientType; } {

    return {
      patient: {
        conditions: {},
        interactions: {
          ga_sample: {
            name: [
              {
                lang: "",
                value: "Genome Sequencing",
              },
              {
                lang: "en",
                value: "Genome Sequencing",
              },
              {
                lang: "de",
                value: "Genomsequenzierung",
              },
              {
                lang: "fr",
                value: "Séquençage de l'ADN",
              },
              {
                lang: "es",
                value: "Secuenciación de genoma",
              },
              {
                lang: "pt",
                value: "Sequenciamento do genoma",
              },
              {
                lang: "zh",
                value: "基因组测序",
              },
            ],
            defaultFilter: `@INTERACTION.${placeholderMap["@INTERACTION.INTERACTION_TYPE"]} = 'Genomic'`,
            order: 0,
            attributes: {
              sample_id: {
                name: [
                  {
                    lang: "",
                    value: "Sample Id",
                  },
                  {
                    lang: "en",
                    value: "Sample ID",
                  },
                  {
                    lang: "de",
                    value: "Proben-ID",
                  },
                  {
                    lang: "fr",
                    value: "ID de l'échantillon",
                  },
                  {
                    lang: "es",
                    value: "ID de muestra",
                  },
                  {
                    lang: "pt",
                    value: "ID da amostra",
                  },
                  {
                    lang: "zh",
                    value: "样本标识",
                  },
                ],
                type: "text",
                defaultFilter: `@CODE.${placeholderMap["@CODE.ATTRIBUTE"]} = 'SampleIndex'`,
                expression: `@CODE.${placeholderMap["@CODE.VALUE"]}`,
                order: 0,
                annotations: ["genomics_sample_id"],
              },
              reference_id: {
                name: [
                  {
                    lang: "",
                    value: "Genome Reference",
                  },
                  {
                    lang: "en",
                    value: "Genome Reference",
                  },
                  {
                    lang: "de",
                    value: "Genomreferenz",
                  },
                  {
                    lang: "fr",
                    value: "Génome de référence",
                  },
                  {
                    lang: "es",
                    value: "Referencia de genoma",
                  },
                  {
                    lang: "pt",
                    value: "Referência de genoma",
                  },
                  {
                    lang: "zh",
                    value: "基因组参考",
                  },
                ],
                type: "text",
                defaultFilter: `@CODE.${placeholderMap["@CODE.ATTRIBUTE"]} = 'ReferenceGenome'`,
                expression: `@CODE.${placeholderMap["@CODE.VALUE"]}`,
                order: 1,
              },
              sample_class: {
                name: [
                  {
                    lang: "",
                    value: "Sample Class",
                  },
                  {
                    lang: "en",
                    value: "Sample Class",
                  },
                  {
                    lang: "de",
                    value: "Probenklasse",
                  },
                  {
                    lang: "fr",
                    value: "Type d’échantillon",
                  },
                  {
                    lang: "es",
                    value: "Clase de muestra",
                  },
                  {
                    lang: "pt",
                    value: "Classe de amostras",
                  },
                  {
                    lang: "zh",
                    value: "样本类",
                  },
                ],
                type: "text",
                defaultFilter: `@CODE.${placeholderMap["@CODE.ATTRIBUTE"]} = 'SampleClass'`,
                expression: `@CODE.${placeholderMap["@CODE.VALUE"]}`,
                order: 2,
              },
            },
          },
        },
        attributes: {
          pid: {
            name: [
              {
                lang: "",
                value: "Patient ID",
              },
              {
                lang: "en",
                value: "Patient ID",
              },
              {
                lang: "de",
                value: "Patienten-ID",
              },
              {
                lang: "fr",
                value: "ID du patient",
              },
              {
                lang: "es",
                value: "ID de paciente",
              },
              {
                lang: "pt",
                value: "ID do paciente",
              },
              {
                lang: "zh",
                value: "病患标识",
              },
            ],
            type: "text",
            expression: `@PATIENT.${placeholderMap["@PATIENT.PATIENT_ID"]}`,
            annotations: ["patient_id"],
          },
          pcount: {
            name: [
              {
                lang: "",
                value: "Patient Count",
              },
              {
                lang: "en",
                value: "Patient Count",
              },
              {
                lang: "de",
                value: "Patientenanzahl",
              },
              {
                lang: "fr",
                value: "Nombre de patients",
              },
              {
                lang: "es",
                value: "Número de pacientes",
              },
              {
                lang: "pt",
                value: "Número de pacientes",
              },
              {
                lang: "zh",
                value: "病患计数",
              },
            ],
            type: "num",
            measureExpression: `COUNT(DISTINCT(@PATIENT.${placeholderMap["@PATIENT.PATIENT_ID"]}))`,
            order: 1,
          },
          cohort: {
            name: [
              {
                lang: "",
                value: "Cohort",
              },
              {
                lang: "en",
                value: "Cohort",
              },
              {
                lang: "de",
                value: "Kohorte",
              },
              {
                lang: "fr",
                value: "Cohorte",
              },
              {
                lang: "es",
                value: "Cohorte",
              },
              {
                lang: "pt",
                value: "Coorte",
              },
              {
                lang: "zh",
                value: "群",
              },
            ],
            type: "text",
            defaultFilter: `@OBS."ObsCharValue"=@OBS."ObsCharValue"`,
            expression: `@OBS."ObsCharValue"`,
            order: 2,
            from: {
              "@OBS": COLLECTIONS_AS_OBS["@OBS"],
            },
          },
          cohortStatus: {
            name: [
              {
                lang: "",
                value: "Cohort Patient Status",
              },
              {
                lang: "en",
                value: "Cohort Patient Status",
              },
              {
                lang: "de",
                value: "Patientenstatus in Kohorte",
              },
              {
                lang: "fr",
                value: "Patients dans la cohorte",
              },
              {
                lang: "es",
                value: "Estado de paciente de cohorte",
              },
              {
                lang: "pt",
                value: "Status do paciente de coorte",
              },
              {
                lang: "zh",
                value: "病患群状态",
              },
            ],
            disabledLangName: [],
            type: "text",
            expression: '@OBS."ObsCharValue"',
            order: 6,
            from: {
              "@OBS": "",
            },
          },
          monthOfBirth: {
            name: [
              {
                lang: "",
                value: "Month of Birth",
              },
              {
                lang: "en",
                value: "Month of Birth",
              },
              {
                lang: "de",
                value: "Geburtsmonat",
              },
              {
                lang: "fr",
                value: "Mois de naissance",
              },
              {
                lang: "es",
                value: "Mes de nacimiento",
              },
              {
                lang: "pt",
                value: "Mês de nascimento",
              },
              {
                lang: "zh",
                value: "出生月份",
              },
            ],
            type: "num",
            expression: `MONTH(@PATIENT.${placeholderMap["@PATIENT.DOB"]})`,
            order: 6,
          },
          yearOfBirth: {
            name: [
              {
                lang: "",
                value: "Year of Birth",
              },
              {
                lang: "en",
                value: "Year of Birth",
              },
              {
                lang: "de",
                value: "Geburtsjahr",
              },
              {
                lang: "fr",
                value: "Année de naissance",
              },
              {
                lang: "es",
                value: "Año de nacimiento",
              },
              {
                lang: "pt",
                value: "Ano de nascimento",
              },
              {
                lang: "zh",
                value: "出生年",
              },
            ],
            type: "num",
            expression: `YEAR(@PATIENT.${placeholderMap["@PATIENT.DOB"]})`,
            order: 7,
          },
          dateOfBirth: {
            name: [
              {
                lang: "",
                value: "Date of Birth",
              },
              {
                lang: "en",
                value: "Date of Birth",
              },
              {
                lang: "de",
                value: "Geburtsdatum",
              },
              {
                lang: "fr",
                value: "Date de naissance",
              },
              {
                lang: "es",
                value: "Fecha de nacimiento",
              },
              {
                lang: "pt",
                value: "Data de nascimento",
              },
              {
                lang: "zh",
                value: "出生日期",
              },
            ],
            type: "datetime",
            expression: `@PATIENT.${placeholderMap["@PATIENT.DOB"]}`,
            order: 8,
            annotations: ["date_of_birth"],
          },
          dateOfDeath: {
            name: [
              {
                lang: "",
                value: "Date of Death",
              },
              {
                lang: "en",
                value: "Date of Death",
              },
              {
                lang: "de",
                value: "Todesdatum",
              },
              {
                lang: "fr",
                value: "Date du décès",
              },
              {
                lang: "es",
                value: "Fecha de fallecimiento",
              },
              {
                lang: "pt",
                value: "Data do óbito",
              },
              {
                lang: "zh",
                value: "死亡日期",
              },
            ],
            type: "datetime",
            expression: `@PATIENT.${placeholderMap["@PATIENT.DOD"]}`,
            order: 8,
            annotations: ["date_of_death"],
          },

          calYear: {
            name: [
              {
                lang: "",
                value: "Start Year",
              },
              {
                lang: "en",
                value: "Start Year",
              },
              {
                lang: "de",
                value: "Startjahr",
              },
              {
                lang: "fr",
                value: "Année de début",
              },
              {
                lang: "es",
                value: "Año de inicio",
              },
              {
                lang: "pt",
                value: "Ano de início",
              },
              {
                lang: "zh",
                value: "开始年份",
              },
            ],
            type: "num",
            expression: `YEAR(@INTERACTION.${placeholderMap["@INTERACTION.START"]})`,
            order: 0,
            isDefault: true,
          },
          calMonth: {
            name: [
              {
                lang: "",
                value: "Start Month",
              },
              {
                lang: "en",
                value: "Start Month",
              },
              {
                lang: "de",
                value: "Startmonat",
              },
              {
                lang: "fr",
                value: "Mois de début",
              },
              {
                lang: "es",
                value: "Mes de inicio",
              },
              {
                lang: "pt",
                value: "Mês de início",
              },
              {
                lang: "zh",
                value: "开始月份",
              },
            ],
            type: "num",
            expression: `MONTH(@INTERACTION.${placeholderMap["@INTERACTION.START"]})`,
            order: 1,
            isDefault: true,
          },
          start: {
            name: [
              {
                lang: "",
                value: "Start Date",
              },
              {
                lang: "en",
                value: "Start Date",
              },
              {
                lang: "de",
                value: "Startdatum",
              },
              {
                lang: "fr",
                value: "Date de début",
              },
              {
                lang: "es",
                value: "Fecha de inicio",
              },
              {
                lang: "pt",
                value: "Data de início",
              },
              {
                lang: "zh",
                value: "开始日期",
              },
            ],
            type: "datetime",
            expression: `@INTERACTION.${placeholderMap["@INTERACTION.START"]}`,
            isDefault: true,
            annotations: ["interaction_start"],
          },
          end: {
            name: [
              {
                lang: "",
                value: "End Date",
              },
              {
                lang: "en",
                value: "End Date",
              },
              {
                lang: "de",
                value: "Enddatum",
              },
              {
                lang: "fr",
                value: "Date de fin",
              },
              {
                lang: "es",
                value: "Fecha de fin",
              },
              {
                lang: "pt",
                value: "Data de fim",
              },
              {
                lang: "zh",
                value: "结束日期",
              },
            ],
            type: "datetime",
            expression: `@INTERACTION.${placeholderMap["@INTERACTION.END"]}`,
            isDefault: true,
            annotations: ["interaction_end"],
          },
        },
      },
    };

}
