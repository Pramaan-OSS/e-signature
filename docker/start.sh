#!/bin/sh

# 🚀 Starting ESign...
printf "🚀 Starting ESign...\n\n"

# 🔐 Check certificate configuration
printf "🔐 Checking certificate configuration...\n"

CERT_PATH="${NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH:-/opt/esign/cert.p12}"

if [ -f "$CERT_PATH" ] && [ -r "$CERT_PATH" ]; then
    printf "✅ Certificate file found and readable - document signing is ready!\n"
else
    printf "⚠️ Certificate not found or not readable\n"
    printf "💡 Tip: ESign will still start, but document signing will be unavailable\n"
    printf "🔧 Check: http://localhost:3000/api/certificate-status for detailed status\n"
fi

printf "\n📚 Useful Links:\n"
printf "📖 Documentation: /help"
printf "🐳 Self-hosting guide: /help"
printf "🔐 Certificate setup: /help"
printf "🏥 Health check: http://localhost:3000/api/health\n"
printf "📊 Certificate status: http://localhost:3000/api/certificate-status\n"
printf "👥 Community: https://example.invalid/source-credits\n\n"

# The Prisma schema requires a direct URL. Without a connection pooler, it is the same as the database URL.
export NEXT_PRIVATE_DIRECT_DATABASE_URL="${NEXT_PRIVATE_DIRECT_DATABASE_URL:-$NEXT_PRIVATE_DATABASE_URL}"

printf "🗄️  Running database migrations...\n"
npx prisma migrate deploy --schema ../../packages/prisma/schema.prisma

printf "🌟 Starting ESign server...\n"
HOSTNAME=0.0.0.0 node build/server/main.js
