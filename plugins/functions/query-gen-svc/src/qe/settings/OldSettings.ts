import { utils as Utils } from "@alp/alp-base-utils";

const person_id = `person_id`;
const interaction_id = `"INTERACTION_ID"`;
const condition_id = `"CONDITION_ID"`;
const parent_interact_id = `"PARENT_INTERACT_ID"`;
const start = `"START"`;
const end = `"END"`;
const observation_id = `"OBS_ID"`;

// List of all languages supported by the system for configurations
const defaultSupportedLanguages: string[] = ["en", "de", "fr"];

const defaultInterfaceViewsGuardedPholderTable = "$$SCHEMA$$.person";

// Default placeholder-to-table mapping without restricting access
// Using InterfaceViews
const defaultInterfaceViewsPholderTableMap: PholderTableMapType = {
    "@COND": "$$SCHEMA$$.condition_occurrence",
    "@COND.PATIENT_ID": person_id,
    "@COND.INTERACTION_ID": "condition_occurrence_id",
    "@COND.CONDITION_ID": "condition_occurrence_id",
    "@COND.PARENT_INTERACT_ID": "condition_occurrence_id",
    "@COND.START": "condition_start_date",
    "@COND.END": "condition_end_date",
    "@COND.INTERACTION_TYPE": "condition_type_concept_id",
    "@VISIT": "$$SCHEMA$$.visit_occurrence",
    "@VISIT.PATIENT_ID": person_id,
    "@VISIT.INTERACTION_ID": "visit_occurrence_id",
    "@VISIT.CONDITION_ID": "visit_occurrence_id",
    "@VISIT.PARENT_INTERACT_ID": "visit_occurrence_id",
    "@VISIT.START": "visit_start_date",
    "@VISIT.END": "visit_end_date",
    "@VISIT.INTERACTION_TYPE": "visit_type_concept_id",
    "@CONDERA": "$$SCHEMA$$.condition_era",
    "@CONDERA.PATIENT_ID": person_id,
    "@CONDERA.INTERACTION_ID": "condition_era_id",
    "@CONDERA.CONDITION_ID": "condition_era_id",
    "@CONDERA.PARENT_INTERACT_ID": "condition_era_id",
    "@CONDERA.START": "condition_era_start_date",
    "@CONDERA.END": "condition_era_end_date",
    "@CONDERA.INTERACTION_TYPE": "condition_concept_id",
    "@DEATH": "$$SCHEMA$$.death",
    "@DEATH.PATIENT_ID": person_id,
    "@DEATH.INTERACTION_ID": person_id,
    "@DEATH.CONDITION_ID": person_id,
    "@DEATH.PARENT_INTERACT_ID": person_id,
    "@DEATH.START": "death_date",
    "@DEATH.END": "death_date",
    "@DEATH.INTERACTION_TYPE": "death_type_concept_id",
    "@DEVEXP": "$$SCHEMA$$.device_exposure",
    "@DEVEXP.PATIENT_ID": person_id,
    "@DEVEXP.INTERACTION_ID": "device_exposure_id",
    "@DEVEXP.CONDITION_ID": "device_exposure_id",
    "@DEVEXP.PARENT_INTERACT_ID": "device_exposure_id",
    "@DEVEXP.START": "device_exposure_start_date",
    "@DEVEXP.END": "device_exposure_end_date",
    "@DEVEXP.INTERACTION_TYPE": "device_type_concept_id",
    "@DOSEERA": "$$SCHEMA$$.dose_era",
    "@DOSEERA.PATIENT_ID": person_id,
    "@DOSEERA.INTERACTION_ID": "dose_era_id",
    "@DOSEERA.CONDITION_ID": "dose_era_id",
    "@DOSEERA.PARENT_INTERACT_ID": "dose_era_id",
    "@DOSEERA.START": "dose_era_start_date",
    "@DOSEERA.END": "dose_era_end_date",
    "@DOSEERA.INTERACTION_TYPE": "drug_concept_id",
    "@DRUGERA": "$$SCHEMA$$.drug_era",
    "@DRUGERA.PATIENT_ID": person_id,
    "@DRUGERA.INTERACTION_ID": "drug_era_id",
    "@DRUGERA.CONDITION_ID": "drug_era_id",
    "@DRUGERA.PARENT_INTERACT_ID": "drug_era_id",
    "@DRUGERA.START": "drug_era_start_date",
    "@DRUGERA.END": "drug_era_end_date",
    "@DRUGERA.INTERACTION_TYPE": "drug_concept_id",
    "@DRUGEXP": "$$SCHEMA$$.drug_exposure",
    "@DRUGEXP.PATIENT_ID": person_id,
    "@DRUGEXP.INTERACTION_ID": "drug_exposure_id",
    "@DRUGEXP.CONDITION_ID": "drug_exposure_id",
    "@DRUGEXP.PARENT_INTERACT_ID": "drug_exposure_id",
    "@DRUGEXP.START": "drug_exposure_start_date",
    "@DRUGEXP.END": "drug_exposure_end_date",
    "@DRUGEXP.INTERACTION_TYPE": "drug_type_concept_id",
    "@OBS": "$$SCHEMA$$.observation",
    "@OBS.PATIENT_ID": person_id,
    "@OBS.INTERACTION_ID": "observation_id",
    "@OBS.CONDITION_ID": "observation_id",
    "@OBS.PARENT_INTERACT_ID": "observation_id",
    "@OBS.START": "observation_date",
    "@OBS.END": "observation_date",
    "@OBS.INTERACTION_TYPE": "observation_type_concept_id",
    "@OBSPER": "$$SCHEMA$$.observation_period",
    "@OBSPER.PATIENT_ID": person_id,
    "@OBSPER.INTERACTION_ID": "observation_period_id",
    "@OBSPER.CONDITION_ID": "observation_period_id",
    "@OBSPER.PARENT_INTERACT_ID": "observation_period_id",
    "@OBSPER.START": "observation_period_start_date",
    "@OBSPER.END": "observation_period_end_date",
    "@OBSPER.INTERACTION_TYPE": "period_type_concept_id",
    "@PPPER": "$$SCHEMA$$.payer_plan_period",
    "@PPPER.PATIENT_ID": person_id,
    "@PPPER.INTERACTION_ID": "payer_plan_period_id",
    "@PPPER.CONDITION_ID": "payer_plan_period_id",
    "@PPPER.PARENT_INTERACT_ID": "payer_plan_period_id",
    "@PPPER.START": "payer_plan_period_start_date",
    "@PPPER.END": "payer_plan_period_end_date",
    "@PPPER.INTERACTION_TYPE": "plan_source_value",
    "@SPEC": "$$SCHEMA$$.speciment",
    "@SPEC.PATIENT_ID": person_id,
    "@SPEC.INTERACTION_ID": "specimen_id",
    "@SPEC.CONDITION_ID": "specimen_id",
    "@SPEC.PARENT_INTERACT_ID": "specimen_id",
    "@SPEC.START": "specimen_date",
    "@SPEC.END": "specimen_date",
    "@SPEC.INTERACTION_TYPE": "specimen_type_concept_id",
    "@MEAS": "$$SCHEMA$$.measurement",
    "@MEAS.PATIENT_ID": person_id,
    "@MEAS.INTERACTION_ID": "measurement_id",
    "@MEAS.CONDITION_ID": "measurement_id",
    "@MEAS.PARENT_INTERACT_ID": "measurement_id",
    "@MEAS.START": "measurement_date",
    "@MEAS.END": "measurement_date",
    "@MEAS.INTERACTION_TYPE": "measurement_type_concept_id",
    "@PROC": "$$SCHEMA$$.procedure_occurrence",
    "@PROC.PATIENT_ID": person_id,
    "@PROC.INTERACTION_ID": "procedure_occurrence_id",
    "@PROC.CONDITION_ID": "procedure_occurrence_id",
    "@PROC.PARENT_INTERACT_ID": "procedure_occurrence_id",
    "@PROC.START": "procedure_date",
    "@PROC.END": "procedure_date",
    "@PROC.INTERACTION_TYPE": "procedure_type_concept_id",
    "@CONSENT": '$$SCHEMA$$."VIEW::GDM.CONSENT_BASE"',
    "@CONSENT.PATIENT_ID": person_id,
    "@CONSENT.INTERACTION_ID": '"ID"',
    "@CONSENT.CONDITION_ID": '"ID"',
    "@CONSENT.PARENT_INTERACT_ID": '"PARENT_CONSENT_DETAIL_ID"',
    "@CONSENT.START": '"CREATED_AT"',
    "@CONSENT.END": '"CREATED_AT"',
    "@CONSENT.INTERACTION_TYPE": '"TYPE"',
    "@RESPONSE": '$$SCHEMA$$."VIEW::GDM.QUESTIONNAIRE_RESPONSE_BASE"',
    "@RESPONSE.PATIENT_ID": person_id,
    "@RESPONSE.INTERACTION_ID": '"ID"',
    "@RESPONSE.CONDITION_ID": '"ID"',
    "@RESPONSE.PARENT_INTERACT_ID": '"ANSWER_ID"',
    "@RESPONSE.START": '"AUTHORED"',
    "@RESPONSE.END": '"AUTHORED"',
    "@RESPONSE.INTERACTION_TYPE": '"ANSWER_ID"',
    "@PTOKEN": '$$SCHEMA$$."VIEW::OMOP.PARTICIPANT_TOKEN"',
    "@PTOKEN.PATIENT_ID": person_id,
    "@PTOKEN.INTERACTION_ID": '"ID"',
    "@PTOKEN.CONDITION_ID": '"ID"',
    "@PTOKEN.PARENT_INTERACT_ID": '"ID"',
    "@PTOKEN.START": '"CREATED_DATE"',
    "@PTOKEN.END": '"CREATED_DATE"',
    "@PTOKEN.INTERACTION_TYPE": '"TOKEN"',
    "@IMG": "$$SCHEMA$$.image_occurrence",
    "@IMG.PATIENT_ID": person_id,
    "@IMG.INTERACTION_ID": "image_occurrence_id",
    "@IMG.CONDITION_ID": "image_occurrence_id",
    "@IMG.PARENT_INTERACT_ID": "image_occurrence_id",
    "@IMG.START": "image_occurrence_date",
    "@IMG.END": "image_occurrence_date",
    "@IMG.INTERACTION_TYPE": "modality_concept_id",
    "@PATIENT": "$$SCHEMA$$.person",
    "@PATIENT.PATIENT_ID": person_id,
    "@PATIENT.DOD": "death_date",
    "@PATIENT.DOB": "birth_date",
    "@REF": '$$VOCAB_SCHEMA$$."CONCEPT"',
    "@REF.VOCABULARY_ID": '"VOCABULARY_ID"',
    "@REF.CODE": '"CONCEPT_ID"',
    "@REF.TEXT": '"CONCEPT_NAME"',
    "@TEXT": '$$VOCAB_SCHEMA$$."CONCEPT"',
    "@TEXT.INTERACTION_ID": '"CONCEPT_ID"',
    "@TEXT.INTERACTION_TEXT_ID": '"CONCEPT_ID"',
    "@TEXT.VALUE": '"CONCEPT_NAME"',
};

