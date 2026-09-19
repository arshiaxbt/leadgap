import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { replayReport } from "../src/lib/replay";
async function main() {
  const file = process.argv[2];
  if (!file)
    throw new Error(
      "Usage: npm run research:calibrate -- artifacts/research/history-….json",
    );
  const body = await readFile(file, "utf8"),
    hash = (await readFile(`${file}.sha256`, "utf8")).trim();
  if (createHash("sha256").update(body).digest("hex") !== hash)
    throw new Error("Export checksum mismatch");
  const data = JSON.parse(body);
  if (data.schema !== 1 || !Array.isArray(data.batches))
    throw new Error("Unsupported archive");
  const report = {
    ...replayReport(data),
    inputHash: hash,
    modelVersions: Object.keys(data.mappings ?? {}),
  };
  await writeFile(
    `${file}.report.json`,
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    `${report.status}: ${report.train.positions} train / ${report.test.positions} test samples. ${file}.report.json`,
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
