import { renderDocsPage } from 'library-pages/shell';
import { docsRoutes, docsSiteConfig } from '../../site.config.js';
import { packageExports, symbolInventory } from '../reference-data.js';

const currentRoute = docsRoutes.find((route) => route.path === '/docs/reference/');

const exportsRows = packageExports.map(item => `
  <tr>
    <td><code>${item.key}</code></td>
    <td><code>${item.target}</code></td>
  </tr>
`).join('');

const symbolsRows = symbolInventory.map(item => `
  <tr>
    <td><code>${item.name}</code></td>
    <td><span class="reference-meta">${item.type}</span></td>
    <td><span class="reference-meta">${item.env}</span></td>
  </tr>
`).join('');

export default renderDocsPage({
  siteConfig: docsSiteConfig(currentRoute),
  routes: docsRoutes,
  currentRoute,
  contentHtml: /*html*/ `
  <div class="docs-header" id="overview">
    <h1>API Reference</h1>
    <p>
      This page provides a generated inventory of the <code>symbiote-engine</code> package. The package export map contains the exact public subpaths and the namespace table is strictly the root/browser namespace union.
    </p>
  </div>

  <section>
    <h2 id="package-exports">Package Exports</h2>
    <p>
      The map contains the exact public subpaths.
    </p>
    <table>
      <thead>
        <tr>
          <th style="width: 40%;">Subpath</th>
          <th style="width: 60%;">Target</th>
        </tr>
      </thead>
      <tbody>
        ${exportsRows}
      </tbody>
    </table>
  </section>

  <section>
    <h2 id="reference-inventory">Namespace Symbol Inventory</h2>
    <p>
      The namespace table is scoped explicitly to the exact union of the live root and browser namespaces. Unlike the package-export table which is package-wide, this namespace table does not claim every exported subpath symbol.
    </p>
    <table>
      <thead>
        <tr>
          <th style="width: 50%;">Symbol Name</th>
          <th style="width: 20%;">Type</th>
          <th style="width: 30%;">Availability</th>
        </tr>
      </thead>
      <tbody>
        ${symbolsRows}
      </tbody>
    </table>
  </section>
`,
});
