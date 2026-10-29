import { statSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../apps/api/src/config.js";
import { Store } from "../apps/api/src/store.js";
import { localSecrets, publicVendors } from "./local.js";
const config = readConfig();
const secrets = localSecrets(config.dataDir);
const store = new Store(join(config.dataDir, "buyer.sqlite"));
try {
  console.log({
    node: process.version,
    sqlite: store.db.prepare("SELECT sqlite_version() AS version").get()
      ?.version,
    profile: config.profile,
    origin: config.origin,
    database: "ready",
    vendors: publicVendors(secrets).map((v) => ({
      id: v.id,
      signer: v.signer,
    })),
    secretPermissions: (
      statSync(join(config.dataDir, "local-secrets.json")).mode & 0o777
    ).toString(8),
    pendingJobs: store.db.prepare("SELECT count(*) AS count FROM jobs").get()
      ?.count,
    liveHsp: "disabled — payer SDK and credentials required",
    mainnet: "disabled",
  });
} finally {
  store.close();
}
