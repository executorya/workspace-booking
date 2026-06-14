import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const commands = [
  { name: "server", args: ["run", "dev", "-w", "server"] },
  { name: "client", args: ["run", "dev", "-w", "client"] }
];

const children = commands.map(({ name, args }) => {
  const child = spawn(npm, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
    }
    for (const other of children) {
      if (other !== child && !other.killed) {
        other.kill();
      }
    }
  });

  return child;
});

process.on("SIGINT", () => {
  for (const child of children) {
    child.kill("SIGINT");
  }
});
