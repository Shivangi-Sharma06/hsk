import { vendorApp } from "./app.js";
import { readConfig } from "../../api/src/config.js";
const config = readConfig();
const { app } = vendorApp({ dataDir: config.dataDir, logger: true });
await app.listen({ port: config.vendorPort, host: "127.0.0.1" });
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void app.close();
  });
