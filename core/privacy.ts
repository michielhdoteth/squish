/**
 * Privacy System
 * Handles private tag filtering, secret detection, and path-based exclusions
 */

import { detectSecrets } from './secret-detector.js';

type PrivacyMode = 'strict' | 'moderate' | 'off';

const DENY_PATTERNS = [
  '.env', '.env.local', '.env.*.local',
  '*.key', '*.pem',
  'secrets.json', 'credentials.json',
  '.aws', '.ssh', 'node_modules/.env'
];

const PRIVATE_TAG_REGEX = /<(private|secret)>[\s\S]*?<\/\1>/gi;

export function hasPrivateTags(content: string): boolean {
  return PRIVATE_TAG_REGEX.test(content);
}

export function stripPrivateTags(content: string): string {
  return content.replace(/<private>[\s\S]*?<\/private>/gi, '[PRIVATE]')
                .replace(/<secret>[\s\S]*?<\/secret>/gi, '[SECRET]');
}

function isInDenyList(filePath: string): boolean {
  const normalized = filePath.toLowerCase().replace(/\\/g, '/');

  for (const pattern of DENY_PATTERNS) {
    if (normalized === pattern) return true;
    if (pattern.startsWith('*.') && normalized.endsWith(pattern.substring(1))) return true;
    if (pattern.endsWith('/*')) {
      const dir = pattern.slice(0, -2);
      if (normalized.includes(`/${dir}/`) || normalized.startsWith(`${dir}/`)) return true;
    }
    if (normalized.includes(pattern)) return true;
  }

  return false;
}

export async function shouldStore(
  content: string,
  filePath?: string,
  privacyMode: PrivacyMode = 'moderate'
): Promise<boolean> {
  if (privacyMode === 'off') return true;
  if (hasPrivateTags(content)) return false;
  if (filePath && isInDenyList(filePath)) return false;
  if (detectSecrets(content).length > 0) return false;

  return true;
}

export async function applyPrivacyFilters<T extends { content?: string; details?: Record<string, unknown> }>(
  items: T[]
): Promise<T[]> {
  const results: T[] = [];

  for (const item of items) {
    const content = item.content || JSON.stringify(item.details || '');
    if (await shouldStore(content)) {
      results.push(item);
    }
  }

  return results;
}

export function sanitizeForStorage(content: string, privacyMode: PrivacyMode): string {
  let sanitized = stripPrivateTags(content);

  if (privacyMode !== 'off') {
    const secrets = detectSecrets(sanitized);
    for (let i = secrets.length - 1; i >= 0; i--) {
      const secret = secrets[i];
      sanitized = sanitized.substring(0, secret.start) + '[REDACTED]' + sanitized.substring(secret.end);
    }

    sanitized = sanitized
      .replace(/([a-zA-Z0-9_-]*[Aa]pi[_-]?[Kk]ey|Bearer\s+[^\s]+)/g, '[API_KEY]')
      .replace(/(token|jwt|bearer)[\s=:]+[^\s,]+/gi, '[TOKEN]');
  }

  return sanitized;
}

export interface PrivacyReport {
  isPrivate: boolean;
  hasSecrets: boolean;
  secretCount: number;
  secretTypes: string[];
  shouldStore: boolean;
}

export async function analyzePrivacy(content: string, filePath?: string): Promise<PrivacyReport> {
  const secrets = detectSecrets(content);

  return {
    isPrivate: hasPrivateTags(content),
    hasSecrets: secrets.length > 0,
    secretCount: secrets.length,
    secretTypes: [...new Set(secrets.map(s => s.type))],
    shouldStore: await shouldStore(content, filePath)
  };
}
