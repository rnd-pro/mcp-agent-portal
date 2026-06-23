import { Symbiote } from '@symbiotejs/symbiote';
import shellTemplate from './app-shell.tpl.js';

export class AppShell extends Symbiote {
  constructor() {
    super();
    // Hydrate the build-time SSR markup instead of re-rendering the shell.
    this.isoMode = true;
  }
}

AppShell.template = shellTemplate;
AppShell.reg('app-shell');
