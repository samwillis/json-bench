# JSON Parsing Benchmark

An isomorphic benchmark comparing JSON parsing strategies in Node.js 18+ and modern browsers.

## Overview

This benchmark measures parse time for five different strategies across various payload sizes and shapes, using in-memory `Response` objects (no network overhead).

### Parsing Strategies Tested

1. **`response.json()`** - Native Response JSON parsing
2. **`JSON.parse(await response.text())`** - Manual text extraction + JSON.parse
3. **`ndjson`** (buffered) - Newline-delimited JSON, split text then parse each line
4. **`ndjson-stream`** - Streaming NDJSON using ReadableStream
5. **`comma-array`** - Comma-separated objects wrapped with brackets: `JSON.parse('[' + text.slice(0,-1) + ']')`

### Test Matrix

| Element Count | Small (~64B/elem) | Medium (~512B/elem) | Large (~4KB/elem) |
|--------------|-------------------|---------------------|-------------------|
| 1,000        | ~65 KB            | ~513 KB             | ~4 MB             |
| 10,000       | ~650 KB           | ~5.1 MB             | ~41 MB            |
| 100,000      | ~6.5 MB           | ~51 MB              | ~410 MB           |

## Results

Benchmark run on Node.js with 5 iterations per test case (plus warmup).

### Summary Table (median parse time in ms)

#### Small Elements (~64 bytes each)

| Method | 1K elems (65KB) | 10K elems (650KB) | 100K elems (6.5MB) |
|--------|-----------------|-------------------|---------------------|
| `response.json` | 0.38 | 2.07 | 25.01 |
| `json.parse(text)` | 0.30 | 2.05 | 25.48 |
| `ndjson` | 0.47 | 3.18 | 41.95 |
| `ndjson-stream` | 0.74 | 3.86 | 52.76 |
| `comma-array` | 0.36 | 2.23 | 31.07 |

#### Medium Elements (~512 bytes each)

| Method | 1K elems (513KB) | 10K elems (5.1MB) | 100K elems (51MB) |
|--------|------------------|-------------------|---------------------|
| `response.json` | 1.35 | 6.88 | 141.77 |
| `json.parse(text)` | **1.12** | **6.61** | **133.64** |
| `ndjson` | 1.50 | 7.90 | 140.99 |
| `ndjson-stream` | 2.07 | 16.12 | 214.70 |
| `comma-array` | 1.25 | 8.64 | 158.67 |

#### Large Elements (~4KB each)

| Method | 1K elems (4MB) | 10K elems (41MB) | 100K elems (410MB) |
|--------|----------------|------------------|---------------------|
| `response.json` | 7.45 | 85.90 | 1392.25 |
| `json.parse(text)` | 6.37 | 79.70 | 1353.88 |
| `ndjson` | 8.10 | 84.63 | **1305.22** |
| `ndjson-stream` | 9.59 | 136.10 | 1768.36 |
| `comma-array` | 5.86 | 99.57 | 1463.78 |

## Key Findings

### 1. `response.json()` vs `JSON.parse(text)` — Nearly Identical

These two methods perform almost identically in most cases. `JSON.parse(text)` has a slight edge (~5-10% faster) because `response.json()` likely does extra validation or processing internally.

**Recommendation:** Use whichever is more convenient; the difference is negligible.

### 2. Buffered NDJSON Wins at Scale

For very large payloads (410MB), **buffered NDJSON is the fastest method** (1305ms vs 1354ms for `JSON.parse`). This is because:
- Parsing many smaller JSON strings avoids the memory pressure of a single massive parse
- V8's JSON parser may have super-linear behavior on very large inputs
- String splitting is highly optimized

**Recommendation:** For payloads >100MB with many elements, consider NDJSON format.

### 3. Streaming NDJSON is Consistently Slowest

Despite theoretical benefits, `ndjson-stream` is **1.3-2x slower** than buffered approaches:
- Streaming overhead (async iteration, buffer management) outweighs benefits
- For in-memory data, streaming provides no I/O parallelism advantage
- The ReadableStream API adds per-chunk overhead

**Recommendation:** Only use streaming when you need to process data before it's fully loaded (e.g., real network requests with slow connections).

### 4. The "Comma-Array" Trick is Middle-of-the-Road

Wrapping comma-separated objects (`JSON.parse('[' + text.slice(0,-1) + ']')`) performs:
- Slightly better than NDJSON for small payloads
- Worse than native JSON array parsing at scale

**Recommendation:** Stick with proper JSON arrays unless you have a specific reason to use this format.

### 5. Performance Scales Roughly Linearly

Parse time scales approximately linearly with payload size:
- 10x more data ≈ 10x longer parse time
- No catastrophic degradation observed up to 410MB

## Running the Benchmark

### Prerequisites

- Node.js 18+ (for global `fetch`, `Response`, `ReadableStream`)

### Node.js

```bash
cd bench
npm install
npm run start
```

### Browser

```bash
cd bench
npm install
npm run dev
```

Then open the browser console to see results.

## Project Structure

```
bench/
  src/
    config.ts      # Test matrix configuration
    env.ts         # Cross-platform shims (timing, byte length)
    payload.ts     # Test data generation
    parsers.ts     # Five parsing strategies
    measure.ts     # Timing utilities
    runner.ts      # Benchmark orchestration
  node-main.ts     # Node.js entry point
  browser-main.ts  # Browser entry point
  index.html       # Browser test page
```

## Extending the Benchmark

To add a new parsing strategy:

1. Add method ID to `src/config.ts`
2. Implement parser in `src/parsers.ts`
3. Add payload mapping in `src/runner.ts`

To adjust test parameters, modify `ELEMENT_COUNTS`, `ELEMENT_SIZES`, or `RUNS_PER_CASE` in `src/config.ts`.

## License

MIT
