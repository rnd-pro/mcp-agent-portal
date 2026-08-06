/**
 * TailwindBridge — bridges Tailwind v4 theme variables to Symbiote-UI --sn-* design tokens.
 *
 * @module symbiote-ui/themes/TailwindBridge
 */

/**
 * Checks if Tailwind v4 custom properties are present on the element or root
 * @param {HTMLElement} [element]
 * @returns {boolean}
 */
export function hasTailwind(element) {
  if (typeof window === 'undefined' || !window.getComputedStyle) return false;
  const target = element || document.documentElement;
  const style = window.getComputedStyle(target);
  // Check common Tailwind v4 root variables
  return (
    style.getPropertyValue('--color-background').trim() !== '' ||
    style.getPropertyValue('--color-foreground').trim() !== '' ||
    style.getPropertyValue('--font-sans').trim() !== ''
  );
}

/**
 * Programmatically maps Tailwind v4 variables to --sn-* equivalents.
 * Only sets properties if the corresponding Tailwind variable exists.
 * @param {HTMLElement} [element]
 */
export function applyTailwindBridge(element) {
  if (typeof window === 'undefined' || !window.getComputedStyle) return;
  const target = element || document.documentElement;
  const style = window.getComputedStyle(target);

  const mappings = [
    { sn: '--sn-sys-surface', tw: '--color-background' },
    { sn: '--sn-sys-on-surface', tw: '--color-foreground' },
    { sn: '--sn-sys-surface-panel', tw: '--color-surface' },
    { sn: '--sn-sys-surface-panel', tw: '--color-panel' },
    { sn: '--sn-sys-accent', tw: '--color-accent' },
    { sn: '--sn-node-accent', tw: '--color-accent' },
    { sn: '--sn-tabs-accent', tw: '--color-accent' },
    { sn: '--sn-button-primary-bg', tw: '--color-primary' },
    { sn: '--sn-outline-color', tw: '--color-border' },
    { sn: '--sn-border', tw: '--color-border' },
    { sn: '--sn-font', tw: '--font-sans' },
    { sn: '--sn-font-mono', tw: '--font-mono' }
  ];

  for (const { sn, tw } of mappings) {
    const value = style.getPropertyValue(tw).trim();
    if (value) {
      target.style.setProperty(sn, `var(${tw})`);
    }
  }
}
