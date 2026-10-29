import { createApp } from "./app.js";
import { readConfig } from "./config.js";
const app = createApp({ logger: true });
await app.listen({ port: readConfig().apiPort, host: "127.0.0.1" });
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void app.close();
  });
