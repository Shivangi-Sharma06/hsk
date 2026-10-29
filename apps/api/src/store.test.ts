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
it("restores a consistent SQLite backup and rejects unknown schema versions", async () => {
  const { backup, DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(join(tmpdir(), "proofbid-backup-"));
  const source = new Store(join(dir, "source.sqlite"));
  try {
    source.put("run", "pending", "buyer", { state: "SUBMISSION_UNKNOWN" });
    await backup(source.db, join(dir, "restore.sqlite"));
    const restored = new Store(join(dir, "restore.sqlite"));
    try {
      expect(restored.get("run", "pending")).toEqual({
        state: "SUBMISSION_UNKNOWN",
      });
    } finally {
      restored.close();
    }
    const futurePath = join(dir, "future.sqlite");
    const future = new DatabaseSync(futurePath);
    future.exec("PRAGMA user_version=99");
    future.close();
    expect(() => new Store(futurePath)).toThrow(/schema version/);
  } finally {
    source.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("bounds history in SQL and isolates owners before applying the limit", () => {
  const store = new Store(":memory:");
  try {
    for (let i = 0; i < 80; i++)
      store.put("run", String(i), i % 2 ? "alice" : "bob", { id: i });
    expect(store.list<{ id: number }>("run", "alice", 3)).toEqual([
      { id: 79 },
      { id: 77 },
      { id: 75 },
    ]);
    expect(store.list("run", "alice", 0)).toEqual([]);
    expect(store.list("run", "nobody", 50)).toEqual([]);
    expect(() => store.list("run", "alice", -2)).toThrow();
  } finally {
    store.close();
  }
});
