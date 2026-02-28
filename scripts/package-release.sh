#!/bin/bash

# Squish Release Packaging Script
# Creates platform-specific packages for distribution

set -e

VERSION=$(node -p "require('./package.json').version")
echo "Building Squish v$VERSION release packages..."

# Clean previous builds
rm -rf dist/ *.tar.gz *.zip

# Build production version
npm run build:prod

# Create platform-specific packages
create_package() {
    local platform=$1
    local arch=$2
    local output_name="squish-${VERSION}-${platform}-${arch}"

    echo "Creating $output_name..."

    # Create package directory
    mkdir -p "package/$output_name"
    mkdir -p "package/$output_name/bin"

    # Copy files
    cp -r dist/prod/* "package/$output_name/"
    cp install.sh "package/$output_name/"
    cp README.md "package/$output_name/"
    cp LICENSE "package/$output_name/"

    # Create executable wrapper
    cat > "package/$output_name/bin/squish" << 'EOF'
#!/bin/bash
# Squish wrapper script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$DIR/src/index.js" "$@"
EOF
    chmod +x "package/$output_name/bin/squish"

    # Create archive
    cd package
    if [[ "$platform" == "windows" ]]; then
        zip -r "../${output_name}.zip" "$output_name"
    else
        tar -czf "../${output_name}.tar.gz" "$output_name"
    fi
    cd ..

    echo "✓ Created ${output_name}.tar.gz"
}

# Build for multiple platforms
create_package "linux" "x64"
create_package "linux" "arm64"
create_package "macos" "x64"
create_package "macos" "arm64"
create_package "windows" "x64"

# Clean up
rm -rf package/

echo ""
echo "🎉 Release packages created:"
ls -la *.tar.gz *.zip 2>/dev/null || true
echo ""
echo "Upload these to GitHub releases at:"
echo "https://github.com/michielhdoteth/squish/releases/tag/v$VERSION"