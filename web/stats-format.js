/**
 * Format a token count in thousands.
 * @param {number} value
 * @returns {string}
 */
function formatThousands(value) {
  return `${(value / 1e3).toFixed(1)}K`;
}

/**
 * Format compression stats for display.
 * Always shows savings vs expanded (beautified) baseline.
 * @param {object} [stats]
 * @param {string} [mode="full"]
 * @returns {string}
 */
export function formatStats(stats = {}, mode = 'full') {
  const { codeTok = 0, ctxTok = 0, totalTok = 0, expanded = 0 } = stats;
  const total = totalTok || (codeTok + (ctxTok || 0));
  const pct = expanded > 0 ? Math.round(100 * (1 - total / expanded)) : 0;
  const dir = pct >= 0 ? `↓${pct}%` : `↑${Math.abs(pct)}%`;
  if (mode === 'short') {
    return `${formatThousands(total)} of ${formatThousands(expanded)} (${dir})`;
  }
  const compact = ctxTok
    ? `${formatThousands(codeTok)} + ${formatThousands(ctxTok)} ctx = ${formatThousands(total)}`
    : `${formatThousands(codeTok)}`;
  return `${formatThousands(expanded)} source → ${compact} compact (${dir})`;
}
