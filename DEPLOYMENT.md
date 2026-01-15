# Deploying get.squishapp.dev

## Option 1: Vercel (Recommended - Free)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy the script
vercel --prod get-squish.sh
```

## Option 2: GitHub Pages
1. Create a new repository called `get.squishapp.dev`
2. Add `get-squish.sh` as the only file
3. Enable GitHub Pages for the repository
4. The URL will be: `https://yourusername.github.io/get.squishapp.dev/`

## Option 3: Netlify
1. Create a new site on Netlify
2. Upload `get-squish.sh` as the main file
3. Set the content type to `application/x-shellscript`

## Option 4: Any Web Server
Upload `get-squish.sh` to any web server and ensure it serves with:
- Content-Type: `application/x-shellscript`
- No caching headers
- HTTPS enabled

## Testing
Once deployed, test with:
```bash
curl -fsSL https://get.squishapp.dev | head -20
```

This should show the first 20 lines of the install script.