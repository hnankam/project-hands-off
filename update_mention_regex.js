const fs = require('fs');
const file = 'pages/side-panel/src/components/chat/CustomMarkdownRenderer.tsx';
let content = fs.readFileSync(file, 'utf8');

// Update the mention regex to include pipe and em-dash, and stop before URLs
const oldRegex = `const mentionRegex = /@([\\w\\s\\-_.]+?)(?=\\s*[.,!?;:)\\]}\\n]|$|\\s*[\\[({\\`*_~|<>!]|$)/g;`;
const newRegex = `const mentionRegex = /@([\\w\\s\\-_.—|]+?)(?=\\s*[.,!?;:)\\]}\\n]|$|\\s*[\\[({\\`*_~<>]|\\s+https?:\\/\\/)/g;`;

content = content.replace(oldRegex, newRegex);
fs.writeFileSync(file, content);
console.log('Updated mention regex successfully');
