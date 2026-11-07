// Decodes SpacetimeDB HTTP SQL results (SATS-JSON, https://spacetimedb.com/docs/sats-json) into plain objects
// with camelCase keys. Handles Option (some/none), plain enums, Identity, Timestamp and nested products.

type Json = unknown;
interface Element {
  name?: { some?: string; none?: unknown } | string | null;
  algebraic_type: Json;
}

export function elementName(el: Element, index: number): string {
  const n = el.name;
  if (typeof n === 'string') return n;
  if (n && typeof n === 'object' && typeof n.some === 'string') return n.some;
  return String(index);
}

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function productElements(type: Json): Element[] | null {
  if (type && typeof type === 'object') {
    const t = type as Record<string, unknown>;
    const p = (t.Product ?? (Array.isArray(t.elements) ? t : null)) as { elements?: Element[] } | null;
    if (p && Array.isArray(p.elements)) return p.elements;
  }
  return null;
}

function sumVariants(type: Json): Element[] | null {
  if (type && typeof type === 'object') {
    const s = (type as Record<string, unknown>).Sum as { variants?: Element[] } | undefined;
    if (s && Array.isArray(s.variants)) return s.variants;
  }
  return null;
}

function hexFrom(v: Json): string {
  if (typeof v === 'string') return v.replace(/^0x/i, '').toLowerCase();
  if (typeof v === 'number' || typeof v === 'bigint') return BigInt(v).toString(16);
  if (Array.isArray(v) && v.length === 1) return hexFrom(v[0]);
  return String(v);
}

export function decodeValue(type: Json, value: Json): unknown {
  const elements = productElements(type);
  if (elements) {
    if (elements.length === 1) {
      const special = elementName(elements[0]!, 0);
      const inner = Array.isArray(value) ? value[0] : value && typeof value === 'object' ? (value as Record<string, Json>)[special] : value;
      if (special === '__identity__' || special === '__connection_id__') return hexFrom(inner);
      if (special === '__timestamp_micros_since_unix_epoch__') return Math.floor(Number(inner) / 1000);
      if (special === '__time_duration_micros__') return Math.floor(Number(inner) / 1000);
    }
    const out: Record<string, unknown> = {};
    elements.forEach((el, i) => {
      const name = elementName(el, i);
      const raw = Array.isArray(value) ? value[i] : value && typeof value === 'object' ? (value as Record<string, Json>)[name] : undefined;
      out[snakeToCamel(name)] = decodeValue(el.algebraic_type, raw);
    });
    return out;
  }
  const variants = sumVariants(type);
  if (variants && value && typeof value === 'object' && !Array.isArray(value)) {
    const [tag, payload] = Object.entries(value as Record<string, Json>)[0] ?? [];
    if (tag === undefined) return null;
    const index = /^\d+$/.test(tag) ? Number(tag) : variants.findIndex((v, i) => elementName(v, i) === tag);
    const variant = variants[index];
    const name = variant ? elementName(variant, index) : tag;
    const names = variants.map((v, i) => elementName(v, i));
    if (names.length === 2 && names.includes('some') && names.includes('none')) {
      return name === 'some' ? decodeValue(variant!.algebraic_type, payload) : null;
    }
    const isUnit = (t: Json) => !!productElements(t) && productElements(t)!.length === 0;
    if (variants.every((v) => isUnit(v.algebraic_type))) return name;
    return { tag: name, value: variant ? decodeValue(variant.algebraic_type, payload) : payload };
  }
  if (type && typeof type === 'object' && 'Array' in (type as Record<string, unknown>) && Array.isArray(value)) {
    const inner = (type as Record<string, Json>).Array;
    return value.map((v) => decodeValue(inner, v));
  }
  return value;
}

export interface SqlStatementResult {
  schema: Json;
  rows: Json[];
}

export function decodeRows(result: SqlStatementResult): Record<string, unknown>[] {
  return result.rows.map((row) => decodeValue(result.schema, row) as Record<string, unknown>);
}

/** Reducer argument helpers (SATS-JSON input accepts variant names). */
export const opt = <T>(v: T | null | undefined) => (v === undefined || v === null ? { none: [] } : { some: v });
