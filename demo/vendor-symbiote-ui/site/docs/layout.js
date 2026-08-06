import { md } from 'jsda-kit/node/md.js';
import path from 'path';
import { renderDocsPage as renderSharedDocsPage } from 'library-pages/shell';
import { docsRoutes, docsSiteConfig } from '../site.config.js';

export async function renderDocsPage(markdownFile) {
  const currentRoute = docsRoutes.find(
    (route) => route.markdown === markdownFile && route.path !== '/docs/',
  ) || docsRoutes.find((route) => route.markdown === markdownFile);
  if (!currentRoute) {
    throw new Error(`Unknown documentation source: ${markdownFile}`);
  }

  const contentHtml = await md(path.resolve(process.cwd(), 'docs', markdownFile));

  return renderSharedDocsPage({
    siteConfig: docsSiteConfig(currentRoute),
    routes: docsRoutes,
    currentRoute,
    contentHtml: `<article class="prose">${contentHtml}</article>`,
  });
}
