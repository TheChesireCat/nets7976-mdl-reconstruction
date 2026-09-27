// Seeded random numbers, shared by the Martin and Newman pages so every chart is reproducible.

export function makeRng(seed) {
  let s = seed >>> 0;
  const uniform = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    let u = 0;
    while (u === 0) u = uniform();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
  const gamma = (a) => {
    // Marsaglia & Tsang; boost for a < 1
    if (a < 1) return gamma(a + 1) * Math.pow(uniform(), 1 / a);
    const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = uniform();
      if (u < 1 - 0.0331 * x ** 4) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const beta = (a, b) => { const x = gamma(a); return x / (x + gamma(b)); };
  return { uniform, normal, gamma, beta };
}
