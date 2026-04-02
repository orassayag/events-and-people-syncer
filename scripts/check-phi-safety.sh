#!/bin/bash
set -e

echo "🔒 Checking for PHI safety issues..."
echo ""

PHI_ISSUES=0

echo "1. Checking for console.log statements (may contain PHI)..."
if grep -rn "console\.\(log\|warn\|error\)" src/utils/errorUtils.ts src/utils/summaryFormatter.ts src/utils/contactMapper.ts src/cache/baseCache.ts 2>/dev/null; then
  echo "⚠️  Found console statements in new files"
  PHI_ISSUES=$((PHI_ISSUES + 1))
else
  echo "✅ No console statements in new utility files"
fi

echo ""
echo "2. Checking for logger calls without noPHI..."
if grep -rn "logger\.\(info\|warn\|error\)" src/utils/errorUtils.ts src/utils/summaryFormatter.ts src/utils/contactMapper.ts src/cache/baseCache.ts 2>/dev/null | grep -v "noPHI"; then
  echo "⚠️  Found logger calls without noPHI marker"
  PHI_ISSUES=$((PHI_ISSUES + 1))
else
  echo "✅ All logger calls have noPHI marker"
fi

echo ""
echo "3. Checking for potential PHI in error messages..."
if grep -rn "\${.*\.email\|\.name\|\.displayName\|\.phoneNumber}" src/utils/errorUtils.ts src/utils/summaryFormatter.ts src/utils/contactMapper.ts src/cache/baseCache.ts 2>/dev/null; then
  echo "⚠️  Found potential PHI in string interpolation"
  PHI_ISSUES=$((PHI_ISSUES + 1))
else
  echo "✅ No obvious PHI in error messages"
fi

echo ""
if [ $PHI_ISSUES -eq 0 ]; then
  echo "✅ PHI safety check passed"
  exit 0
else
  echo "❌ Found $PHI_ISSUES PHI safety issue(s)"
  echo "Please review and fix before proceeding"
  exit 1
fi
