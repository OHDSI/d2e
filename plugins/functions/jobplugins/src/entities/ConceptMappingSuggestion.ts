import { Column, Entity, Index, PrimaryColumn, Unique } from "typeorm";

import { Audit } from "./audit.ts";

@Entity({ name: "concept_mapping_suggestion" })
@Index(["dataflowId", "nodeId"])
@Unique(["dataflowId", "nodeId", "sourceRowId", "targetConceptId"])
export class ConceptMappingSuggestion extends Audit {
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ name: "dataflow_id" })
  dataflowId: string;

  @Column({ name: "node_id" })
  nodeId: string;

  @Column({ name: "source_row_id" })
  sourceRowId: string;

  @Column({ name: "target_concept_id", type: "int" })
  targetConceptId: number;

  @Column({ name: "concept_name", nullable: true })
  conceptName: string;

  @Column({ name: "concept_code", nullable: true })
  conceptCode: string;

  @Column({ name: "domain_id", nullable: true })
  domainId: string;

  @Column({ name: "vocabulary_id", nullable: true })
  vocabularyId: string;

  @Column({ name: "suggested_by" })
  suggestedBy: string;

  // Display name for the "Checked by" column. Captured at write time (from the caller's
  // resolved username) rather than looked up on read, so the table shows who acted even if
  // the account is later renamed or removed. Nullable: suggestions created before this
  // column existed have no name, and the UI renders a dash for those.
  @Column({ name: "suggested_by_name", nullable: true })
  suggestedByName: string;

  // Set when a suggestion is approved and cleared when it is unapproved, so an approved row
  // shows its approver rather than its original suggester.
  @Column({ name: "approved_by_name", nullable: true })
  approvedByName: string;

  @Column({ name: "is_approved", type: "boolean", default: false })
  isApproved: boolean;
}
