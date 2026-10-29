import { spawn } from "node:child_process";
import { localSecrets } from "./local.js";
import { readConfig } from "../apps/api/src/config.js";
localSecrets(readConfig().dataDir);
const children = ["apps/vendors/src/server.ts", "apps/api/src/server.ts"].map(
  (file) =>
    spawn(
      process.execPath,
      ["--env-file-if-exists=.env", "--import", "tsx", file],
      { stdio: "inherit" },
    ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    for (const child of children) child.kill(signal);
  });
for (const child of children)
  child.once("exit", (code) => {
    for (const other of children) other.kill();
    process.exitCode = code ?? 1;
  });
