import { runBenchmarks } from './src/runner.js';

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
