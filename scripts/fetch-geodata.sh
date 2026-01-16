#!/bin/bash
# Download GeoIP, GeoSite, GeoLite2-ASN databases for bundling
# These files will be embedded in the app and copied to data directory on first launch

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GEODATA_DIR="$SCRIPT_DIR/../src-tauri/resources/geodata"

mkdir -p "$GEODATA_DIR"

echo "Downloading GeoIP.dat..."
curl -L -o "$GEODATA_DIR/GeoIP.dat" \
  "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat"

echo "Downloading geosite.dat..."
curl -L -o "$GEODATA_DIR/geosite.dat" \
  "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat"

echo "Downloading GeoLite2-ASN.mmdb..."
curl -L -o "$GEODATA_DIR/GeoLite2-ASN.mmdb" \
  "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb"

echo "GeoData files downloaded to: $GEODATA_DIR"
ls -la "$GEODATA_DIR"
