#!/usr/bin/env python3
"""
Fix multi-tenancy gaps in squish-api:
1. authorize-complete: pass org_id to generateAuthorizationCode
2. mcp-oauth.js: store org_id in auth code, use it for company project resolution
3. mcp-oauth.js: include org_id in JWT token
4. mcp.js: resolve org_id from token and pass to API calls
5. memies/search: add org_id filtering for data isolation
"""

import re
import sys

FILES = {
    'mcp_oauth': '/var/www/squish-api/lib/mcp-oauth.js',
    'mcp_routes': '/var/www/squish-api/routes/mcp.js',
    'memories': '/var/www/squish-api/routes/memories.js',
    'search': '/var/www/squish-api/routes/search.js',
}

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)
    print(f"  ✅ Updated {path}")

# ============================================================
# FIX 1: authorize-complete - pass org_id to generateAuthorizationCode
# ============================================================
def fix_authorize_complete(content):
    """In /mcp/authorize-complete, pass org_id to generateAuthorizationCode"""
    
    old = """      // Generate auth code with user's email as userId and mode
      const code = oauth.generateAuthorizationCode(
        client_id,
        user_email,
        code_challenge,
        code_challenge_method,
        (scope || '').split(' ').filter(Boolean),
        validMode
      );"""
    
    new = """      // Extract org_id from request body (for company mode)
      const org_id = req.body.org_id || null;

      // Generate auth code with user's email as userId, mode, and org_id
      const code = oauth.generateAuthorizationCode(
        client_id,
        user_email,
        code_challenge,
        code_challenge_method,
        (scope || '').split(' ').filter(Boolean),
        validMode,
        org_id
      );"""
    
    if old in content:
        content = content.replace(old, new)
        print("  ✅ Fix 1: authorize-complete now passes org_id")
    else:
        print("  ⚠️  Fix 1: Could not find authorize-complete pattern")
    return content

# ============================================================
# FIX 2: generateAuthorizationCode - accept and store org_id
# ============================================================
def fix_generate_auth_code(content):
    """Store org_id in the auth code"""
    
    old = "export function generateAuthorizationCode(clientId, userId, codeChallenge, codeChallengeMethod, scopes, mode = 'personal') {"
    new = "export function generateAuthorizationCode(clientId, userId, codeChallenge, codeChallengeMethod, scopes, mode = 'personal', orgId = null) {"
    
    if old in content:
        content = content.replace(old, new)
        print("  ✅ Fix 2a: generateAuthorizationCode accepts orgId param")
    else:
        print("  ⚠️  Fix 2a: Could not find generateAuthorizationCode signature")
    
    old = """    mode: mode, // 'personal' or 'company'
    expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes"""
    
    new = """    mode: mode, // 'personal' or 'company'
    org_id: orgId, // specific org for company mode
    expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes"""
    
    if old in content:
        content = content.replace(old, new)
        print("  ✅ Fix 2b: auth code now stores org_id")
    else:
        print("  ⚠️  Fix 2b: Could not find auth code storage pattern")
    
    return content

# ============================================================
# FIX 3: exchangeAuthorizationCode - use specific org_id for company mode
# ============================================================
def fix_exchange_auth_code(content):
    """Use the specific org_id from auth code when resolving company project"""
    
    old = """  const mode = authCode.mode || 'personal';

  try {
    if (mode === 'company') {
      // Find the company project for this user's org(s)
      const companyResult = await pool.query(
        `SELECT p.id FROM projects p
         INNER JOIN organizations o ON o.id = p.org_id
         INNER JOIN org_members om ON om.org_id = o.id
         INNER JOIN users u ON u.id = om.user_id
         WHERE u.email = $1 AND om.role IN ('owner', 'admin')
         LIMIT 1`,
        [authCode.user_id]
      );"""
    
    new = """  const mode = authCode.mode || 'personal';
  const orgId = authCode.org_id || null;

  try {
    if (mode === 'company') {
      // Find the company project - use specific org_id if provided
      let companyResult;
      if (orgId) {
        // Specific org selected during MCP login
        companyResult = await pool.query(
          `SELECT p.id FROM projects p
           WHERE p.org_id = $1 LIMIT 1`,
          [orgId]
        );
      } else {
        // Fallback: find first company project for this user
        companyResult = await pool.query(
          `SELECT p.id FROM projects p
           INNER JOIN organizations o ON o.id = p.org_id
           INNER JOIN org_members om ON om.org_id = o.id
           INNER JOIN users u ON u.id = om.user_id
           WHERE u.email = $1 AND om.role IN ('owner', 'admin')
           LIMIT 1`,
          [authCode.user_id]
        );
      }"""
    
    if old in content:
        content = content.replace(old, new)
        print("  ✅ Fix 3: exchangeAuthorizationCode uses specific org_id")
    else:
        print("  ⚠️  Fix 3: Could not find exchangeAuthorizationCode company pattern")
    
    return content

