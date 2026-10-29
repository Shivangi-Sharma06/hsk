import { spawn } from "node:child_process";
const commands = [
  ["node", ["--import", "tsx", "apps/vendors/src/server.ts"]],
  [
    "node",
    ["--env-file-if-exists=.env", "--import", "tsx", "apps/api/src/server.ts"],
  ],
  ["pnpm", ["--filter", "@proofbid/web", "dev"]],
] as const;
const children = commands.map(([cmd, args]) =>
  spawn(cmd, [...args], { stdio: "inherit" }),
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
