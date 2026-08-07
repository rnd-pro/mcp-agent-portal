import { renderPage } from 'library-pages/shell';
import { buildSearchIndex } from 'library-pages/search';
import { composeSiteConfig, docsRoutes, resolvePath } from './site.config.js';

const errorStyles = /*css*/ `
  .error-container {
    text-align: center;
    padding: 4rem 1rem;
  }
  .error-title {
    font-size: 4rem;
    color: var(--brand);
    margin-bottom: 1rem;
  }
  .error-message {
    font-size: 1.25rem;
    margin-bottom: 2rem;
    color: var(--muted);
  }
  .error-subtitle {
    border: none;
    margin-top: 0;
  }
  .error-actions {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
  }
`;

const contentHtml = /*html*/ `
    <div class="error-container">
      <div class="error-title">404</div>
      <h1 class="error-subtitle">Page Not Found</h1>
      <p class="error-message">The documentation page or workspace resource you are looking for does not exist or has been relocated.</p>
      <div class="error-actions">
        <a class="lp-cta lp-cta-primary" href="${resolvePath('/')}">Back to home</a>
        <a class="lp-cta lp-cta-secondary" href="${resolvePath('/docs/')}">Read the guide</a>
      </div>
    </div>
`;

export default renderPage({
  siteConfig: composeSiteConfig({
    pageStyles: errorStyles,
    description: 'The requested Symbiote Engine page could not be found.',
    narrow: true,
  }),
  pageTitle: 'Page Not Found',
  contentHtml,
  currentPath: '/404.html',
  searchIndex: buildSearchIndex(docsRoutes),
});