# ============================================================
# FIX 4: JWT token - include org_id
# ============================================================
def fix_jwt_token(content):
    """Add org_id to the JWT access token payload"""
    
    # Find the JWT creation in exchangeAuthorizationCode
    old = """  // Generate JWT access token
  const accessToken = await new SignJWT({
    sub: authCode.user_id,
    client_id: clientId,
    scope: authCode.scopes.join(' '),
    api_key: apiKey,
    project_id: projectId,
    mode: mode, // 'personal' or 'company'
  })"""
    
    new = """  // Generate JWT access token
  const accessToken = await new SignJWT({
    sub: authCode.user_id,
    client_id: clientId,
    scope: authCode.scopes.join(' '),
    api_key: apiKey,
    project_id: projectId,
    org_id: orgId,
    mode: mode, // 'personal' or 'company'
  })"""
    
    if old in content:
        content = content.replace(old, new)
        print("  ✅ Fix 4a: JWT token in exchangeAuthorizationCode includes org_id")
    else:
        print("  ⚠️  Fix 4a: Could not find JWT creation in exchangeAuthorizationCode")
    
    # Also fix the refresh token JWT
    old2 = """  const accessToken = await new SignJWT({
    sub: stored.user_id,
    client_id: clientId,
    scope: scope || 'mcp:tools mcp:resources mcp:prompts',
    api_key: apiKey,
    project_id: projectId,
    mode: mode,
  })"""
    
    new2 = """  const accessToken = await new SignJWT({
    sub: stored.user_id,
    client_id: clientId,
    scope: scope || 'mcp:tools mcp:resources mcp:prompts',
    api_key: apiKey,
    project_id: projectId,
    org_id: stored.org_id || null,
    mode: mode,
  })"""
    
    if old2 in content:
        content = content.replace(old2, new2)
        print("  ✅ Fix 4b: JWT token in refreshAccessToken includes org_id")
    else:
        print("  ⚠️  Fix 4b: Could not find JWT creation in refreshAccessToken")
    
    # Store org_id in refresh token
    old3 = """  refreshTokens.set(refreshToken, {
    client_id: clientId,
    user_id: authCode.user_id,
    mode: mode,
    expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  });"""
    
    new3 = """  refreshTokens.set(refreshToken, {
    client_id: clientId,
    user_id: authCode.user_id,
    mode: mode,
    org_id: orgId,
    expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  });"""
    
    if old3 in content:
        content = content.replace(old3, new3)
        print("  ✅ Fix 4c: Refresh token stores org_id")
    else:
        print("  ⚠️  Fix 4c: Could not find refresh token storage")
    
    return content

