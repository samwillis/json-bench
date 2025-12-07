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
