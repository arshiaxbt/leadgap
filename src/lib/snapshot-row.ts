import type { GapRow } from "./types";
/** Six significant digits keeps every published value while trimming the stored payload. */
function sig(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(6)) : value;
}

export function compactRow(row: GapRow): GapRow {
  return {
    ...row,
    oddsMove: sig(row.oddsMove),
    perpMove: sig(row.perpMove),
    signedBeta: sig(row.signedBeta),
    gap: sig(row.gap),
    expected: sig(row.expected),
    actual: sig(row.actual),
    catchup: row.catchup == null ? null : sig(row.catchup),
  };
}
