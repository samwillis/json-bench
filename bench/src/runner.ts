import {
  ELEMENT_COUNTS,
  ELEMENT_SIZES,
  METHODS,
  RUNS_PER_CASE,
  type MethodId,
} from './config.js';
import { generateBaseData, buildPayloads } from './payload.js';
import { parsers } from './parsers.js';
import { measureMany } from './measure.js';

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
