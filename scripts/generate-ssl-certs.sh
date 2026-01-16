#!/bin/bash
# ============================================================================
# Generate Self-Signed SSL Certificates for Development
# ============================================================================
# Usage: ./scripts/generate-ssl-certs.sh
#
# This script generates self-signed SSL certificates for local development.
# DO NOT use these certificates in production - use Let's Encrypt or a real CA.
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CERTS_DIR="$PROJECT_ROOT/certs"

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

echo "Generating self-signed SSL certificates for development..."
echo "Output directory: $CERTS_DIR"
echo ""

# Generate private key and certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERTS_DIR/key.pem" \
    -out "$CERTS_DIR/cert.pem" \
    -subj "/C=US/ST=Local/L=Local/O=Development/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

# Set appropriate permissions
chmod 600 "$CERTS_DIR/key.pem"
chmod 644 "$CERTS_DIR/cert.pem"

echo ""
echo "SSL certificates generated successfully!"
echo ""
echo "Files created:"
echo "  - $CERTS_DIR/cert.pem (certificate)"
echo "  - $CERTS_DIR/key.pem (private key)"
echo ""
echo "To enable HTTPS:"
echo "1. Uncomment the HTTPS server block in frontend/nginx.conf"
echo "2. Uncomment the volumes section in docker-compose.yml"
echo "3. Uncomment the HTTP->HTTPS redirect in nginx.conf (optional)"
echo "4. Rebuild and restart: docker-compose up --build"
echo ""
echo "Note: Your browser will show a security warning for self-signed certs."
echo "This is expected for development. Click 'Advanced' and proceed."
