#!/usr/bin/env node

// Squish v0.2.7 - npx installer for Claude Code Plugin
// Usage: npx squish-install

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import os from 'os';

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function detectPlatform() {
  const platform = os.platform();
  const arch = os.arch();

  switch (platform) {
    case 'linux':
      return { platform: 'linux', arch: arch === 'x64' ? 'x64' : 'arm64' };
    case 'darwin':
      return { platform: 'macos', arch: 'arm64' }; // Assume Apple Silicon for now
    case 'win32':
      return { platform: 'windows', arch: arch === 'x64' ? 'x64' : 'arm64' };
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function installSquish() {
  log(colors.blue, '🐙 Installing Squish Memory v0.2.7...');

  const { platform, arch } = detectPlatform();
  const version = '0.2.7';
  const baseUrl = `https://github.com/michielhdoteth/squish/releases/download/v${version}`;

  let filename, extractCmd;
  if (platform === 'windows') {
    filename = `squish-v${version}-windows-${arch}.zip`;
    extractCmd = `powershell -Command "Expand-Archive -Path '${filename}' -DestinationPath '.' -Force"`;
  } else {
    filename = `squish-v${version}-${platform}-${arch}.tar.gz`;
    extractCmd = `tar -xzf ${filename}`;
  }

  const downloadUrl = `${baseUrl}/${filename}`;

  // Create temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squish-install-'));
  const cwd = process.cwd();
  process.chdir(tmpDir);

  try {
    log(colors.blue, `Downloading Squish for ${platform}-${arch}...`);
    await downloadFile(downloadUrl, filename);

    log(colors.blue, 'Extracting...');
    execSync(extractCmd, { stdio: 'inherit' });

    // Install to ~/.squish
    const installDir = path.join(os.homedir(), '.squish');
    fs.mkdirSync(installDir, { recursive: true });

    // Copy files
    const sourceDir = path.join(tmpDir, 'squish');
    if (fs.existsSync(sourceDir)) {
      copyDirRecursive(sourceDir, installDir);
    } else {
      // Files might be in root
      fs.readdirSync(tmpDir)
        .filter(file => file !== filename && file !== 'squish')
        .forEach(file => {
          const src = path.join(tmpDir, file);
          const dest = path.join(installDir, file);
          if (fs.statSync(src).isDirectory()) {
            copyDirRecursive(src, dest);
          } else {
            fs.copyFileSync(src, dest);
          }
        });
    }

    // Make executable
    const binPath = path.join(installDir, 'bin', platform === 'windows' ? 'squish.exe' : 'squish');
    if (fs.existsSync(binPath)) {
      fs.chmodSync(binPath, '755');
    }

    log(colors.green, `✓ Installed to: ${installDir}`);

  } finally {
    process.chdir(cwd);
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function setupClaude() {
  log(colors.blue, 'Configuring Claude Code...');

  const claudeConfigDir = path.join(os.homedir(), '.claude');
  const claudeConfigPath = path.join(claudeConfigDir, 'settings.json');

  fs.mkdirSync(claudeConfigDir, { recursive: true });

  // Backup existing config
  if (fs.existsSync(claudeConfigPath)) {
    const backupPath = `${claudeConfigPath}.backup.${Date.now()}`;
    fs.copyFileSync(claudeConfigPath, backupPath);
  }

  const installDir = path.join(os.homedir(), '.squish');
  const binPath = path.join(installDir, 'bin', os.platform() === 'win32' ? 'squish.exe' : 'squish');

  let config;
  try {
    config = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
  } catch (e) {
    config = {};
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  config.mcpServers.squish = {
    command: 'node',
    args: [binPath]
  };

  fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));

  log(colors.green, '✓ Claude Code configured');
}

async function main() {
  try {
    await installSquish();
    setupClaude();

    console.log('');
    log(colors.green, '🎉 Squish v0.2.7 installed successfully!');
    console.log('');
    log(colors.blue, 'Next steps:');
    console.log('  1. Restart Claude Code');
    console.log('  2. Visit http://localhost:37777 for web UI');
    console.log('');
    log(colors.blue, 'Documentation: https://github.com/michielhdoteth/squish');

  } catch (error) {
    log(colors.red, `❌ Installation failed: ${error.message}`);
    process.exit(1);
  }
}

main();