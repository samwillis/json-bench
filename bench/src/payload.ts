import { byteLength } from './env.js';
import type { ElementSizeConfig } from './config.js';

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
