/**
 * Cloud Login Module
 *
 * Replaces the broken legacy login that called removed /api/auth/login and
 * /api/auth/signup endpoints. Now uses Better Auth's session-based flow:
 *
 * 1. Email/password: POST /api/auth/sign-in/email → capture Set-Cookie →
 *    GET /api/auth/my-key with cookie → get API key.
 *
 * 2. Browser (Google OAuth): Opens browser to Better Auth social login,
 *    starts local callback server to capture the redirect, then exchanges
 *    the session cookie for an API key.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CloudAuth {
  email: string;
  apiKey: string;
  projectId: string;
  projectName: string;
  cloudUrl: string;
  loggedInAt: string;
}

interface BetterAuthSignInResponse {
  message?: string;
  user?: { id: string; email: string; name?: string };
  session?: { token: string; id: string };
}

interface MyKeyResponse {
  key: string;
  project_id: string;
  org?: { id: string; name: string; slug: string; plan: string; my_role: string; member_count: number } | null;
}

// ---------------------------------------------------------------------------
// Auth storage (shared with cloud.ts)
// ---------------------------------------------------------------------------

const AUTH_FILE = path.join(os.homedir(), '.squish', 'auth.json');

export function loadCloudAuth(): CloudAuth | null {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    }
  } catch {
    // corrupted auth file
  }
  return null;
}

export function saveCloudAuth(auth: CloudAuth): void {
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), 'utf-8');
}

export function clearCloudAuth(): void {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Extract Set-Cookie values from a fetch Response.
 * Returns a Cookie header string suitable for subsequent requests.
 */
function extractCookies(response: Response): string | null {
  // Node 18+ exposes getSetCookie() on Headers
  const setCookie = (response.headers as any).getSetCookie?.() as string[] | undefined;
  if (setCookie && setCookie.length > 0) {
    // Each Set-Cookie entry looks like "name=value; Path=/; ..."
    // We only need the "name=value" part for the Cookie header.
    return setCookie
      .map((entry) => entry.split(';')[0].trim())
      .join('; ');
  }

  // Fallback: try raw header
  const raw = response.headers.get('set-cookie');
  if (raw) {
    return raw.split(',').map((c) => c.split(';')[0].trim()).join('; ');
  }

  return null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Call Better Auth's sign-in/email endpoint.
 * Returns the response object (not cloned) so we can read Set-Cookie.
 */
async function betterAuthSignIn(
  cloudUrl: string,
  email: string,
  password: string,
): Promise<{ response: Response; body: BetterAuthSignInResponse }> {
  const url = `${cloudUrl}/api/auth/sign-in/email`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = (await response.json()) as BetterAuthSignInResponse;
  return { response, body };
}

/**
 * Call Better Auth's sign-up/email endpoint.
 */
async function betterAuthSignUp(
  cloudUrl: string,
  email: string,
  password: string,
  name?: string,
): Promise<{ response: Response; body: BetterAuthSignInResponse }> {
  const url = `${cloudUrl}/api/auth/sign-up/email`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: name || email.split('@')[0] }),
  });

  const body = (await response.json()) as BetterAuthSignInResponse;
  return { response, body };
}

/**
 * Exchange a Better Auth session cookie for an API key via the bridge endpoint.
 */
async function exchangeSessionForApiKey(
  cloudUrl: string,
  cookieHeader: string,
): Promise<MyKeyResponse> {
  const url = `${cloudUrl}/api/auth/my-key`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Cookie: cookieHeader,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  return response.json() as Promise<MyKeyResponse>;
}

// ---------------------------------------------------------------------------
// Browser OAuth flow
// ---------------------------------------------------------------------------

const CALLBACK_PORT = 9876;
const CALLBACK_HOST = 'localhost';
const REDIRECT_PATH = '/auth/callback';

/**
 * Open a URL in the user's default browser, cross-platform.
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      await execAsync(`open "${url}"`);
    } else if (platform === 'win32') {
      await execAsync(`start "" "${url}"`);
    } else {
      await execAsync(`xdg-open "${url}"`);
    }
  } catch {
    // If we can't open the browser, just print the URL
    console.log(`\n  Open this URL to log in:\n  ${url}\n`);
  }
}

/**
 * Start a local HTTP server that waits for the OAuth callback.
 * Returns a promise that resolves with the API key credentials.
 */
