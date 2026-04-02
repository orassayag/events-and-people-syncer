#!/bin/bash
set -e

echo "🔍 Checking for broken imports..."

pnpm build > /dev/null 2>&1 || {
  echo "❌ Build failed - likely broken imports"
  pnpm build
  exit 1
}

echo "✅ All imports resolve correctly"
