import fs from 'node:fs';
import path from 'node:path';

import { docsRoutes, resolveUrl } from './site.config.js';

const siteDir = path.resolve('_site');

const docsUrls = docsRoutes.map(r => `  <url><loc>${resolveUrl(r.path)}</loc></url>`).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${resolveUrl('/')}</loc></url>
${docsUrls}
  <url><loc>${resolveUrl('/demo/')}</loc></url>
</urlset>`;

fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), sitemap);
