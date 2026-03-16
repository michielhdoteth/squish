#!/usr/bin/env node

/**
 * Secret Scanner - Checks for accidentally committed secrets
 * Run this before committing or use the pre-commit hook
 * 
 * Usage: node scripts/check-secrets.js
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

// Common secret patterns
const SECRET_PATTERNS = [
  // API Keys
  { pattern: /(sk|sg)-[0-9a-zA-Z]{24,}/gi, name: 'Stripe/General API Key' },
  { pattern: /AIza[0-9A-Za-z\\-_]{35}/gi, name: 'Google API Key' },
  { pattern: /xox[baprs]-[0-9a-zA-Z-]{10,}/gi, name: 'Slack Token' },
  { pattern: /xox[baprs]-[0-9a-zA-Z-]{10,}/gi, name: 'Slack Token' },
  { pattern: /ghp_[0-9a-zA-Z]{36}/gi, name: 'GitHub Personal Access Token' },
  { pattern: /github_pat_[0-9a-zA-Z]{22}_[0-9a-zA-Z]{59}/gi, name: 'GitHub Fine-grained Token' },
  { pattern: /Bearer\s+[A-Za-z0-9\-_]+/gi, name: 'Bearer Token' },
  { pattern: /Authorization:\s*Bearer\s+[A-Za-z0-9\-_]+/gi, name: 'Authorization Header' },
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gi, name: 'JWT Token' },
  
  // AWS
  { pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/gi, name: 'AWS Access Key' },
  { pattern: /(?:\")?aws_access_key_id(?:\\s*:\\s*\")([A-Z0-9]{20})(?:\"|$)/gi, name: 'AWS Access Key ID' },
  { pattern: /(?:\")?aws_secret_access_key(?:\\s*:\\s*\")([A-Za-z0-9/+=]{40})(?:\"|$)/gi, name: 'AWS Secret Access Key' },
  
  // Database
  { pattern: /(?:mongodb|mysql|postgres|postgresql|redis):\/\/[^\s]+:[^\s]+@/gi, name: 'Database Connection String' },
  { pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"]?[^'"]{8,}['"]?/gi, name: 'Password in config' },
  
  // .env specific
  { pattern: /^[A-Z_]+=sk-|^[A-Z_]+=AIza/gi, name: 'API Key in .env format' },
];

// File extensions to check
const TEXT_EXTENSIONS = [
  '.ts', '.js', '.json', '.md', '.txt', '.yml', '.yaml', '.toml',
  '.sh', '.bash', '.zsh', '.ini', '.cfg', '.conf', '.env', '.env.local'
];

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.some(ext => filePath.endsWith(ext)) || filePath.includes('.env');
}

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
    return output.split('\n').filter(f => f.trim());
  } catch (error) {
    console.error('Failed to get staged files:', error.message);
    return [];
  }
}

function readFileContent(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    // File may have been removed or unreadable
    return '';
  }
}

function scanContent(content, filePath) {
  const findings = [];
  
  for (const { pattern, name } of SECRET_PATTERNS) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      findings.push({
        file: filePath,
        line: lineNumber,
        type: name,
        value: maskSecret(match[0]),
      });
    }
  }
  
  return findings;
}

function maskSecret(secret) {
  if (secret.length <= 8) return '***';
  return secret.substring(0, 6) + '...' + secret.substring(secret.length - 4);
}

function main() {
  console.log('🔍 Scanning for secrets...\n');
  
  const stagedFiles = getStagedFiles();
  const textFiles = stagedFiles.filter(isTextFile);
  
  if (textFiles.length === 0) {
    console.log('No text files to scan.');
    process.exit(0);
  }
  
  let totalFindings = 0;
  
  for (const file of textFiles) {
    const content = readFileContent(file);
    if (!content) continue;
    
    const findings = scanContent(content, file);
    if (findings.length > 0) {
      console.log(`❌ ${file}:`);
      for (const finding of findings) {
        console.log(`   Line ${finding.line}: ${finding.type} - ${finding.value}`);
        totalFindings++;
      }
      console.log('');
    }
  }
  
  if (totalFindings > 0) {
    console.log(`\n🚨 Found ${totalFindings} potential secret(s).`);
    console.log('   Please remove these before committing!');
    console.log('   Use environment variables or a secret manager instead.\n');
    process.exit(1);
  } else {
    console.log('✅ No secrets detected.\n');
    process.exit(0);
  }
}

main();
