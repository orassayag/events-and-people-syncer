#!/bin/bash
set -e

echo "🔍 Running refactoring validation..."
echo ""

echo "📝 Step 1: Running linter..."
pnpm lint || { echo "❌ Lint failed"; exit 1; }

echo "✅ Lint passed"
echo ""

echo "🏗️  Step 2: Running build..."
pnpm build || { echo "❌ Build failed"; exit 1; }

echo "✅ Build passed"
echo ""

echo "🧪 Step 3: Running tests..."
pnpm test || { echo "❌ Tests failed"; exit 1; }

echo "✅ Tests passed"
echo ""

echo "✨ All validation checks passed!"
