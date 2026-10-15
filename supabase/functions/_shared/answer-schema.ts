import type { Evidence } from './companion.ts';

export interface AnswerFormat {
  type: 'json_schema';
  json_schema: { name: string; strict: true; schema: Record<string, unknown> };
}

const object = (properties: Record<string, unknown>) => ({ type: 'object', properties,
  required: Object.keys(properties), additionalProperties: false });
const format = (name: string, schema: Record<string, unknown>): AnswerFormat => ({ type: 'json_schema',
  json_schema: { name, strict: true, schema } });

// Schema constraints complement runtime validation; they are not factual proof.
// Only request-local IDs from already permitted evidence enter these enums.
export function writerFormat(evidence: Evidence[], maxClaims: number): AnswerFormat {
  return format('companion_draft', object({ status: { type: 'string', enum: ['answered', 'insufficient_evidence'] },
    claims: { type: 'array', maxItems: maxClaims, items: object({
      text: { type: 'string', minLength: 1, maxLength: 260, description: 'One short, self-contained fact reported by the supplied captions. Preserve uncertainty.' },
      evidenceIds: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: evidence.map(row => row.id) } },
    }) } }));
}

export function verifierFormat(evidence: Evidence[], claimCount: number): AnswerFormat {
  const lineIds = evidence.flatMap(row => row.text.split('\n').map((_, i) => `${row.id}:${i + 1}`));
  return format('companion_verdict', object({ withinBoundary: { type: 'boolean' }, sufficient: { type: 'boolean' },
    checks: { type: 'array', minItems: claimCount, maxItems: claimCount, items: object({
      index: { type: 'integer', minimum: 0, maximum: claimCount - 1 }, supported: { type: 'boolean' },
      basis: { type: 'string', enum: ['entailed', 'plausible', 'unsupported'] },
      issue: { type: 'string', enum: ['none', 'speaker', 'identity', 'action', 'timing', 'inference', 'citation', 'relevance'] },
      sources: { type: 'array', maxItems: 12, items: { type: 'string', enum: lineIds } },
    }) } }));
}
