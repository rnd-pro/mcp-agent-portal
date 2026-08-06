/**
 * TemplatePreview styles
 * @module symbiote-ui/inspector/TemplatePreview.css
 */
import { css } from '@symbiotejs/symbiote';

export let styles = css`
  template-preview {
    display: block;
    padding-top: var(--sn-step-4);

    & .tpl-preview-section {
      margin-bottom: var(--sn-step-5);
    }

    & .tpl-chips-label,
    & .tpl-preview-label {
      display: flex;
      align-items: center;
      gap: var(--sn-step-2);
      font-size: var(--sn-text-2xs);
      font-weight: 600;
      text-transform: uppercase;
      color: var(--sn-sys-on-surface-dim);
      margin-bottom: var(--sn-step-2);
      letter-spacing: 0.5px;
    }

    & .tpl-chips-label .material-symbols-outlined,
    & .tpl-preview-label .material-symbols-outlined {
      font-size: var(--sn-text-lg);
      opacity: 0.6;
    }

    & .tpl-chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sn-step-2);
    }

    & .tpl-chips-empty {
      font-size: var(--sn-text-xs);
      color: var(--sn-sys-on-surface-dim);
      font-style: italic;
      padding: var(--sn-step-2) 0;

      &[hidden] {
        display: none;
      }
    }

    & .tpl-test-data {
      width: 100%;
      padding: var(--sn-step-3) var(--sn-step-4);
      font-size: var(--sn-text-xs);
      font-family: var(--sn-font-mono);
      color: var(--sn-sys-on-surface);
      background: color-mix(in oklab, currentColor 6%, transparent);
      border: 1px solid var(--sn-sys-outline);
      border-radius: var(--sn-radius-sm);
      outline: none;
      resize: vertical;
      min-height: 50px;
      box-sizing: border-box;
      line-height: 1.4;
      transition: border-color var(--sn-transition-fast, 0.15s);

      &:focus {
        border-color: var(--sn-sys-accent);
      }
    }

    & .tpl-preview-result {
      font-size: var(--sn-text-sm);
      font-family: var(--sn-font-mono);
      color: var(--sn-sys-on-surface);
      background: color-mix(in oklab, currentColor 4%, transparent);
      border: 1px solid var(--sn-sys-outline);
      border-radius: var(--sn-radius-sm);
      padding: var(--sn-step-4);
      white-space: pre-wrap;
      word-break: break-word;
      min-height: 30px;
      line-height: 1.4;
    }
  }

  .tpl-chip {
    display: inline-block;
    padding: var(--sn-step-1) var(--sn-step-4);
    font-size: var(--sn-text-xs);
    font-family: var(--sn-font-mono);
    border-radius: var(--sn-radius-lg, 10px);
    background: var(--sn-sys-success-container);
    color: var(--sn-sys-success);
    border: 1px solid color-mix(in oklch, var(--sn-sys-success) 40%, transparent);

    &[data-missing] {
      background: var(--sn-sys-danger-container);
      color: var(--sn-sys-danger);
      border-color: color-mix(in oklch, var(--sn-sys-danger) 40%, transparent);
    }
  }
`;