// Using DwViews
const defaultPholderTableMap: PholderTableMapType = {
    "@COND": "$$SCHEMA$$.condition_occurrence",
    "@COND.PATIENT_ID": person_id,
    "@COND.INTERACTION_ID": "condition_occurrence_id",
    "@COND.CONDITION_ID": "condition_occurrence_id",
    "@COND.PARENT_INTERACT_ID": "condition_occurrence_id",
    "@COND.START": "condition_start_date",
    "@COND.END": "condition_end_date",
    "@COND.INTERACTION_TYPE": "condition_type_concept_id",
    "@VISIT": "$$SCHEMA$$.visit_occurrence",
    "@VISIT.PATIENT_ID": person_id,
    "@VISIT.INTERACTION_ID": "visit_occurrence_id",
    "@VISIT.CONDITION_ID": "visit_occurrence_id",
    "@VISIT.PARENT_INTERACT_ID": "visit_occurrence_id",
    "@VISIT.START": "visit_start_date",
    "@VISIT.END": "visit_end_date",
    "@VISIT.INTERACTION_TYPE": "visit_type_concept_id",
    "@CONDERA": "$$SCHEMA$$.condition_era",
    "@CONDERA.PATIENT_ID": person_id,
    "@CONDERA.INTERACTION_ID": "condition_era_id",
    "@CONDERA.CONDITION_ID": "condition_era_id",
    "@CONDERA.PARENT_INTERACT_ID": "condition_era_id",
    "@CONDERA.START": "condition_era_start_date",
    "@CONDERA.END": "condition_era_end_date",
    "@CONDERA.INTERACTION_TYPE": "condition_concept_id",
    "@DEATH": "$$SCHEMA$$.death",
    "@DEATH.PATIENT_ID": person_id,
    "@DEATH.INTERACTION_ID": person_id,
    "@DEATH.CONDITION_ID": person_id,
    "@DEATH.PARENT_INTERACT_ID": person_id,
    "@DEATH.START": "death_date",
    "@DEATH.END": "death_date",
    "@DEATH.INTERACTION_TYPE": "death_type_concept_id",
    "@DEVEXP": "$$SCHEMA$$.device_exposure",
    "@DEVEXP.PATIENT_ID": person_id,
    "@DEVEXP.INTERACTION_ID": "device_exposure_id",
    "@DEVEXP.CONDITION_ID": "device_exposure_id",
    "@DEVEXP.PARENT_INTERACT_ID": "device_exposure_id",
    "@DEVEXP.START": "device_exposure_start_date",
    "@DEVEXP.END": "device_exposure_end_date",
    "@DEVEXP.INTERACTION_TYPE": "device_type_concept_id",
    "@DOSEERA": "$$SCHEMA$$.dose_era",
    "@DOSEERA.PATIENT_ID": person_id,
    "@DOSEERA.INTERACTION_ID": "dose_era_id",
    "@DOSEERA.CONDITION_ID": "dose_era_id",
    "@DOSEERA.PARENT_INTERACT_ID": "dose_era_id",
    "@DOSEERA.START": "dose_era_start_date",
    "@DOSEERA.END": "dose_era_end_date",
    "@DOSEERA.INTERACTION_TYPE": "drug_concept_id",
    "@DRUGERA": "$$SCHEMA$$.drug_era",
    "@DRUGERA.PATIENT_ID": person_id,
    "@DRUGERA.INTERACTION_ID": "drug_era_id",
    "@DRUGERA.CONDITION_ID": "drug_era_id",
    "@DRUGERA.PARENT_INTERACT_ID": "drug_era_id",
    "@DRUGERA.START": "drug_era_start_date",
    "@DRUGERA.END": "drug_era_end_date",
    "@DRUGERA.INTERACTION_TYPE": "drug_concept_id",
    "@DRUGEXP": "$$SCHEMA$$.drug_exposure",
    "@DRUGEXP.PATIENT_ID": person_id,
    "@DRUGEXP.INTERACTION_ID": "drug_exposure_id",
    "@DRUGEXP.CONDITION_ID": "drug_exposure_id",
    "@DRUGEXP.PARENT_INTERACT_ID": "drug_exposure_id",
    "@DRUGEXP.START": "drug_exposure_start_date",
    "@DRUGEXP.END": "drug_exposure_end_date",
    "@DRUGEXP.INTERACTION_TYPE": "drug_type_concept_id",
    "@OBS": "$$SCHEMA$$.observation",
    "@OBS.PATIENT_ID": person_id,
    "@OBS.INTERACTION_ID": "observation_id",
    "@OBS.CONDITION_ID": "observation_id",
    "@OBS.PARENT_INTERACT_ID": "observation_id",
    "@OBS.START": "observation_date",
    "@OBS.END": "observation_date",
    "@OBS.INTERACTION_TYPE": "observation_type_concept_id",
    "@OBSPER": "$$SCHEMA$$.observation_period",
    "@OBSPER.PATIENT_ID": person_id,
    "@OBSPER.INTERACTION_ID": "observation_period_id",
    "@OBSPER.CONDITION_ID": "observation_period_id",
    "@OBSPER.PARENT_INTERACT_ID": "observation_period_id",
    "@OBSPER.START": "observation_period_start_date",
    "@OBSPER.END": "observation_period_end_date",
    "@OBSPER.INTERACTION_TYPE": "period_type_concept_id",
    "@PPPER": "$$SCHEMA$$.payer_plan_period",
    "@PPPER.PATIENT_ID": person_id,
    "@PPPER.INTERACTION_ID": "payer_plan_period_id",
    "@PPPER.CONDITION_ID": "payer_plan_period_id",
    "@PPPER.PARENT_INTERACT_ID": "payer_plan_period_id",
    "@PPPER.START": "payer_plan_period_start_date",
    "@PPPER.END": "payer_plan_period_end_date",
    "@PPPER.INTERACTION_TYPE": "plan_source_value",
    "@SPEC": "$$SCHEMA$$.speciment",
    "@SPEC.PATIENT_ID": person_id,
    "@SPEC.INTERACTION_ID": "specimen_id",
    "@SPEC.CONDITION_ID": "specimen_id",
    "@SPEC.PARENT_INTERACT_ID": "specimen_id",
    "@SPEC.START": "specimen_date",
    "@SPEC.END": "specimen_date",
    "@SPEC.INTERACTION_TYPE": "specimen_type_concept_id",
    "@MEAS": "$$SCHEMA$$.measurement",
    "@MEAS.PATIENT_ID": person_id,
    "@MEAS.INTERACTION_ID": "measurement_id",
    "@MEAS.CONDITION_ID": "measurement_id",
    "@MEAS.PARENT_INTERACT_ID": "measurement_id",
    "@MEAS.START": "measurement_date",
    "@MEAS.END": "measurement_date",
    "@MEAS.INTERACTION_TYPE": "measurement_type_concept_id",
    "@PROC": "$$SCHEMA$$.procedure_occurrence",
    "@PROC.PATIENT_ID": person_id,
    "@PROC.INTERACTION_ID": "procedure_occurrence_id",
    "@PROC.CONDITION_ID": "procedure_occurrence_id",
    "@PROC.PARENT_INTERACT_ID": "procedure_occurrence_id",
    "@PROC.START": "procedure_date",
    "@PROC.END": "procedure_date",
    "@PROC.INTERACTION_TYPE": "procedure_type_concept_id",
    "@CONSENT": '$$SCHEMA$$."VIEW::GDM.CONSENT_BASE"',
    "@CONSENT.PATIENT_ID": person_id,
    "@CONSENT.INTERACTION_ID": '"ID"',
    "@CONSENT.CONDITION_ID": '"ID"',
    "@CONSENT.PARENT_INTERACT_ID": '"PARENT_CONSENT_DETAIL_ID"',
    "@CONSENT.START": '"CREATED_AT"',
    "@CONSENT.END": '"CREATED_AT"',
    "@CONSENT.INTERACTION_TYPE": '"TYPE"',
    "@RESPONSE": '$$SCHEMA$$."VIEW::GDM.QUESTIONNAIRE_RESPONSE_BASE"',
    "@RESPONSE.PATIENT_ID": person_id,
    "@RESPONSE.INTERACTION_ID": '"ID"',
    "@RESPONSE.CONDITION_ID": '"ID"',
    "@RESPONSE.PARENT_INTERACT_ID": '"ANSWER_ID"',
    "@RESPONSE.START": '"AUTHORED"',
    "@RESPONSE.END": '"AUTHORED"',
    "@RESPONSE.INTERACTION_TYPE": '"ANSWER_ID"',
    "@PTOKEN": '$$SCHEMA$$."VIEW::OMOP.PARTICIPANT_TOKEN"',
    "@PTOKEN.PATIENT_ID": person_id,
    "@PTOKEN.INTERACTION_ID": '"ID"',
    "@PTOKEN.CONDITION_ID": '"ID"',
    "@PTOKEN.PARENT_INTERACT_ID": '"ID"',
    "@PTOKEN.START": '"CREATED_DATE"',
    "@PTOKEN.END": '"CREATED_DATE"',
    "@PTOKEN.INTERACTION_TYPE": '"TOKEN"',
    "@IMG": "$$SCHEMA$$.image_occurrence",
    "@IMG.PATIENT_ID": person_id,
    "@IMG.INTERACTION_ID": "image_occurrence_id",
    "@IMG.CONDITION_ID": "image_occurrence_id",
    "@IMG.PARENT_INTERACT_ID": "image_occurrence_id",
    "@IMG.START": "image_occurrence_date",
    "@IMG.END": "image_occurrence_date",
    "@IMG.INTERACTION_TYPE": "modality_concept_id",
    "@PATIENT": "$$SCHEMA$$.person",
    "@PATIENT.PATIENT_ID": person_id,
    "@PATIENT.DOD": "death_date",
    "@PATIENT.DOB": "birth_date",
    "@REF": '$$VOCAB_SCHEMA$$."CONCEPT"',
    "@REF.VOCABULARY_ID": '"VOCABULARY_ID"',
    "@REF.CODE": '"CONCEPT_ID"',
    "@REF.TEXT": '"CONCEPT_NAME"',
    "@TEXT": '$$VOCAB_SCHEMA$$."CONCEPT"',
    "@TEXT.INTERACTION_ID": '"CONCEPT_ID"',
    "@TEXT.INTERACTION_TEXT_ID": '"CONCEPT_ID"',
    "@TEXT.VALUE": '"CONCEPT_NAME"',
    "@COHORT": '$$SCHEMA$$.cohort',
    "@COHORT.PATIENT_ID": '"subject_id"',
    "@COHORT.INTERACTION_TYPE": '"cohort_definition_id"',
    "@CDM_COHORT_DEF": '$$SCHEMA$$.cohort_definition',
    "@RESULT_COHORT_DEF": '$$RESULT_SCHEMA$$.cohort_definition',
};

