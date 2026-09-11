from datetime import datetime, date
import random
import zlib
import os
import json

class omop_transform_utils:
    omop_tables = {
        "http://hl7.org/fhir/uv/omop/StructureDefinition/Observation": "observation",
        "http://hl7.org/fhir/uv/omop/StructureDefinition/Person": "person",
        "http://hl7.org/fhir/uv/omop/StructureDefinition/VisitOccurrence": "visit_occurrence",
        "http://hl7.org/fhir/uv/omop/StructureDefinition/ConditionOccurrence": "condition_occurrence",
        "http://hl7.org/fhir/uv/omop/StructureDefinition/DrugExposure": "drug_exposure",
        "http://hl7.org/fhir/uv/omop/StructureDefinition/Measurement": "measurement",
        "http://hl7.org/fhir/uv/omop/StructureDefinition/ProcedureOccurrence": "procedure_occurrence",
    }

    target_field_types = {
        "observation": {
            "observation_date": "date",
            "observation_datetime": "datetime",
            "observation_id": "id",
            "person_id": "referenceToId",
        },
        "person": {
            "person_id": "id",
        },
        "condition_occurrence": {
            "condition_occurrence_id": "id",
            "person_id": "referenceToId",
            "condition_start_datetime": "datetime",
            "condition_start_date": "date",
            "condition_end_date": "date",
        },
        "visit_occurrence": {
            "visit_occurrence_id": "id",
            "person_id": "referenceToId",
            "visit_end_date": "date",
            "visit_start_date": "date",
        },
        "drug_exposure":{
            "drug_exposure_id": "id",
            "person_id": "referenceToId",
            "drug_exposure_start_date": "date",
            "drug_exposure_end_date": "date",
            "quantity": "float",
            "dose_unit_source_value": "string",
            "route_source_value": "string",
            "lot_number": "string"
        },
        "measurement":{
            "measurement_id": "id",
            "person_id": "referenceToId",
            "measurement_date": "date",
            "measurement_datetime": "datetime",
            "measurement_source_value": "string",
            "value_as_number": "integer"
        },
        "procedure_occurrence":{
            "procedure_occurrence_id": "id",
            "person_id": "referenceToId",
            "procedure_date": "date",
        }
    }
    def apply_casts(target_data, field_types):
        if isinstance(target_data, list):
            return [
                omop_transform_utils.apply_casts(item, field_types) if isinstance(item, dict) else item
                for item in target_data
            ]
        if not isinstance(target_data, dict):
             return target_data
        for field, target_type in field_types.items():
            if field in target_data:
                target_data[field] = omop_transform_utils.cast_value(target_data[field], target_type)
        return target_data

    def cast_value(value, target_type):
        if value is None:
            return None
        # Handle numpy arrays by converting to list
        if hasattr(value, 'tolist'):  # Check if it's a numpy array
            value = value.tolist()
        try:
            # If value is a list/array and target_type is 'integer', parse each value to int and return the list
            if target_type == "integer":
                if isinstance(value, list):
                    return [int(float(v)) if v is not None else None for v in value]
                return int(float(value))
            elif target_type == "float":
                if isinstance(value, list):
                    return [float(v) if v is not None else None for v in value]
                return float(value)
            elif target_type == "string":
                if isinstance(value, list):
                    return [str(v) for v in value]
                return str(value)
            elif target_type == "date":
                if isinstance(value, list):
                    return [omop_transform_utils.cast_value(v, "date") for v in value]
                if isinstance(value, str):
                    # Handle partial FHIR dates: YYYY → Jan 1, YYYY-MM → 1st of month
                    date_part = value.split('T')[0].split('-')
                    if len(date_part) == 1:
                        return date(int(date_part[0]), 1, 1)
                    elif len(date_part) == 2:
                        return date(int(date_part[0]), int(date_part[1]), 1)
                    return datetime.fromisoformat(value).date()
                elif isinstance(value, datetime):
                    return value.date()
                elif isinstance(value, date):
                    return value
                return value
            elif target_type == "datetime":
                if isinstance(value, list):
                    return [omop_transform_utils.cast_value(v, "datetime") for v in value]
                if isinstance(value, str):
                    # Handle partial FHIR dates: YYYY → Jan 1, YYYY-MM → 1st of month
                    date_part = value.split('T')[0].split('-')
                    if len(date_part) == 1:
                        return datetime(int(date_part[0]), 1, 1)
                    elif len(date_part) == 2:
                        return datetime(int(date_part[0]), int(date_part[1]), 1)
                    dt = datetime.fromisoformat(value)
                    # Strip timezone to produce naive datetime (OMOP TIMESTAMP WITHOUT TIME ZONE)
                    # Keeps local time as recorded in the source rather than converting to UTC
                    return dt.replace(tzinfo=None)
                elif isinstance(value, datetime):
                    return value.replace(tzinfo=None)
                elif isinstance(value, date):
                    return datetime.combine(value, datetime.min.time())
                return value
            elif target_type == "id":
                # Do not apply any casting for "id", return the incoming data as is
                return value
            elif target_type == "referenceToId":
                # Return integer ids when possible. Extract suffix from references like 'Patient/123'
                def extract_ref(val):
                    # dict with 'reference' or 'id'
                    if isinstance(val, dict):
                        if "id" in val and isinstance(val["id"], (str, int)):
                            return extract_ref(val["id"])
                        if "reference" in val and isinstance(val["reference"], str):
                            return extract_ref(val["reference"])
                        # fallback: stringify and attempt to parse
                        sval = json.dumps(val, sort_keys=True)
                        return extract_ref(sval)
                    # string: try to extract after '/'
                    if isinstance(val, str):
                        s = val
                        if "/" in s:
                            s = s.split("/")[-1]
                        if s.isdigit():
                            return int(s)
                        return s  # Return string if not purely digits
                    if isinstance(val, int):
                        return val
                    # fallback for other types
                    return str(val)

                if isinstance(value, list):
                    return [extract_ref(v) for v in value]
                return extract_ref(value)
            else:
                return value
        except Exception as e:
            print(f"Failed to cast {value} to {target_type}: {e}")
            return value
        
    def get_omop_structure_definition_by_url(self, folder: str, incoming_url: str) -> dict:
        for fname in os.listdir(folder):
            if fname.endswith('.json'):
                file_path = os.path.join(folder, fname)
                with open(file_path, "r", encoding="utf8") as f:
                    try:
                        data = json.load(f)
                    except Exception:
                        continue
                    if data.get("url") == incoming_url:
                        return data
        return {}

    def omop_table_name(self, target_structure_definition_url: str) -> str:
        omop_table = omop_transform_utils.omop_tables[target_structure_definition_url]
        return omop_table