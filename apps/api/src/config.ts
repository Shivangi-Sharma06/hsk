import { resolve } from "node:path";
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  if (
    (env.PROVIDER_PROFILE ?? "local") !== "local" ||
    env.ALLOW_MAINNET === "true"
  )
    throw new Error(
      "Live HSP and mainnet are disabled: complete the integration gate first.",
    );
  const appOrigin = new URL(env.APP_ORIGIN ?? "http://localhost:5173");
  if (
    !["http:", "https:"].includes(appOrigin.protocol) ||
    appOrigin.origin !== appOrigin.href.replace(/\/$/, "")
  )
    throw new Error("APP_ORIGIN must be an HTTP origin without a path.");
  const port = (value: string | undefined, fallback: number) => {
    const n = Number(value ?? fallback);
    if (!Number.isInteger(n) || n < 1 || n > 65535)
      throw new Error("Invalid port");
    return n;
  };
  return {
    profile: "local" as const,
    origin: appOrigin.origin,
    apiPort: port(env.API_PORT, 3001),
    vendorPort: port(env.VENDOR_PORT, 3002),
    dataDir: resolve(env.DATA_DIR ?? "data"),
    secureCookies: appOrigin.protocol === "https:",
  };
}