const defaultSettings: GlobalSettingsType = {
    // Text search fuzziness
    fuzziness: 0.7,
    maxResultSize: 5000,
    // flags controlling the information which is returned from backend
    // Note: all flags should be set to false for productive systems
    errorDetailsReturnOn: false,
    errorStackTraceReturnOn: false,
    vbEnabled: true,
    dateFormat: "YYYY-MM-dd",
    timeFormat: "HH:mm:ss",
};

const defaultGuardedPholderTable = "$$SCHEMA$$.person";

export type PholderTableMapType = object;

export type SettingsType = {
    configId: string;
    tableMapping: PholderTableMapType;
    guardedTableMapping: PholderTableMapType;
    language: String[];
    settings: GlobalSettingsType;
    shared: any;
    others: any;
    schemaVersion: any;
};

export type ValidationMessageType = {
    source: string;
    message: string;
};

export type GlobalSettingsType = {
    fuzziness: number;
    maxResultSize: number;
    // flags controlling the information which is returned from backend
    // Note: all flags should be set to false for productive systems
    errorDetailsReturnOn: boolean;
    errorStackTraceReturnOn: boolean;
    vbEnabled: boolean;
    dateFormat: string;
    timeFormat: string;
};

/*
 * In this file we collect settings for the applications.
 * At some point these type of settings may become part of the admin ui.
 *
 */
