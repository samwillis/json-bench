import { now } from './env.js';

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
