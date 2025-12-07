Your task is to implement an isomorphic JSON parsing benchmark that runs in Node (18+) and modern browsers, comparing several parsing strategies over different payload sizes and shapes.

⸻

Overview

Build a small benchmark harness that:
	•	Generates synthetic JSON payloads with configurable:
	•	Number of elements in an array.
	•	Approximate size (bytes) of each element object.
	•	For each payload shape, measures parse time for five strategies:

	1.	response.json()
	2.	JSON.parse(await response.text())
	3.	NDJSON / JSON Lines from full text:
	•	const text = await response.text(); text.split("\n") → JSON.parse each line
	4.	Streaming NDJSON using the ReadableStream from response.body
	5.	Parsing a “comma-separated objects” response that’s essentially an array without [] brackets, with a trailing comma:
	•	JSON.parse('[' + text.slice(0, -1) + ']')

For each scenario, output:
	•	method
	•	numElements
	•	elementSizeId (small/medium/large)
	•	elementApproxBytes (approx bytes per element when stringified)
	•	totalBytes (payload string length in bytes)
	•	meanMs, medianMs for parse time over multiple runs

The benchmark must:
	•	Work in Node and in the browser with the same core code.
	•	Use in-memory Response objects (no network).
	•	Only differ in small entrypoints (Node vs browser).

⸻

Project structure

Create a small TypeScript project like:

/bench
  /src
    config.ts          # sizes, counts, method ids
    env.ts             # cross-env shims (now(), byteLength)
    payload.ts         # data + payload generators
    parsers.ts         # 5 parse strategies
    measure.ts         # timing utilities
    runner.ts          # orchestrates the matrix & returns results
  node-main.ts         # Node entrypoint
  browser-main.ts      # Browser entrypoint
  index.html           # Simple page to run in browser

