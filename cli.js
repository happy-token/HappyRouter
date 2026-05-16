#!/usr/bin/env node
import { exec } from "child_process";
import { startServer } from "./server.js";

const PORT = process.env.PORT || 3456;

startServer(PORT).then(() => {
  const url = `http://localhost:${PORT}`;
  console.log(`  Happy App Router\n  ${url}\n`);
  exec(`open "${url}"`);
});
