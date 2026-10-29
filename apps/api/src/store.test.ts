import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./store.js";
it("commits events with data and rolls back on failure; persists after restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "proofbid-"));
  const path = join(dir, "state.sqlite");
  let s = new Store(path);
  try {
    s.transaction(() => {
      s.put("run", "one", "buyer", { state: "pending" });
      s.event("one", "pending");
    });
    expect(() =>
      s.transaction(() => {
        s.put("run", "one", "buyer", { state: "paid" });
        throw new Error("crash");
      }),
    ).toThrow();
    expect(s.get("run", "one")).toEqual({ state: "pending" });
    s.close();
    s = new Store(path);
    expect(s.get("run", "one")).toEqual({ state: "pending" });
    expect(s.events("one")).toHaveLength(1);
  } finally {
    s.close();
    rmSync(dir, { recursive: true });
  }
});
