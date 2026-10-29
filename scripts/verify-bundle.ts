import { readFileSync, statSync } from "node:fs";
import { verifyBundle } from "../packages/domain/src/proof.js";
const args = process.argv.slice(2).filter((a) => a !== "--");
const file = args.find((a) => !a.startsWith("--"));
if (!file)
  throw new Error(
    "Usage: pnpm verify:bundle <proof.json> [--trusted-vendor=0x...]",
  );
if (statSync(file).size > 2 * 1024 * 1024)
  throw new Error("Proof bundle exceeds 2 MiB");
const trusted = args
  .find((a) => a.startsWith("--trusted-vendor="))
  ?.split("=")[1];
console.log(
  await verifyBundle(JSON.parse(readFileSync(file, "utf8")), trusted),
);
