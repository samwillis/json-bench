import type { MethodId } from './config.js';

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
