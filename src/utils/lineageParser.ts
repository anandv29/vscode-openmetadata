// Domain-specific transformer for OpenMetadata lineage API responses.
// Resolves edge UUIDs to node objects, filters deleted nodes, and groups by entity type.
// Used by both tooltipBuilder.ts and tableDetailsHtml.ts.

import type { OmLineageResponse, OmLineageNode } from "../types/openmetadata.js";

/**
 * Resolves edge UUIDs to node objects, filters deleted nodes, groups by entity type.
 * Returns upstream and downstream as Map<type, nodes[]>.
 * Tables are always first in iteration order; other types follow alphabetically.
 */
export function parseLineageNodes(
  lineage: OmLineageResponse,
): { upstream: Map<string, OmLineageNode[]>; downstream: Map<string, OmLineageNode[]> } {
  const nodeMap = new Map(lineage.nodes.map(n => [n.id, n]));

  const toGrouped = (ids: string[]): Map<string, OmLineageNode[]> => {
    const tableNodes: OmLineageNode[] = [];
    const otherGroups = new Map<string, OmLineageNode[]>();

    for (const id of ids) {
      const node = nodeMap.get(id);
      if (!node || node.deleted) { continue; }
      if (node.type === "table") {
        tableNodes.push(node);
      } else {
        const list = otherGroups.get(node.type) ?? [];
        list.push(node);
        otherGroups.set(node.type, list);
      }
    }

    // Tables first, then other types alphabetically
    const groups = new Map<string, OmLineageNode[]>();
    if (tableNodes.length > 0) { groups.set("table", tableNodes); }
    for (const key of [...otherGroups.keys()].sort()) {
      groups.set(key, otherGroups.get(key)!);
    }
    return groups;
  };

  return {
    upstream:   toGrouped(lineage.upstreamEdges.map(e => e.fromEntity)),
    downstream: toGrouped(lineage.downstreamEdges.map(e => e.toEntity)),
  };
}
