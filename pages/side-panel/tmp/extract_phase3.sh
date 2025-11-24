#!/bin/bash

# CSS Phase 3 Extraction Script
# This script extracts remaining components from SidePanel.css

set -e  # Exit on error

cd "$(dirname "$0")/src"

echo "🚀 Starting Phase 3 CSS Extraction..."
echo ""

# Create necessary directories
mkdir -p styles/0-base
mkdir -p styles/2-components/copilotkit
mkdir -p styles/3-utilities

# Backup main CSS
cp SidePanel.css SidePanel.css.phase3.backup
echo "✅ Backup created"

# Extract 1: CopilotKit Variables (lines 400-438)
echo "📦 Extracting CopilotKit Variables..."
sed -n '400,438p' SidePanel.css > styles/0-base/variables.css
echo "   → $(wc -l < styles/0-base/variables.css) lines → styles/0-base/variables.css"

# Extract 2: Utilities & Helpers (lines 2362-END)
echo "📦 Extracting Utilities & Helpers..."
sed -n '2362,$p' SidePanel.css > styles/3-utilities/helpers.css
echo "   → $(wc -l < styles/3-utilities/helpers.css) lines → styles/3-utilities/helpers.css"

# Extract 3: CopilotKit Code Blocks (lines 1160-1400)
echo "📦 Extracting CopilotKit Code Blocks..."
sed -n '1160,1400p' SidePanel.css > styles/2-components/copilotkit/code-blocks.css
echo "   → $(wc -l < styles/2-components/copilotkit/code-blocks.css) lines → styles/2-components/copilotkit/code-blocks.css"

echo ""
echo "✅ Phase 3 Extraction Complete!"
echo ""
echo "📊 Summary:"
echo "   - Variables: $(wc -l < styles/0-base/variables.css) lines"
echo "   - Utilities: $(wc -l < styles/3-utilities/helpers.css) lines"
echo "   - Code Blocks: $(wc -l < styles/2-components/copilotkit/code-blocks.css) lines"
echo ""
echo "Next steps:"
echo "1. Add imports to SidePanel.css (at top, after existing imports)"
echo "2. Remove extracted sections from SidePanel.css"
echo "3. Build and test"
echo ""
echo "⚠️  To rollback: cp SidePanel.css.phase3.backup SidePanel.css"

