#!/bin/bash

# CSS Phase 4 Extraction Script
# This script extracts CopilotKit core components from SidePanel.css

set -e  # Exit on error

cd "$(dirname "$0")/src"

echo "🚀 Starting Phase 4 CSS Extraction..."
echo ""

# Create necessary directories
mkdir -p styles/2-components/copilotkit

# Backup should already exist (created programmatically)
if [ ! -f "SidePanel.css.phase4.backup" ]; then
  echo "❌ Error: Backup not found! Creating now..."
  cp SidePanel.css SidePanel.css.phase4.backup
fi
echo "✅ Backup verified"

# Extract 1: Thinking Block (lines 1349-1421, 73 lines)
echo "📦 Extracting Thinking Block..."
sed -n '1349,1421p' SidePanel.css.phase4.backup > styles/2-components/copilotkit/thinking-block.css
echo "   → $(wc -l < styles/2-components/copilotkit/thinking-block.css) lines → styles/2-components/copilotkit/thinking-block.css"

# Extract 2: CopilotKit Input & Suggestions (lines 1123-1766, 644 lines)
echo "📦 Extracting CopilotKit Input & Suggestions..."
sed -n '1123,1766p' SidePanel.css.phase4.backup > styles/2-components/copilotkit/input.css
echo "   → $(wc -l < styles/2-components/copilotkit/input.css) lines → styles/2-components/copilotkit/input.css"

# Extract 3: CopilotKit Layout & Chat (lines 403-612, 210 lines)
echo "📦 Extracting CopilotKit Layout & Chat..."
sed -n '403,612p' SidePanel.css.phase4.backup > styles/2-components/copilotkit/layout.css
echo "   → $(wc -l < styles/2-components/copilotkit/layout.css) lines → styles/2-components/copilotkit/layout.css"

# Extract 4: CopilotKit Messages & Controls (lines 613-1122, 510 lines)
echo "📦 Extracting CopilotKit Messages & Controls..."
sed -n '613,1122p' SidePanel.css.phase4.backup > styles/2-components/copilotkit/messages.css
echo "   → $(wc -l < styles/2-components/copilotkit/messages.css) lines → styles/2-components/copilotkit/messages.css"

echo ""
echo "✅ Phase 4 Extraction Complete!"
echo ""
echo "📊 Summary:"
echo "   - Thinking Block: $(wc -l < styles/2-components/copilotkit/thinking-block.css) lines"
echo "   - Input & Suggestions: $(wc -l < styles/2-components/copilotkit/input.css) lines"
echo "   - Layout & Chat: $(wc -l < styles/2-components/copilotkit/layout.css) lines"
echo "   - Messages & Controls: $(wc -l < styles/2-components/copilotkit/messages.css) lines"
echo ""
echo "Next steps:"
echo "1. Add imports to SidePanel.css (at top, after existing imports)"
echo "2. Remove extracted sections from SidePanel.css"
echo "3. Build and test"
echo ""
echo "⚠️  To rollback: cp SidePanel.css.phase4.backup SidePanel.css"

