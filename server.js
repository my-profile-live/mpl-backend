import "./src/config/loadEnv.js";
import dns from "node:dns";

// Public DNS is only needed for Atlas SRV lookups. Local MongoDB Community
// is a direct 127.0.0.1 connection and does not use it.
if (process.platform === "win32") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";

const PORT = process.env.PORT || 5000;

function assertRuntimeSecrets() {
  const secret = process.env.JWT_SECRET || "";
  const weak = new Set([
    "secret",
    "changeme",
    "jwt_secret",
    "your_jwt_secret",
    "password",
    "development",
  ]);
  if (secret.length < 32 || weak.has(secret.toLowerCase())) {
    console.error(
      "[server] JWT_SECRET must be a random value of at least 32 characters. Refusing to start."
    );
    process.exit(1);
  }
}

async function start() {
  assertRuntimeSecrets();
  await connectDB();
  const server = app.listen(PORT, () => {
    console.log(`[server] MPL API running on http://localhost:${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down gracefully...`);
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (err) => {
    console.error("[server] Unhandled rejection:", err);
    server.close(() => process.exit(1));
  });
}

start();
