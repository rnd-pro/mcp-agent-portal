import { createPagesJsdaConfig } from 'library-pages/jsda';

export default createPagesJsdaConfig({
  sourceDir: './site',
  outputDir: './_site',
  entryPatterns: ['*.html.js', '**/*.html.js', '**/index.js'],
  copy: [
    { from: './site/static-assets', to: './' },
    { from: './node_modules/symbiote-ui/icons/material-symbols.css', to: './icons/' },
    { from: './node_modules/symbiote-ui/icons/material-symbols-outlined-400.ttf', to: './icons/' },
  ],
  importmapPackageList: ['node:fs/promises', 'node:fs', 'node:path', 'node:crypto', 'node:process'],
});
