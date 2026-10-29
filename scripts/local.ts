import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  linkSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import type { Vendor } from "../packages/domain/src/index.js";
export type Secrets = {
  peerToken: string;
  vendors: Array<Vendor & { privateKey: Hex }>;
};
export function localSecrets(dir: string): Secrets {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "local-secrets.json");
  if (existsSync(path))
    return JSON.parse(readFileSync(path, "utf8")) as Secrets;
  const names = ["Atlas", "Boreal", "Cipher"];
  const secrets: Secrets = {
    peerToken: randomBytes(32).toString("hex"),
    vendors: ["a", "b", "c"].map((id, i) => {
      const privateKey = generatePrivateKey();
      const signer = privateKeyToAccount(privateKey).address;
      return {
        id,
        name: names[i]!,
        privateKey,
        signer,
        payee: signer,
        amountBaseUnits: ["800000", "1000000", "600000"][i]!,
        deliverySeconds: [20, 10, 25][i]!,
      };
    }),
  };
  const temp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temp, JSON.stringify(secrets, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  try {
    linkSync(temp, path);
    return secrets;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return JSON.parse(readFileSync(path, "utf8")) as Secrets;
  } finally {
    unlinkSync(temp);
  }
}
export const publicVendors = (s: Secrets): Vendor[] =>
  s.vendors.map(({ privateKey: _privateKey, ...vendor }) => vendor);
