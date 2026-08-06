import { createPagesJsdaConfig } from 'library-pages/jsda';

const config = createPagesJsdaConfig({
  sourceDir: './site',
  outputDir: './_site',
  entryPatterns: ['index.js', 'index.*.js', '**/*.html.js', '*.html.js', '**/index.js'],
  copy: [
    { from: './icons/material-symbols.css', to: './catalog/js/material-symbols.css' },
    { from: './icons/material-symbols-outlined-400.ttf', to: './catalog/js/material-symbols-outlined-400.ttf' },
    { from: './custom-elements.json', to: './catalog/custom-elements.json' },
    { from: './canvas/ForceWorker.js', to: './catalog/js/ForceWorker.js' },
  ],
});

// minify-js 0.6.0 panics on this site's catalog inline scripts
// (cons_expr.returns assertion), so HTML minification stays off here.
config.minify.html = false;

export default config;
