/** Frozen into each v5 mapping archive. Changes require a model version bump. */
export const SIGNAL_POLICY = {
  version: "heuristic-v5",
  eligibility: "own-price-threshold-v1",
  timing: {
    maxMinutes: 60,
    maxLag: 5,
    minPairs: 12,
    coverage: 0.8,
    correlation: 0.4,
    margin: 0.1,
  },
  execution: {
    notional: 100,
    horizonMs: 1_800_000,
    maxAgeMs: 90_000,
    maxOddsSpread: 0.02,
    maxMarkets: 20,
    maxInstruments: 12,
    concurrency: 4,
    deadlineMs: 10_000,
  },
} as const;