export class Settings {
    // Default placeholder-to-table mapping WITH RESTRICTED ACCESS
    protected defaultGuardedPholderTableMap: PholderTableMapType;
    protected defaultInterfaceViewsGuardedPholderTableMap: PholderTableMapType;
    protected customGuardedPholderTableMap: any;
    //private otherSettings: any;
    //private user: string;
    protected userSpecificAdavancedSettings: any;

    constructor() {
        //this.user = user;
        this.defaultGuardedPholderTableMap = Utils.cloneJson(
            defaultPholderTableMap
        );
        this.defaultGuardedPholderTableMap["@PATIENT"] =
            defaultGuardedPholderTable;
        this.defaultInterfaceViewsGuardedPholderTableMap = Utils.cloneJson(
            defaultInterfaceViewsPholderTableMap
        );
        this.defaultInterfaceViewsGuardedPholderTableMap["@PATIENT"] =
            defaultInterfaceViewsGuardedPholderTable;
        this.customGuardedPholderTableMap = {};
        //this.otherSettings = Utils.cloneJson(otherSettings);
    }

    public initAdvancedSettings(userSpecificAdavancedSettings: any) {
        this.userSpecificAdavancedSettings = userSpecificAdavancedSettings;
        return this;
    }

    /*public getUser() {
        // Tests will not initialize user, because mostly user is not used.
        // Just as a precautionary measure, If user is null then returning some fixed value for tests.
        return (this.user) ? this.user : "TEST_USER";
    }*/

