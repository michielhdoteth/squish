# v1.0.2 (2026-03-18)

## Security & Performance Improvements

### Security
- Added rate limiting to web server and MCP server (100 requests per 15 min)
- CORS restricted to localhost by default (configurable via `SQUISH_CORS_ORIGINS`)
- Updated vulnerable dependencies (express, hono, express-rate-limit)

### Package Optimization
- Reduced package size from 413KB to 283KB (-31%)
- Removed source maps from published package
- Files reduced from 606 to 348

### SEO Enhancements
- Updated package keywords with high-value search terms
- Added author email for trust signal
- Updated sitemap with current dates

## Dependencies Updated
- express: 4.22.1 → 5.2.1
- uuid: 9.0.1 → 13.0.0
- redis: 4.7.1 → 5.11.0
- pg: 8.19.0 → 8.20.0

## Previous Releases
See [CHANGELOG.md](./CHANGELOG.md) for full history.