Use ESM and keep all shared code (src/*) free of Node-only APIs so it can run in both environments. Assume Node 18+ with global fetch, Response, ReadableStream, etc.

⸻

1. Config: dimensions & methods

File: src/config.ts

Define the matrix of element counts, element sizes, and the methods to benchmark.

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


⸻

2. Cross-environment shims

We need:
	•	A now() function that uses performance.now() when available.
	•	A byteLength() function using TextEncoder where possible.

File: src/env.ts

export const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const encoder: TextEncoder | null =
  typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

export const byteLength = (s: string): number => {
  if (encoder) return encoder.encode(s).byteLength;
  // Fallback (not ideal but fine for older environments)
  return s.length;
};


⸻

3. Payload generation

We generate:
	•	A base array of JS objects with approximate targetBytes per element.
	•	Three string payload variants:
	•	JSON array: [obj,obj,...]
	•	NDJSON: obj\nobj\n... with a trailing newline
	•	Comma-array: obj,obj,..., (no brackets, trailing comma)

File: src/payload.ts

import { byteLength } from './env';
import type { ElementSizeConfig } from './config';

export interface BaseDataConfig {
  numElements: number;
  sizeConfig: ElementSizeConfig;
}

export type TestDataElement = Record<string, unknown>;

export interface BaseData {
  config: BaseDataConfig;
  elements: TestDataElement[];
  approxElementBytes: number;
}

function makeElement(targetBytes: number, index: number): { obj: TestDataElement; approxBytes: number } {
  const base = {
    id: index,
    idx: index,
    flag: index % 2 === 0,
  };

  let payload: TestDataElement = { ...base, padding: '' };
  let json = JSON.stringify(payload);
  let currentBytes = byteLength(json);

  if (currentBytes >= targetBytes) {
    return { obj: payload, approxBytes: currentBytes };
  }

  const extraNeeded = targetBytes - currentBytes;
  const paddingStr = 'x'.repeat(extraNeeded);

  payload = { ...base, padding: paddingStr };
  json = JSON.stringify(payload);
  currentBytes = byteLength(json);

  return { obj: payload, approxBytes: currentBytes };
}

export function generateBaseData(config: BaseDataConfig): BaseData {
  const elements: TestDataElement[] = [];
  let totalBytes = 0;

  for (let i = 0; i < config.numElements; i++) {
    const { obj, approxBytes } = makeElement(config.sizeConfig.targetBytes, i);
    elements.push(obj);
    totalBytes += approxBytes;
  }

  const approxElementBytes = totalBytes / config.numElements;

  return {
    config,
    elements,
    approxElementBytes,
  };
}

export interface Payloads {
  jsonArray: string;
  ndjson: string;
  commaArray: string;
  totalBytesJsonArray: number;
  totalBytesNdjson: number;
  totalBytesCommaArray: number;
}

export function buildPayloads(base: BaseData): Payloads {
  const jsonObjects = base.elements.map((el) => JSON.stringify(el));

  const jsonArray = `[${jsonObjects.join(',')}]`;
  const ndjson = jsonObjects.join('\n') + '\n';
  const commaArray = jsonObjects.join(',') + ','; // trailing comma

  return {
    jsonArray,
    ndjson,
    commaArray,
    totalBytesJsonArray: byteLength(jsonArray),
    totalBytesNdjson: byteLength(ndjson),
    totalBytesCommaArray: byteLength(commaArray),
  };
}


⸻

4. Parser implementations

Every parser receives a fresh Response per run and returns the parsed result (or at least does the parsing work).

We benchmark five methods:
	1.	response.json
	2.	json.parse(text)
	3.	ndjson (buffered)
	4.	ndjson-stream (streaming)
	5.	comma-array

File: src/parsers.ts

import type { MethodId } from './config';

export type Parser = (response: Response) => Promise<unknown>;

// Streaming NDJSON parser using Response.body
async function parseNdjsonStream(response: Response): Promise<unknown[]> {
  const body = response.body;
  if (!body) return [];

  // Modern path: TextDecoderStream
  if (typeof TextDecoderStream !== 'undefined') {
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    const result: unknown[] = [];
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      let newlineIndex: number;
      // extract complete lines
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        result.push(JSON.parse(line));
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      result.push(JSON.parse(trailing));
    }

    return result;
  }

  // Fallback path: manual streaming decode
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const result: unknown[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      result.push(JSON.parse(line));
    }
  }

  buffer += decoder.decode(); // flush
  const trailing = buffer.trim();
  if (trailing) {
    result.push(JSON.parse(trailing));
  }

  return result;
}

export const parsers: Record<MethodId, Parser> = {
  'response.json': async (response: Response) => {
    return response.json();
  },

  'json.parse(text)': async (response: Response) => {
    const text = await response.text();
    return JSON.parse(text);
  },

  'ndjson': async (response: Response) => {
    const text = await response.text();
    const lines = text.split('\n');
    const result: unknown[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      result.push(JSON.parse(trimmed));
    }
    return result;
  },

  'ndjson-stream': async (response: Response) => {
    return parseNdjsonStream(response);
  },

  'comma-array': async (response: Response) => {
    const text = await response.text();
    const trimmed = text.trimEnd();
    const withoutTrailingComma = trimmed.endsWith(',')
      ? trimmed.slice(0, -1)
      : trimmed;

    const wrapped = `[${withoutTrailingComma}]`;
    return JSON.parse(wrapped);
  },
};


⸻

5. Timing utilities

We want to run each case multiple times, with an optional warm-up, and compute mean & median.

File: src/measure.ts

import { now } from './env';

export interface TimingResult {
  durationsMs: number[];
  meanMs: number;
  medianMs: number;
}

export async function measureMany(fn: () => Promise<void>, runs: number): Promise<TimingResult> {
  const durations: number[] = [];

  // Warm-up (not measured)
  await fn();

  for (let i = 0; i < runs; i++) {
    const t0 = now();
    await fn();
    const t1 = now();
    durations.push(t1 - t0);
  }

  durations.sort((a, b) => a - b);
  const meanMs = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const medianMs = durations[Math.floor(durations.length / 2)];

  return { durationsMs: durations, meanMs, medianMs };
}


⸻

6. Benchmark runner

The runner builds the full matrix:
	•	For each combination of:
	•	numElements ∈ ELEMENT_COUNTS
	•	sizeConfig ∈ ELEMENT_SIZES
	•	method ∈ METHODS
	•	It creates base data, builds payload strings, constructs a fresh Response per run, and measures parse time.

File: src/runner.ts

import {
  ELEMENT_COUNTS,
  ELEMENT_SIZES,
  METHODS,
  RUNS_PER_CASE,
  type MethodId,
  type ElementSizeConfig,
} from './config';
import { generateBaseData, buildPayloads } from './payload';
import { parsers } from './parsers';
import { measureMany } from './measure';

export interface BenchmarkCaseResult {
  method: MethodId;
  numElements: number;
  elementSizeId: string;
  elementApproxBytes: number;
  totalBytes: number;
  meanMs: number;
  medianMs: number;
}

export async function runBenchmarks(): Promise<BenchmarkCaseResult[]> {
  const results: BenchmarkCaseResult[] = [];

  for (const numElements of ELEMENT_COUNTS) {
    for (const sizeConfig of ELEMENT_SIZES) {
      const base = generateBaseData({ numElements, sizeConfig });
      const payloads = buildPayloads(base);

      for (const method of METHODS) {
        const parser = parsers[method];

        let payload: string;
        let totalBytes: number;

        switch (method) {
          case 'response.json':
          case 'json.parse(text)':
            payload = payloads.jsonArray;
            totalBytes = payloads.totalBytesJsonArray;
            break;

          case 'ndjson':
          case 'ndjson-stream':
            payload = payloads.ndjson;
            totalBytes = payloads.totalBytesNdjson;
            break;

          case 'comma-array':
            payload = payloads.commaArray;
            totalBytes = payloads.totalBytesCommaArray;
            break;

          default:
            // exhaustive check
            const _exhaustive: never = method;
            throw new Error(`Unknown method ${_exhaustive}`);
        }

        const makeResponse = () =>
          new Response(payload, {
            headers: { 'Content-Type': 'application/json' },
          });

        const timing = await measureMany(async () => {
          const response = makeResponse();
          await parser(response);
        }, RUNS_PER_CASE);

        results.push({
          method,
          numElements,
          elementSizeId: sizeConfig.id,
          elementApproxBytes: base.approxElementBytes,
          totalBytes,
          meanMs: timing.meanMs,
          medianMs: timing.medianMs,
        });
      }
    }
  }

  return results;
}


⸻

7. Node entrypoint

File: node-main.ts

import { runBenchmarks } from './src/runner';

(async () => {
  const results = await runBenchmarks();

  console.table(
    results.map((r) => ({
      method: r.method,
      elems: r.numElements,
      size: r.elementSizeId,
      elemBytes: Math.round(r.elementApproxBytes),
      totalBytes: r.totalBytes,
      meanMs: r.meanMs.toFixed(2),
      medianMs: r.medianMs.toFixed(2),
    })),
  );

  // Also dump JSON for further offline analysis if you want
  console.log(JSON.stringify(results, null, 2));
})();

Run with whatever build / run pipeline Cursor prefers (e.g. ts-node, tsx, or compiled JS via tsc).

⸻

8. Browser entrypoint and HTML

File: browser-main.ts

import { runBenchmarks } from './src/runner';

(async () => {
  const results = await runBenchmarks();

  console.table(
    results.map((r) => ({
      method: r.method,
      elems: r.numElements,
      size: r.elementSizeId,
      elemBytes: Math.round(r.elementApproxBytes),
      totalBytes: r.totalBytes,
      meanMs: r.meanMs.toFixed(2),
      medianMs: r.medianMs.toFixed(2),
    })),
  );

  // expose results for inspection in devtools
  (window as any).jsonParseBenchResults = results;
})();

File: index.html

Minimal page; bundle browser-main.ts (via Vite/Rollup/Webpack) to a single JS file and include it:

<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>JSON Parsing Benchmark</title>
  </head>
  <body>
    <h1>JSON Parsing Benchmark</h1>
    <p>Open the console to see results.</p>
    <script type="module" src="/browser-main.ts"></script>
  </body>
</html>

(Adjust the script src path according to the bundler configuration Cursor sets up.)

⸻

9. Expected output shape

For each (method, numElements, elementSizeId) combination, you’ll get a record like:

{
  "method": "ndjson-stream",
  "numElements": 10000,
  "elementSizeId": "medium",
  "elementApproxBytes": 518.7,
  "totalBytes": 5712345,
  "meanMs": 23.51,
  "medianMs": 22.89
}

You can compare:
	•	response.json vs json.parse(text)
	•	NDJSON buffered vs NDJSON streaming
	•	NDJSON vs “comma-array” wrapping
	•	Across both Node and browser (same harness)

Implement this entire plan in TypeScript, ensure it compiles and runs in Node 18+ and in a modern browser, and keep the code clean and well-typed so it’s easy to tweak the dimension sets or add further parsing strategies later.
