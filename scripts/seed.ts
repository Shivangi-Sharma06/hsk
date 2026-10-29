import { readConfig } from "../apps/api/src/config.js";
import { localSecrets, publicVendors } from "./local.js";
console.log(
  "Local identities ready:",
  publicVendors(localSecrets(readConfig().dataDir)).map((v) => ({
    id: v.id,
    name: v.name,
    signer: v.signer,
  })),
);
