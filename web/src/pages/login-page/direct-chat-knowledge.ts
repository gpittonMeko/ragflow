/** Estrae gli ID knowledge collegati ai nodi Retrieval del DSL agent (canvas). */

export type KbFilterOption = { id: string; label: string };

function labelForKbId(id: string, index: number): string {
  if (!id) return `Base ${index + 1}`;
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function pushKbIds(
  ids: unknown,
  seen: Set<string>,
  out: KbFilterOption[],
): void {
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim() || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: labelForKbId(id, out.length) });
  }
}

function collectFromComponents(
  comps: Record<string, unknown>,
  seen: Set<string>,
  out: KbFilterOption[],
): void {
  for (const node of Object.values(comps)) {
    if (!node || typeof node !== 'object') continue;
    const obj = (node as { obj?: Record<string, unknown> }).obj;
    if (!obj || typeof obj !== 'object') continue;
    if (obj.component_name !== 'Retrieval') continue;
    const params = obj.params as Record<string, unknown> | undefined;
    if (!params) continue;
    pushKbIds(params.kb_ids, seen, out);
    pushKbIds(params.dataset_ids, seen, out);
    if (typeof params.kb_id === 'string' && params.kb_id.trim()) {
      pushKbIds([params.kb_id], seen, out);
    }
  }
}

/** Canvas recenti: kb su graph.nodes[].data.form oltre a dsl.components */
function collectFromGraphNodes(
  root: Record<string, unknown>,
  seen: Set<string>,
  out: KbFilterOption[],
): void {
  const graph = root.graph as { nodes?: unknown[] } | undefined;
  if (!graph?.nodes || !Array.isArray(graph.nodes)) return;
  for (const raw of graph.nodes) {
    if (!raw || typeof raw !== 'object') continue;
    const n = raw as {
      data?: { label?: string; form?: Record<string, unknown> };
    };
    if (n.data?.label !== 'Retrieval') continue;
    const form = n.data?.form;
    if (!form || typeof form !== 'object') continue;
    pushKbIds(form.kb_ids, seen, out);
    pushKbIds((form as { dataset_ids?: unknown }).dataset_ids, seen, out);
    if (typeof (form as { kb_id?: unknown }).kb_id === 'string') {
      pushKbIds([(form as { kb_id: string }).kb_id], seen, out);
    }
  }
}

export function extractRetrievalKbOptions(dsl: unknown): KbFilterOption[] {
  if (dsl == null) return [];
  let root: unknown = dsl;
  if (typeof dsl === 'string') {
    try {
      root = JSON.parse(dsl) as unknown;
    } catch {
      return [];
    }
  }
  if (!root || typeof root !== 'object') return [];
  const r = root as Record<string, unknown>;
  const seen = new Set<string>();
  const out: KbFilterOption[] = [];

  const comps = r.components;
  if (comps && typeof comps === 'object') {
    collectFromComponents(comps as Record<string, unknown>, seen, out);
  }
  collectFromGraphNodes(r, seen, out);

  return out;
}
