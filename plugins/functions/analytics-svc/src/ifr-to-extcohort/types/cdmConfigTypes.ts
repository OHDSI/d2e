export type CdmConfig = {
    patient: CdmPatient;
    censor: {};
    advancedSettings: CdmAdvancedSettings;
};

export type CdmAttributeType = "time" | "datetime" | "text" | "num";

export type CdmPatient = {
    conditions: {};
    interactions: {
        [key: string]: {
            name: {
                lang: string;
                value: string;
            }[];
            disabledLangName: {
                lang: string;
                value: string;
                visible?: boolean;
            }[];
            defaultFilter?: string;
            defaultPlaceholder: string;
            order: number;
            parentInteraction: string[];
            parentInteractionLabel: string;
            attributes: {
                [key: string]: {
                    name: {
                        lang: string;
                        value: string;
                    }[];
                    disabledLangName: {
                        lang: string;
                        value: string;
                        visible?: boolean;
                    }[];
                    type: CdmAttributeType;
                    expression: string;
                    referenceFilter?: string;
                    referenceExpression?: string;
                    order: number;
                };
            };
        };
    };
    // Basic Info attributes. Interaction attributes are above
    attributes: {
        [key: string]: {
            name: {
                lang: string;
                value: string;
            }[];
            disabledLangName: {
                lang: string;
                value: string;
                visible?: boolean;
            }[];
            type: CdmAttributeType;
            expression?: string;
            order: number;
        };
    };
};

export type CdmTableMapping = {
    [key: string]: string;
};

export type CdmAdvancedSettings = {
    tableTypePlaceholderMap: {
        factTable: {
            placeholder: string;
            attributeTables: undefined[];
        };
        dimTables: {
            placeholder: string;
            attributeTables: undefined[];
            hierarchy: boolean;
            time: boolean;
            oneToN: boolean;
            condition: boolean;
        }[];
    };
    guardedTableMapping: {
        [key: string]: string;
    };
    language: string[];
    others: {};
    settings: {
        fuzziness: number;
        maxResultSize: number;
        errorDetailsReturnOn: boolean;
        errorStackTraceReturnOn: boolean;
        enableFreeText: boolean;
        vbEnabled: boolean;
        dateFormat: string;
        timeFormat: string;
        otsTableMap: {
            [key: string]: string;
        };
    };
    shared: {};
    schemaVersion: string;
    tableMapping: CdmTableMapping;
};