    public getSettings(): GlobalSettingsType {
        if (this.userSpecificAdavancedSettings) {
            return Utils.cloneJson(this.userSpecificAdavancedSettings.settings);
        } else {
            return Utils.cloneJson(defaultSettings);
        }
    }

    public getPlaceholderMap(): PholderTableMapType {
        if (this.userSpecificAdavancedSettings) {
            return Utils.cloneJson(
                this.userSpecificAdavancedSettings.tableMapping
            );
        } else {
            // TODO: should only return default settings during tests
            // throw new Error("userSpecificAdavancedSettings was not initialized!");
            return Utils.cloneJson(defaultPholderTableMap);
        }
    }

    /*public getGuardedPlaceholderMap(): PholderTableMapType {
        let guardedPholderTableMap = Utils.extend(
            this.customGuardedPholderTableMap, this.defaultGuardedPholderTableMap);
        let placeholderMap = this.getPlaceholderMap();
        if (this.userSpecificAdavancedSettings) {
            placeholderMap["@PATIENT"] = this.userSpecificAdavancedSettings.guardedTableMapping["@PATIENT"];
        } else {
            placeholderMap["@PATIENT"] = guardedPholderTableMap["@PATIENT"];
        }
        return placeholderMap;
    }*/

    public getDefaultAdvancedSettings() {
        let returnObj: any = {};
        returnObj.configId = "";

        returnObj.tableMapping = Utils.cloneJson(defaultPholderTableMap);
        returnObj.guardedTableMapping = Utils.cloneJson(
            this.defaultGuardedPholderTableMap
        );
        returnObj.language = Utils.cloneJson(defaultSupportedLanguages);

        let settingsWithShared = this.getSettings();
        //let otherSettingsWithShared = this.getOtherSettings();

        let settings = JSON.parse(JSON.stringify(settingsWithShared));
        //let others = JSON.parse(JSON.stringify(otherSettingsWithShared));
        let shared = {};

        settings = Utils.extend(Utils.extend(settings, shared), {});
        returnObj.others = {};
        returnObj.settings = settings;
        returnObj.shared = shared;

        return returnObj;
    }
}
