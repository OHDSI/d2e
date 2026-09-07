import requests
from prefect.logging import get_run_logger

from _shared_flow_utils.api.BaseAPI import BaseAPI


class PhenotypeTagAPI(BaseAPI):
    """Resolve the WebAPI tags applied to Phenotype Library cohort imports.

    Each cohort carries two: its source, and its review status. The groups holding
    them are seeded in SQL and never assigned to a cohort themselves.
    """

    # Seeded by services/atlas-db-init/230_imported_cohort_metadata_tag_group.sql.
    # Two groups because multi_selection is a property of the group: statuses are mutually exclusive, the source tag is not.
    REQUEST_TIMEOUT = (10, 30)

    SOURCE_GROUP = "Imported Cohort Metadata"
    STATUS_GROUP = "Cohort Review Status"
    PHENOTYPE_LIBRARY_TAG = "Phenotype Library"

    def __init__(self):
        super().__init__()
        # The d2e-webapi plugin exposes no /tag routes, so tag work goes straight
        # to WebAPI through the d2e-compat shim, which performs the same token
        # exchange the plugin's own calls trigger.
        self.tag_url = self.get_service_route("webapi") + "tag"
        self.headers = self.get_options()

    def _get_tags(self, dataset_id: str) -> list:
        headers = self.headers.copy()
        headers["datasetId"] = dataset_id
        response = requests.get(
            self.tag_url, headers=headers, verify=self.get_verify_value(),
            timeout=self.REQUEST_TIMEOUT
        )
        if response.status_code != 200:
            raise Exception(
                f"Failed to list tags: {response.status_code} - {response.text}"
            )
        return response.json()

    def _create_tag(self, dataset_id: str, name: str, group_id: int) -> dict:
        """Create a tag inside one of the seeded groups.

        groups must be non-empty: WebAPI 400s on an empty list and 500s if the
        field is absent, which is why groups cannot be created through the API.
        """
        headers = self.headers.copy()
        headers["datasetId"] = dataset_id
        payload = {
            "name": name,
            # The nested "groups": [] is required, not noise. TagDTOToTagConverter
            # converts each group reference recursively through itself, and that
            # second pass dereferences source.getGroups() -- a group reference
            # without the field NPEs into a 500 ConversionFailedException.
            "groups": [{"id": group_id, "groups": []}],
            "allowCustom": False,
            "showGroup": False,
            "multiSelection": False,
            "permissionProtected": False,
            "mandatory": False,
        }
        response = requests.post(
            self.tag_url,
            headers=headers,
            json=payload,
            verify=self.get_verify_value(),
            timeout=self.REQUEST_TIMEOUT,
        )
        if response.status_code not in [200, 201]:
            raise Exception(
                f"Failed to create tag '{name}': "
                f"{response.status_code} - {response.text}"
            )
        return response.json()

    def _require_group(self, by_name: dict, group_name: str) -> dict:
        """Look up a seeded tag group, failing with something actionable."""
        group = by_name.get(group_name.lower())
        if group is None:
            # Not created here: WebAPI refuses to create a tag with no parent
            # group, so a root group cannot come from the API at all.
            raise Exception(
                f"Tag group '{group_name}' does not exist in WebAPI. It cannot be "
                f"created through the API; apply "
                f"services/atlas-db-init/230_imported_cohort_metadata_tag_group.sql "
                f"(restarting the webapi-init container does this) and retry."
            )
        if not group.get("allowCustom", False):
            raise Exception(
                f"Tag group '{group_name}' (id {group['id']}) has allowCustom "
                f"disabled, so tags cannot be attached to it."
            )
        return group

    def resolve_import_tags(self, dataset_id: str, statuses) -> tuple[dict, dict]:
        """Return the provenance tag and a {status: tag} map, creating what is missing.

        Tag names are unique case-insensitively (tags_name_idx on lower(name)), so
        an existing tag is reused rather than recreated.
        """
        logger = get_run_logger()
        by_name = {tag["name"].lower(): tag for tag in self._get_tags(dataset_id)}

        source_group = self._require_group(by_name, self.SOURCE_GROUP)
        status_group = self._require_group(by_name, self.STATUS_GROUP)

        wanted = [(self.PHENOTYPE_LIBRARY_TAG, source_group)]
        wanted += [(status, status_group) for status in sorted(set(statuses))]

        for name, group in wanted:
            if name.lower() not in by_name:
                by_name[name.lower()] = self._create_tag(dataset_id, name, group["id"])
                logger.info(f"Created cohort tag '{name}' under '{group['name']}'")

        status_tags = {
            status: by_name[status.lower()] for status in sorted(set(statuses))
        }
        return by_name[self.PHENOTYPE_LIBRARY_TAG.lower()], status_tags

    def assign_tags_to_cohorts(self, dataset_id: str, tag_ids: list, cohort_ids: list) -> None:
        """Attach a set of tags to a set of cohort definitions in one request.

        Not the per-cohort POST /cohortdefinition/{id}/tag: that takes one tag id,
        so a full import costs ~2200 requests and exceeds Trex's rate limit of
        5000 per 15 minutes. WebAPI routes each pair through the same assignTag,
        so re-assigning stays a no-op and the single-selection swap still applies.
        """
        if not tag_ids or not cohort_ids:
            return
        headers = self.headers.copy()
        headers["datasetId"] = dataset_id
        payload = {
            "tags": list(tag_ids),
            "assets": {"cohorts": list(cohort_ids)},
        }
        response = requests.post(
            f"{self.tag_url}/multiAssign",
            headers=headers,
            json=payload,
            verify=self.get_verify_value(),
            timeout=self.REQUEST_TIMEOUT,
        )
        if response.status_code not in [200, 201, 204]:
            raise Exception(
                f"Failed to assign tags {list(tag_ids)} to {len(cohort_ids)} cohort "
                f"definitions: {response.status_code} - {response.text}"
            )
