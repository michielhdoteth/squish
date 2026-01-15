/**
 * Secret Detector
 * Pattern-based detection of API keys, tokens, and credentials
 */

export interface SecretMatch {
  type: string;
  pattern: string;
  value: string;
  start: number;
  end: number;
  confidence: 'high' | 'medium' | 'low';
}

type Confidence = SecretMatch['confidence'];

interface PatternConfig {
  pattern: RegExp;
  type: string;
  confidence: Confidence;
}

const HIGH_CONFIDENCE_PATTERNS: PatternConfig[] = [
  { pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/g, type: 'aws_access_key', confidence: 'high' },
  { pattern: /aws_secret_access_key\s*=\s*[^\s]+/gi, type: 'aws_secret_key', confidence: 'high' },
  { pattern: /-----BEGIN (?:RSA|OPENSSH|PRIVATE) KEY-----/g, type: 'ssh_private_key', confidence: 'high' },
  { pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g, type: 'gpg_private_key', confidence: 'high' },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/g, type: 'google_api_key', confidence: 'high' },
  { pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/g, type: 'github_token', confidence: 'high' },
  { pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9_-]{24,34}/g, type: 'slack_token', confidence: 'high' },
  { pattern: /sk_live_[0-9a-zA-Z]{20,}/g, type: 'stripe_api_key', confidence: 'high' },
  { pattern: /(mongodb|postgres|mysql|redis|cassandra):\/\/[^\s]+@[^\s]+/gi, type: 'database_url', confidence: 'high' }
];

const MEDIUM_CONFIDENCE_PATTERNS: PatternConfig[] = [
  { pattern: /(?:api[_-]?key|apikey|api_secret|secret_key)\s*[:=]\s*['""`]?[A-Za-z0-9_-]{20,}['""`]?/gi, type: 'api_key', confidence: 'medium' },
  { pattern: /bearer\s+[A-Za-z0-9._-]+/gi, type: 'bearer_token', confidence: 'medium' },
  { pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, type: 'jwt_token', confidence: 'medium' },
  { pattern: /basic\s+[A-Za-z0-9+/=]+/gi, type: 'basic_auth', confidence: 'medium' },
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['""`]?[^\s'""`]+['""`]?/gi, type: 'password', confidence: 'medium' },
  { pattern: /(?:connection_string|connstr|conn_string)\s*[:=]\s*['""`][^'""`]+['""`]/gi, type: 'connection_string', confidence: 'medium' }
];

const LOW_CONFIDENCE_PATTERNS: PatternConfig[] = [
  { pattern: /\b(?:token|auth_token|access_token|refresh_token)\b/gi, type: 'token_reference', confidence: 'low' },
  { pattern: /\b(?:secret|secret_key|api_secret|client_secret)\b/gi, type: 'secret_reference', confidence: 'low' },
  { pattern: /\b(?:credential|cred|credentials)\b/gi, type: 'credential_reference', confidence: 'low' }
];

const CONFIDENCE_LEVELS: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

function findMatches(text: string, config: PatternConfig): SecretMatch[] {
  const regex = new RegExp(config.pattern.source, config.pattern.flags);
  const matches: SecretMatch[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push({
      type: config.type,
      pattern: config.pattern.source,
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
      confidence: config.confidence
    });
  }

  return matches;
}

export function detectSecrets(text: string, minConfidence: Confidence = 'medium'): SecretMatch[] {
  const minLevel = CONFIDENCE_LEVELS[minConfidence];
  const matches: SecretMatch[] = [];

  for (const config of HIGH_CONFIDENCE_PATTERNS) {
    matches.push(...findMatches(text, config));
  }

  if (minLevel <= 2) {
    for (const config of MEDIUM_CONFIDENCE_PATTERNS) {
      matches.push(...findMatches(text, config));
    }
  }

  if (minLevel <= 1) {
    for (const config of LOW_CONFIDENCE_PATTERNS) {
      matches.push(...findMatches(text, config));
    }
  }

  return matches;
}

export function likelyContainsSecrets(text: string): boolean {
  return detectSecrets(text, 'high').length > 0;
}

export function getSecretSummary(text: string): { count: number; types: string[] } {
  const secrets = detectSecrets(text);
  return {
    count: secrets.length,
    types: [...new Set(secrets.map(s => s.type))]
  };
}

export function redactSecrets(text: string, replacement = '[REDACTED]'): string {
  const secrets = detectSecrets(text, 'high');
  let result = text;

  const sorted = [...secrets].sort((a, b) => b.start - a.start);
  for (const secret of sorted) {
    result = result.substring(0, secret.start) + replacement + result.substring(secret.end);
  }

  return result;
}

export const SECRET_PATTERNS = {
  high: HIGH_CONFIDENCE_PATTERNS,
  medium: MEDIUM_CONFIDENCE_PATTERNS,
  low: LOW_CONFIDENCE_PATTERNS
};
