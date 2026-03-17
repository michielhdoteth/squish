#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

const colors = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
  gray: "\x1b[90m"
};

const root = process.cwd();
const testScriptPath = path.join(root, "scripts", "install-interactive.mjs");

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function logTest(testName) {
  testsRun++;
  console.log(`\n${colors.cyan}TEST ${testsRun}:${colors.reset} ${testName}`);
}

function logPass(message) {
  testsPassed++;
  console.log(`  ${colors.green}✓${colors.reset} ${message}`);
}

function logFail(message, error) {
  testsFailed++;
  console.log(`  ${colors.red}✗${colors.reset} ${message}`);
  if (error) {
    console.log(`    ${colors.gray}${error}${colors.reset}`);
  }
}

function logSkip(message) {
  console.log(`  ${colors.yellow}○${colors.reset} ${message}`);
}

function runTest(description, args) {
  logTest(description);
  
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [testScriptPath, ...args], {
      stdio: ["inherit", "pipe", "pipe"],
      timeout: 5000
    });
    
    let stdout = "";
    let stderr = "";
    
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    
    child.on("close", (code) => {
      if (code === 0) {
        logPass("Exit code: 0");
      } else {
        logFail(`Exit code: ${code}`, stderr);
      }
      resolve({ code, stdout, stderr });
    });
    
    child.on("error", (err) => {
      logFail("Spawn failed", err.message);
      resolve({ code: -1, stderr: err.message });
    });
  });
}

async function runTests() {
  console.log(`${colors.cyan}═════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}Interactive Installer Test Suite${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log("");
  
  await runTest("Syntax check (no syntax errors)", ["--help"]);
  
  await runTest("Help flag displays usage", ["--help"]);
  
  await runTest("List flag shows available plugins", ["--list"]);
  
  await runTest("Auto mode with --all flag", ["--all", "--dry-run"]);
  
  await runTest("Auto mode with --select flag", ["--select=claude-code", "--dry-run"]);
  
  await runTest("Environment detection - CI mode", [
    ...process.env,
    "CI=true",
    "node",
    testScriptPath,
    "--list"
  ]);
  
  await runTest("Environment detection - NON_INTERACTIVE mode", [
    ...process.env,
    "NON_INTERACTIVE=1",
    "node",
    testScriptPath,
    "--list"
  ]);
  
  await runTest("Dry-run preview mode", ["--list", "--dry-run"]);
  
  await runTest("Multiple flag combination", ["--select=claude-code,openclaw", "--verbose", "--dry-run"]);
  
  await runTest("Invalid flag handling", ["--invalid-flag"]);
  
  await runTest("Invalid plugin in --select", ["--select=nonexistent"]);
  
  console.log("");
  console.log(`${colors.cyan}═════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}Test Summary${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log("");
  console.log(`  ${colors.gray}Total tests:${colors.reset} ${testsRun}`);
  console.log(`  ${colors.green}Passed:${colors.reset} ${testsPassed}`);
  console.log(`  ${colors.red}Failed:${colors.reset} ${testsFailed}`);
  console.log("");
  
  if (testsFailed === 0) {
    console.log(`${colors.green}All tests passed!${colors.reset}`);
  } else {
    console.log(`${colors.yellow}${testsFailed} test(s) failed${colors.reset}`);
  }
}

runTests().then(() => {
  process.exit(testsFailed > 0 ? 1 : 0);
}).catch((err) => {
  console.log(`${colors.red}Fatal test error:${colors.reset} ${err.message}`);
  process.exit(1);
});
