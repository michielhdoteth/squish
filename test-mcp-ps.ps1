$body = @"
{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
"@
Invoke-RestMethod -Uri 'http://localhost:8767/mcp' -Method POST -Body $body -ContentType 'application/json' -Headers @{'Accept'='application/json, text/event-stream'}
