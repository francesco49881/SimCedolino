import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+(?=(?:const|let|var|function|async\s+function|class)\b)/gm, '');
}

const html = read('index.html');
const css = read('src/styles.css');
const presetsJs = stripModuleSyntax(read('src/presets.js'));
const engineJs = stripModuleSyntax(read('src/calc-engine.js'));
const appJs = stripModuleSyntax(read('src/app.js'));

const bundledScript = `(() => {
  'use strict';

${presetsJs}

${engineJs}

${appJs}
})();`;

const standaloneHtml = html
  .replace(
    '<link rel="stylesheet" href="./src/styles.css" />',
    `<style>\n${css}\n  </style>`
  )
  .replace(
    '<script type="module" src="./src/app.js"></script>',
    `<script>\n${bundledScript}\n  </script>`
  );

// Controllo privacy opzionale tramite lista locale (non tracciata in Git)
const privacyFile = path.join(root, 'scripts', 'privacy-terms.local.json');
if (fs.existsSync(privacyFile)) {
  const forbiddenTerms = JSON.parse(fs.readFileSync(privacyFile, 'utf8'));
  const lower = standaloneHtml.toLowerCase();
  const leaked = forbiddenTerms.filter((term) => lower.includes(term.toLowerCase()));
  if (leaked.length > 0) {
    console.error('ERRORE PRIVACY: trovati termini sensibili nel file standalone:', leaked);
    process.exit(1);
  }
}

const outPath = path.join(root, 'Simulatore_Cedolino.html');
fs.writeFileSync(outPath, standaloneHtml, 'utf8');
console.log(`Generato con successo: ${outPath} (${(Buffer.byteLength(standaloneHtml) / 1024).toFixed(1)} KB)`);
