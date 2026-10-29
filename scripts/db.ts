import { backup } from "node:sqlite";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { readConfig } from "../apps/api/src/config.js";
import { Store } from "../apps/api/src/store.js";
const config = readConfig();
const mode = process.argv[2] ?? "migrate";
if (!["migrate", "backup"].includes(mode))
  throw new Error("Use migrate or backup");
const target = process.argv[3];
if (mode === "backup" && !target)
  throw new Error("Specify an unused backup directory");
if (target) {
  if (existsSync(target)) throw new Error("Backup target already exists");
  mkdirSync(target, { recursive: true, mode: 0o700 });
}
for (const name of ["buyer", "vendors"]) {
  const store = new Store(join(config.dataDir, `${name}.sqlite`));
  try {
    if (mode === "backup")
      await backup(store.db, join(target!, `${name}.sqlite`));
    console.log(`${name}: ${mode} complete`);
  } finally {
    store.close();
  }
}
if (mode === "backup")
  console.log(
    "Backups exclude secrets. Pause financial writes for a coordinated snapshot of both services; restore into an isolated instance before enabling any writes.",
  );