function startCallbackServer(cloudUrl: string): Promise<{
  apiKey: string;
  projectId: string;
  email: string;
}> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out after 3 minutes. Try again.'));
    }, 180_000);

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://${CALLBACK_HOST}:${CALLBACK_PORT}`);

      // Serve a landing page at /
      if (url.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Squish Login</title></head>
          <body style="font-family: system-ui; max-width: 480px; margin: 80px auto; text-align: center;">
            <h2>Squish Cloud Login</h2>
            <p>Waiting for authentication...</p>
            <p style="color: #666;">This window will close automatically.</p>
          </body>
          </html>
        `);
        return;
      }

      // Handle the callback from Better Auth social login
      if (url.pathname === REDIRECT_PATH && req.method === 'GET') {
        // Better Auth redirects here after Google OAuth.
        // The session cookie is set on the API domain, not localhost.
        // We need to extract cookies from the original redirect request.
        // The cookie should be forwarded by the browser if we set it correctly.
        const cookie = req.headers.cookie;

        if (!cookie) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h3>No session cookie received. Please try logging in again.</h3>');
          clearTimeout(timeout);
          server.close();
          reject(new Error('No session cookie in callback'));
          return;
        }

        try {
          const keyData = await exchangeSessionForApiKey(cloudUrl, cookie);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Squish Login - Success</title></head>
            <body style="font-family: system-ui; max-width: 480px; margin: 80px auto; text-align: center;">
              <h2>Login Successful!</h2>
              <p>You can close this window and return to the terminal.</p>
            </body>
            </html>
          `);
          clearTimeout(timeout);
          server.close();

          resolve({
            apiKey: keyData.key,
            projectId: keyData.project_id,
            email: '', // Will be filled from session
          });
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h3>Failed to exchange session: ${err.message}</h3>`);
          clearTimeout(timeout);
          server.close();
          reject(err);
        }
        return;
      }

      // 404 for everything else
      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(CALLBACK_PORT, CALLBACK_HOST);
  });
}

/**
 * Browser-based login: opens browser to Better Auth social login,
 * starts a local callback server, and exchanges the session for an API key.
 *
 * NOTE: This flow requires Google OAuth to be configured in Better Auth
 * (already done) AND the callback URL http://localhost:9876/auth/callback
 * to be in the Better Auth trustedOrigins list.
 */
export async function loginWithBrowser(cloudUrl: string): Promise<CloudAuth> {
  const callbackUrl = `http://${CALLBACK_HOST}:${CALLBACK_PORT}${REDIRECT_PATH}`;
  const authUrl = `${cloudUrl}/api/auth/sign-in/social?provider=google&callbackURL=${encodeURIComponent(callbackUrl)}`;

  console.log('\n  Opening browser for Google login...\n');
  console.log(`  If the browser doesn't open, visit:\n  ${authUrl}\n`);

  // Start callback server first, then open browser
  const credentialsPromise = startCallbackServer(cloudUrl);
  await openBrowser(authUrl);

  const creds = await credentialsPromise;

  // Try to get the user email from the session
  let email = creds.email;
  try {
    const meUrl = `${cloudUrl}/api/auth/me`;
    const meResp = await fetch(meUrl, {
      headers: { 'x-api-key': creds.apiKey },
    });
    if (meResp.ok) {
      const me = await meResp.json() as any;
      if (me.name) email = me.name;
    }
  } catch {
    // Best effort
  }

  const auth: CloudAuth = {
    email: email || 'google-user',
    apiKey: creds.apiKey,
    projectId: creds.projectId,
    projectName: email?.split('@')[0] || 'squish-user',
    cloudUrl,
    loggedInAt: new Date().toISOString(),
  };

  return auth;
}

/**
 * Email/password login via Better Auth.
 *
 * Flow:
 * 1. POST /api/auth/sign-in/email with { email, password }
 * 2. Capture Set-Cookie header from response
 * 3. GET /api/auth/my-key with cookie → API key
 * 4. If sign-in fails (user not found), try sign-up
 */
export async function loginWithEmail(
  cloudUrl: string,
  email: string,
  password: string,
): Promise<CloudAuth> {
  // --- Attempt sign-in ---
  const { response: signInResp, body: signInBody } = await betterAuthSignIn(
    cloudUrl,
    email,
    password,
  );

  // Capture session cookie from the sign-in response
  let cookieHeader = extractCookies(signInResp);

  // If sign-in failed (user doesn't exist), try sign-up
  if (!cookieHeader || !signInResp.ok) {
    const { response: signUpResp, body: signUpBody } = await betterAuthSignUp(
      cloudUrl,
      email,
      password,
    );

    cookieHeader = extractCookies(signUpResp);
    if (!cookieHeader || !signUpResp.ok) {
      const errMsg = (signUpBody as any).message || (signUpBody as any).error || `HTTP ${signUpResp.status}`;
      throw new Error(`Login failed: ${errMsg}`);
    }
  }

  // --- Exchange session cookie for API key ---
  const keyData = await exchangeSessionForApiKey(cloudUrl, cookieHeader);

  const auth: CloudAuth = {
    email,
    apiKey: keyData.key,
    projectId: keyData.project_id,
    projectName: email.split('@')[0],
    cloudUrl,
    loggedInAt: new Date().toISOString(),
  };

  // Enrich with org info if available
  if (keyData.org) {
    auth.projectName = keyData.org.name || auth.projectName;
  }

  return auth;
}
