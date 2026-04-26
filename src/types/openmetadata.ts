/** A single column in a table */
export interface OmColumn {
  name: string;
  dataType: string;
  description?: string;
  tags?: OmTag[];
}

/** An owner of a table (person or team) */
export interface OmOwner {
  name: string;
  type: "user" | "team";
  fullyQualifiedName: string;
}

/** A tag applied to a table or column */
export interface OmTag {
  tagFQN: string;
  name?: string;
}

/** A database service (root level of the catalog hierarchy) */
export interface OmService {
  id: string;
  name: string;
  fullyQualifiedName: string;
  serviceType: string;  // e.g. "Mysql", "Snowflake", "BigQuery"
  description?: string;
  deleted?: boolean;
}

/** A database entry */
export interface OmDatabase {
  id: string;
  name: string;
  fullyQualifiedName: string;
  serviceType?: string;  // inherited from parent service, e.g. "Mysql"
  description?: string;
  deleted?: boolean;
}

/** A database schema entry */
export interface OmSchema {
  id: string;
  name: string;
  fullyQualifiedName: string;
  serviceType?: string;  // inherited from parent service, e.g. "Mysql"
  description?: string;
  deleted?: boolean;
}

/** Full table metadata returned by /tables/name/{fqn} */
export interface OmTable {
  id: string;
  name: string;
  fullyQualifiedName: string;
  description?: string;
  columns: OmColumn[];
  owners?: OmOwner[];
  tags?: OmTag[];
  tableType?: string;
}

/** Single hit inside a search response */
export interface OmSearchHit {
  _source: {
    id: string;
    name: string;
    fullyQualifiedName: string;
    description?: string;
    owners?: OmOwner[];
    tags?: OmTag[];
  };
}

/** Top-level search response from /search/query */
export interface OmSearchResponse {
  hits: {
    hits: OmSearchHit[];
    total: { value: number; relation: "eq" | "gte" };
  };
}

/** A single data quality test case (with latest result embedded via fields=testCaseResult) */
export interface OmDQResult {
  id: string;
  name: string;
  displayName?: string;        // human-readable label (e.g. "Customer Key Uniqueness")
  description?: string;
  fullyQualifiedName: string;
  entityLink: string;          // e.g. <#E::table::{fqn}::columns::{col}> or <#E::table::{fqn}>
  entityFQN?: string;          // table or column FQN the test targets
  testCaseStatus?: "Success" | "Failed" | "Aborted" | "Queued"; // top-level, mirrors testCaseResult.testCaseStatus
  testCaseResult?: {
    id?: string;
    testCaseFQN?: string;
    timestamp?: number;
    testCaseStatus: "Success" | "Failed" | "Aborted" | "Queued";
    result?: string;           // freeform failure/error description
    testResultValue?: Array<{ name: string; value?: string; predictedValue?: string }>;
    dimensionResults?: Array<{ name?: string; status?: string; result?: string }>;
    passedRows?: number;
    failedRows?: number;
  };
  deleted: boolean;
}

/** Generic paginated list response */
export interface OmListResponse<T> {
  data: T[];
  paging: { total: number; after?: string; before?: string };
}

/** A node in the lineage graph — lightweight entity reference */
export interface OmLineageNode {
  id: string;
  type: string;
  name: string;
  fullyQualifiedName: string;
  deleted?: boolean;
  href?: string;
}

/** One directed edge in the lineage graph (upstream or downstream) */
export interface OmLineageEdge {
  fromEntity: string; // UUID of the source node
  toEntity: string;   // UUID of the destination node
  lineageDetails?: {
    columnsLineage?: Array<{ fromColumns: string[]; toColumn: string; function?: string }>;
    pipeline?: OmLineageNode;
    source?: string;
    description?: string;
    sqlQuery?: string;
    createdAt?: number;
    createdBy?: string;
    updatedAt?: number;
    updatedBy?: string;
  };
}

/** Full response from GET /lineage/table/name/{fqn}?upstreamDepth=1&downstreamDepth=1 */
export interface OmLineageResponse {
  entity: OmLineageNode;
  nodes: OmLineageNode[];
  upstreamEdges: OmLineageEdge[];
  downstreamEdges: OmLineageEdge[];
}
