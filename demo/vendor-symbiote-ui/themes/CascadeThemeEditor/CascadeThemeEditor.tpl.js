import { html } from '@symbiotejs/symbiote';
import {
  cascadeThemeActionButton,
  cascadeThemeLocaleControls,
  cascadeThemeModeControls,
  cascadeThemeRegisterControls,
  cascadeThemeTabShapeControls,
  cascadeThemeTargetControls,
  cascadeThemeVariantControls,
} from '../CascadeThemeControls.tpl.js';

export default html`
  <section class="cte-shell">
    <header class="cte-header">
      <div class="cte-title">
        <span class="material-symbols-outlined" aria-hidden="true">palette</span>
        <strong>Cascade theme</strong>
        <span class="cte-status" ref="status">{{status}}</span>
      </div>
      <div class="cte-actions">
        ${cascadeThemeActionButton({ action: 'copy', className: 'cte-icon-button', icon: 'content_copy', label: 'Copy parameters', onClick: 'onCopy' })}
        <button
          ref="shareAction"
          type="button"
          class="cte-icon-button"
          data-action="share"
          ${{ onclick: 'onShare', title: 'shareLabel', '@aria-label': 'shareLabel' }}
        >
          <span class="material-symbols-outlined" aria-hidden="true">share</span>
        </button>
        ${cascadeThemeActionButton({ action: 'reset', className: 'cte-icon-button', icon: 'restart_alt', label: 'Reset to defaults', onClick: 'onReset' })}
      </div>
    </header>

    ${cascadeThemeTargetControls({
      className: 'cte-targets',
      listClassName: 'cte-target-list',
      targetItemClassName: 'cte-target-item',
      targetClassName: 'cte-target',
      labelClassName: 'cte-target-label',
      includeRemove: true,
      removeClassName: 'cte-target-remove',
      includePick: true,
      pickClassName: 'cte-pick',
      includeApplyAll: true,
      applyAllClassName: 'cte-apply-all',
    })}

    ${cascadeThemeLocaleControls({
      className: 'cte-mode cte-locale',
      enPressed: 'localeEn',
      ruPressed: 'localeRu',
      esPressed: 'localeEs',
    })}

    ${cascadeThemeModeControls({ className: 'cte-mode', darkPressed: 'modeDark', lightPressed: 'modeLight' })}

    ${cascadeThemeVariantControls({ className: 'cte-mode cte-variant', modernPressed: 'variantModern', classicPressed: 'variantClassic' })}

    ${cascadeThemeTabShapeControls({
      className: 'cte-mode cte-tab-shape',
      framePressed: 'tabShapeFrame',
      earPressed: 'tabShapeEar',
      classicEarPressed: 'tabShapeClassicEar',
    })}

    ${cascadeThemeRegisterControls({
      className: 'cte-mode cte-register',
      defaultPressed: 'registerDefault',
      productPressed: 'registerProduct',
      toolPressed: 'registerTool',
      spaciousPressed: 'registerSpacious',
    })}

    <div class="cte-controls" ref="controls" itemize="controlsList">
      <template>
        <div class="cte-control" ${{ title: 'description' }}>
          <div class="cte-control-head">
            <span class="cte-control-icon material-symbols-outlined" aria-hidden="true">{{icon}}</span>
            <label ${{ '@for': 'inputId' }}>{{name}}</label>
          </div>
          <input
            type="range"
            step="1"
            ${{ '@id': 'inputId', '@min': 'min', '@max': 'max', value: 'value', '@data-theme-control': 'name', 'style.--cte-range-progress': 'progress', oninput: '^onControlInput' }}
          >
          <output ${{ '@data-theme-output': 'name' }}>{{value}}</output>
        </div>
      </template>
    </div>

    <details class="cte-details">
      <summary>
        <span class="material-symbols-outlined" aria-hidden="true">data_object</span>
        Parameters
      </summary>
      <pre class="cte-params" ref="params">{{params}}</pre>
    </details>
  </section>
`;
