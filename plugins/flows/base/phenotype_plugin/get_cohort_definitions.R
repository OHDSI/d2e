# Load required libraries
.libPaths(c(.libPaths(), "/usr/lib/R/site-library"))
library(PhenotypeLibrary)
library(CirceR)

#' Create cohort definition sets from Phenotype Library
#'
#' @param cohortsID Either "default" or comma-separated string of cohort IDs
#' @param vocabschemaName Name of the vocabulary schema
#' @param materialize Boolean indicating whether to return R object or list for Python
#' @return Cohort definition set (R dataframe if materialize=TRUE, list if FALSE)
get_cohort_definitions <- function(cohortsID, vocabschemaName, materialize = FALSE) {
    # Convert to character if needed
    cohortsID <- as.character(cohortsID)
    if (cohortsID != "default") {
        cohortsID <- as.integer(strsplit(cohortsID, ",")[[1]])
    }
    vocabschemaName <- toString(vocabschemaName)
    library('PhenotypeLibrary')
    library('CirceR')
    phenotypeLog <- PhenotypeLibrary::getPhenotypeLog(showHidden = FALSE)

    create_cohort_definitionsets <- function(cohortsID, vocabschemaName) {
        if (is.character(cohortsID) && cohortsID == 'default') {
            cohortDefinitionSets <- PhenotypeLibrary::getPlCohortDefinitionSet(phenotypeLog$cohortId[1:nrow(phenotypeLog)])
            for (i in 1:nrow(cohortDefinitionSets)) {
                cohortDefinitionSets$sql[i] <- CirceR::buildCohortQuery(cohortDefinitionSets$json[i], options = CirceR::createGenerateOptions(generateStats = TRUE, vocabularySchema = vocabschemaName))
            }
        } else if (class(cohortsID) == "integer") {
            cohortDefinitionSets <- PhenotypeLibrary::getPlCohortDefinitionSet(cohortsID)
            for (i in 1:nrow(cohortDefinitionSets)) {
                cohortDefinitionSets$sql[i] <- CirceR::buildCohortQuery(cohortDefinitionSets$json[i], options = CirceR::createGenerateOptions(generateStats = TRUE, vocabularySchema = vocabschemaName))
            }
        }

        # getPlCohortDefinitionSet returns only cohortId/cohortName/json/sql; the
        # status lives in the phenotype log, so carry it across for tagging.
        cohortDefinitionSets$status <- phenotypeLog$status[match(cohortDefinitionSets$cohortId, phenotypeLog$cohortId)]
        cohortDefinitionSets$status[is.na(cohortDefinitionSets$status) | cohortDefinitionSets$status == ""] <- "Unspecified"

        return(cohortDefinitionSets)
    }
    
    cohortDefinitionSets <- create_cohort_definitionsets(cohortsID, vocabschemaName)
    
    if (materialize) {
        return(cohortDefinitionSets)
    } else {
    # Convert to list for Python consumption
        result_list <- list()
        for(i in 1:nrow(cohortDefinitionSets)) {
            result_list[[i]] <- list(
                cohortId = cohortDefinitionSets$cohortId[i],
                cohortName = cohortDefinitionSets$cohortName[i],
                json = cohortDefinitionSets$json[i],
                sql = cohortDefinitionSets$sql[i],
                status = cohortDefinitionSets$status[i]
            )
        }
        return(result_list)
    }
}
