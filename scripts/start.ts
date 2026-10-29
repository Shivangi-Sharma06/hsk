import { spawn } from "node:child_process";
import { localSecrets } from "./local.js";
import { readConfig } from "../apps/api/src/config.js";
localSecrets(readConfig().dataDir);
const children = ["apps/vendors/src/server.ts", "apps/api/src/server.ts"].map(
  (file) =>
    spawn(process.execPath, ["--import", "tsx", file], { stdio: "inherit" }),
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    stopping = true;
    for (const child of children) child.kill(signal);
  });
for (const child of children)
  child.once("exit", (code) => {
    if (stopping) return;
    stopping = true;
    for (const other of children) other.kill();
    process.exitCode = code || 1;
  });
