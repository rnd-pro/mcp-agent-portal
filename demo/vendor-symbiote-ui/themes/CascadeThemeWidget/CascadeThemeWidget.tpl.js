import { html } from '@symbiotejs/symbiote';
import {
  cascadeThemeActionButton,
  cascadeThemeModeControls,
  cascadeThemeTabShapeControls,
  cascadeThemeTargetControls,
  cascadeThemeVariantControls,
} from '../CascadeThemeControls.tpl.js';

export default html`
  <button
    ref="trigger"
    class="ctw-trigger shell-action"
    type="button"
    aria-haspopup="dialog"
    ${{
      onclick: 'onToggle',
      '@aria-expanded': 'ariaExpanded',
      '@active': 'isOpen',
      title: 'triggerTitle',
    }}
  >
    <span class="material-symbols-outlined" aria-hidden="true">palette</span>
    <span class="ctw-trigger-label">Theme</span>
  </button>
  <section
    ref="popover"
    class="ctw-popover"
    role="dialog"
    aria-label="Theme quick controls"
    ${{ '@hidden': '!isOpen' }}
  >
    <header class="ctw-header">
      <strong>Theme</strong>
      <div class="ctw-header-actions">
        ${cascadeThemeActionButton({ action: 'copy', icon: 'content_copy', label: 'Copy parameters', onClick: 'onCopy' })}
        <button
          ref="shareAction"
          type="button"
          data-action="share"
          ${{ onclick: 'onShare', title: 'shareLabel', '@aria-label': 'shareLabel' }}
        >
          <span class="material-symbols-outlined" aria-hidden="true">share</span>
        </button>
        ${cascadeThemeActionButton({ action: 'reset', icon: 'restart_alt', label: 'Reset to defaults', onClick: 'onReset' })}
        ${cascadeThemeActionButton({ action: 'open-full', icon: 'open_in_full', label: 'Open theme layout', onClick: 'onOpenFull' })}
      </div>
    </header>
    ${cascadeThemeTargetControls({
      className: 'ctw-targets',
      listClassName: 'ctw-target-list',
      targetClassName: 'ctw-target',
      labelClassName: 'ctw-target-label',
    })}
    ${cascadeThemeModeControls({ className: 'ctw-mode', darkPressed: 'modeDarkActive', lightPressed: 'modeLightActive' })}
    ${cascadeThemeVariantControls({ className: 'ctw-mode ctw-variant', modernPressed: 'variantModernActive', classicPressed: 'variantClassicActive' })}
    ${cascadeThemeTabShapeControls({
      className: 'ctw-mode ctw-tab-shape',
      framePressed: 'tabShapeFrameActive',
      earPressed: 'tabShapeEarActive',
      classicEarPressed: 'tabShapeClassicEarActive',
    })}
    <div class="ctw-controls" ref="controls" itemize="controlsList">
      <template>
        <div class="ctw-control">
          <div class="ctw-control-head">
            <span class="ctw-control-icon material-symbols-outlined" aria-hidden="true">{{icon}}</span>
            <label ${{ '@for': 'inputId' }}>{{name}}</label>
          </div>
          <input
            type="range"
            step="1"
            ${{
              '@id': 'inputId',
              '@min': 'min',
              '@max': 'max',
              '@data-theme-control': 'name',
              value: 'value',
              oninput: '^onControlInput',
            }}
          >
          <output ${{ '@data-theme-output': 'name' }}>{{value}}</output>
        </div>
      </template>
    </div>
  </section>
`;