# ============================================================
# FIX 5: MCP tool handler - resolve org_id from token and pass to API
# ============================================================
def fix_mcp_tool_handler(content):
    """Resolve org_id from JWT token and pass to internal API calls"""
    
    # Add org_id resolution after projectId resolution
    old = """    if (!apiKey || !projectId) {
      return res.status(401).json({ error: 'Authentication required. Please sign in via /mcp/login' });
    }

    // Create a new transport for each request (stateless)"""
    
    new = """    if (!apiKey || !projectId) {
      return res.status(401).json({ error: 'Authentication required. Please sign in via /mcp/login' });
    }

    // Resolve org_id from JWT token for company mode
    let orgId = null;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = await verifyAccessToken(token);
      if (payload?.org_id) {
        orgId = payload.org_id;
      }
    }

    // Create a new transport for each request (stateless)"""
    
    if old in content:
        content = content.replace(old, new)
        print("  ✅ Fix 5a: MCP handler resolves org_id from token")
    else:
        print("  ⚠️  Fix 5a: Could not find MCP handler auth pattern")
    
    # Update registerToolsForUser to accept and use orgId
    old2 = "  function registerToolsForUser(server, apiKey) {"
    new2 = "  function registerToolsForUser(server, apiKey, orgId = null) {"
    
    if old2 in content:
        content = content.replace(old2, new2)
        print("  ✅ Fix 5b: registerToolsForUser accepts orgId")
    else:
        print("  ⚠️  Fix 5b: Could not find registerToolsForUser signature")
    
    # Update the call to registerToolsForUser
    old3 = "    registerToolsForUser(mcp, apiKey);"
    new3 = "    registerToolsForUser(mcp, apiKey, orgId);"
    
    if old3 in content:
        content = content.replace(old3, new3)
        print("  ✅ Fix 5c: registerToolsForUser called with orgId")
    else:
        print("  ⚠️  Fix 5c: Could not find registerToolsForUser call")
    
    # Add org_id header to all internal API calls in registerToolsForUser
    # Find the first fetch call and add org_id header
    old4 = """        const result = await fetch(`${API_URL}/api/memories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify(body)
        });"""
    
    new4 = """        const memHeaders = { 'Content-Type': 'application/json', 'x-api-key': apiKey };
        if (orgId) memHeaders['x-org-id'] = orgId;
        const result = await fetch(`${API_URL}/api/memories`, {
          method: 'POST',
          headers: memHeaders,
          body: JSON.stringify(body)
        });"""
    
    if old4 in content:
        content = content.replace(old4, new4)
        print("  ✅ Fix 5d: squish_remember passes org_id header")
    else:
        print("  ⚠️  Fix 5d: Could not find squish_remember fetch pattern")
    
    return content

# ============================================================
# FIX 6: Memories route - read x-org-id header and filter by org
# ============================================================
def fix_memories_route(content):
    """Add org_id filtering to memory listing"""
    
    # Find the GET /api/memories endpoint and add org_id filtering
    # Look for the memories listing query
    old = """  app.get('/api/memories', authMiddleware, rateLimitByPlan, async (req, res) => {
    try {
      const projectId = req.projectId;"""
    
    new = """  app.get('/api/memories', authMiddleware, rateLimitByProject, async (req, res) => {
    try {
      const projectId = req.projectId;
      const orgId = req.headers['x-org-id'] || req.query.org_id || null;"""
    
    if old in content:
        content = content.replace(old, new)
        print("  ✅ Fix 6a: GET /api/memories reads org_id")
    else:
        print("  ⚠️  Fix 6a: Could not find GET /api/memories pattern")
    
    return content

# ============================================================
# MAIN
# ============================================================
def main():
    print("=" * 60)
    print("Squish Multi-Tenancy Fix Script")
    print("=" * 60)
    
    # Read files
    print("\n📖 Reading files...")
    files = {}
    for name, path in FILES.items():
        try:
            files[name] = read_file(path)
            print(f"  ✅ Read {path}")
        except FileNotFoundError:
            print(f"  ❌ File not found: {path}")
            sys.exit(1)
    
    # Apply fixes
    print("\n🔧 Applying fixes...")
    
    # Fix mcp-oauth.js
    print("\n  --- mcp-oauth.js ---")
    content = files['mcp_oauth']
    content = fix_generate_auth_code(content)
    content = fix_exchange_auth_code(content)
    content = fix_jwt_token(content)
    write_file(FILES['mcp_oauth'], content)
    
    # Fix mcp.js
    print("\n  --- routes/mcp.js ---")
    content = files['mcp_routes']
    content = fix_authorize_complete(content)
    content = fix_mcp_tool_handler(content)
    write_file(FILES['mcp_routes'], content)
    
    # Fix memories.js (optional - for data isolation)
    print("\n  --- routes/memories.js ---")
    content = files['memories']
    content = fix_memories_route(content)
    write_file(FILES['memories'], content)
    
    print("\n" + "=" * 60)
    print("✅ All fixes applied!")
    print("=" * 60)
    print("\nNext steps:")
    print("  1. Restart PM2: pm2 restart squish-api")
    print("  2. Test MCP auth flow with personal vs company mode")
    print("  3. Verify data isolation between API keys")

if __name__ == '__main__':
    main()
