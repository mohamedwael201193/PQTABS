import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const backend = fileURLToPath(new URL("../backend/", import.meta.url));
const child = spawn(process.execPath, ["dist/src/index/rebuild.js"], { cwd: backend, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
