import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const rootDir = process.cwd();
const serviceDir = path.join(rootDir, ".service");
const pidFile = path.join(serviceDir, "cyberpulse.pid");
const logFile = path.join(serviceDir, "cyberpulse.log");

function ensureServiceDir() {
  fs.mkdirSync(serviceDir, { recursive: true });
}

function readPid() {
  if (!fs.existsSync(pidFile)) return null;
  const value = fs.readFileSync(pidFile, "utf8").trim();
  const pid = Number(value);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writePid(pid) {
  ensureServiceDir();
  fs.writeFileSync(pidFile, `${pid}\n`, "utf8");
}

function clearPid() {
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startService() {
  const existingPid = readPid();
  if (isRunning(existingPid)) {
    console.log(`CyberPulse is already running (PID ${existingPid}).`);
    return;
  }

  ensureServiceDir();
  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: rootDir,
    detached: true,
    stdio: ["ignore", out, err]
  });

  child.unref();
  writePid(child.pid);
  console.log(`CyberPulse started (PID ${child.pid}).`);
  console.log(`Log file: ${logFile}`);
}

async function stopService() {
  const pid = readPid();
  if (!pid || !isRunning(pid)) {
    clearPid();
    console.log("CyberPulse is not running.");
    return;
  }

  process.kill(pid, "SIGTERM");

  for (let i = 0; i < 20; i += 1) {
    if (!isRunning(pid)) {
      clearPid();
      console.log(`CyberPulse stopped (PID ${pid}).`);
      return;
    }
    await wait(150);
  }

  process.kill(pid, "SIGKILL");
  clearPid();
  console.log(`CyberPulse force-stopped (PID ${pid}).`);
}

function serviceStatus() {
  const pid = readPid();
  if (isRunning(pid)) {
    console.log(`CyberPulse is running (PID ${pid}).`);
    console.log(`Log file: ${logFile}`);
    return;
  }

  clearPid();
  console.log("CyberPulse is stopped.");
}

async function restartService() {
  await stopService();
  await startService();
}

const command = process.argv[2] || "status";

if (command === "start") {
  await startService();
} else if (command === "stop") {
  await stopService();
} else if (command === "restart") {
  await restartService();
} else if (command === "status") {
  serviceStatus();
} else {
  console.error(`Unknown command: ${command}`);
  console.error("Use one of: start | stop | restart | status");
  process.exit(1);
}
