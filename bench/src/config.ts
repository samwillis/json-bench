export type ElementSizeId = 'small' | 'medium' | 'large';

export const ELEMENT_COUNTS: number[] = [
  1_000,
  10_000,
  100_000,
  // you can tweak these if needed
];

export interface ElementSizeConfig {
  id: ElementSizeId;
  targetBytes: number;
}

export const ELEMENT_SIZES: ElementSizeConfig[] = [
  { id: 'small', targetBytes: 64 },
  { id: 'medium', targetBytes: 512 },
  { id: 'large', targetBytes: 4096 },
];

export type MethodId =
  | 'response.json'
  | 'json.parse(text)'
  | 'ndjson'
  | 'ndjson-stream'
  | 'comma-array';

export const METHODS: MethodId[] = [
  'response.json',
  'json.parse(text)',
  'ndjson',
  'ndjson-stream',
  'comma-array',
];

// number of repetitions per case for averaging
export const RUNS_PER_CASE = 5;
