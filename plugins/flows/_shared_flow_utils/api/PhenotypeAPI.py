import requests
import time
import json
from prefect.logging import get_run_logger

from _shared_flow_utils.api.BaseAPI import BaseAPI
class PhenotypeAPI(BaseAPI):
    def __init__(self):
        super().__init__()
        self.url = self.get_service_route("d2e-webapi")  
        self.cohort_definition_url = self.url + 'cohortdefinition'
        self.headers = self.get_options()

    def get_cohort_name_index(self, dataset_id: str) -> dict:
        headers = self.headers.copy()
        headers["datasetId"] = dataset_id

        response = requests.get(
            self.cohort_definition_url,
            headers=headers,
            verify=self.get_verify_value()
        )

        if response.status_code != 200:
            raise Exception(
                f"Failed to list cohort definitions: "
                f"{response.status_code} - {response.text}"
            )

        return {
            cohort["name"]: cohort["id"]
            for cohort in response.json()
            if cohort.get("name") is not None
        }
        
    def create_single_cohort_definition(self, cohort_def: dict, dataset_id: str, user_name: str,
                                        name_index: dict):
        logger = get_run_logger()
        current_time = int(time.time() * 1000)
        headers = self.headers.copy()
        headers["datasetId"] = dataset_id
        
        # Parse the JSON expression
        expression = json.loads(cohort_def['json'])
        name = f"{cohort_def['cohortId']}_{cohort_def['cohortName']}"
        payload = {
            "id": 0,
            "name": name,
            "description": f"Phenotype Library cohort: {cohort_def['cohortName']}",
            "expressionType": "SIMPLE_EXPRESSION",
            "expression": expression,
            "createdBy": user_name,
            "createdDate": current_time,
            "modifiedBy": user_name,
            "modifiedDate": current_time,
            "tags": [],
        }
        # datasetId travels in the header, not the body.

        existing_id = name_index.get(name)
        verb = "Updating" if existing_id else "Creating"
        logger.info(f"{verb} cohort: {cohort_def['cohortName']} (ID: {cohort_def['cohortId']})")

        if existing_id:
            response = requests.put(
                f"{self.cohort_definition_url}/{existing_id}",
                headers=headers,
                json=payload,
                verify=self.get_verify_value()
            )

        else:
            response = requests.post(
                self.cohort_definition_url,
                headers=headers,
                json=payload,
                verify=self.get_verify_value()
            )
        
        if response.status_code in [200, 201]:
            result = response.json()
            name_index[name] = result["id"]
            logger.info(
                f"{'Updated' if existing_id else 'Created'} WebAPI cohort definition "
                f"{result["id"]} for phenotype cohort {cohort_def['cohortId']}"
            )
            return result
        else:
            error_msg = (
                f"Failed to {'update' if existing_id else 'create'} cohort "
                f"{cohort_def['cohortId']}: {response.status_code} - {response.text}"
            )
            logger.error(error_msg)
            raise Exception(error_msg)
