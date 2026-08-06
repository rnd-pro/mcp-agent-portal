import { html } from '@symbiotejs/symbiote';

export function cascadeThemeActionButton({ action, className = '', icon, label, onClick, title = label }) {
  return html`
    <button type="button" class="${className}" data-action="${action}" title="${title}" aria-label="${label}" ${{ onclick: onClick }}>
      <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
    </button>
  `;
}

export function cascadeThemeModeControls({ className, darkPressed, lightPressed }) {
  return html`
    <div class="${className}" aria-label="Theme mode">
      <button type="button" data-theme-mode="dark" ${{ onclick: 'onModePick', '@aria-pressed': darkPressed }}>Dark</button>
      <button type="button" data-theme-mode="light" ${{ onclick: 'onModePick', '@aria-pressed': lightPressed }}>Light</button>
    </div>
  `;
}

export function cascadeThemeVariantControls({ className, modernPressed, classicPressed }) {
  return html`
    <div class="${className}" aria-label="Theme variant">
      <button type="button" data-theme-variant="modern" ${{ onclick: 'onVariantPick', '@aria-pressed': modernPressed }}>Modern</button>
      <button type="button" data-theme-variant="classic" ${{ onclick: 'onVariantPick', '@aria-pressed': classicPressed }}>Classic</button>
    </div>
  `;
}

export function cascadeThemeTabShapeControls({ className, framePressed, earPressed, classicEarPressed }) {
  return html`
    <div class="${className}" aria-label="Tab shape">
      <button type="button" data-tab-shape="frame" ${{ onclick: 'onTabShapePick', '@aria-pressed': framePressed }}>Frame</button>
      <button type="button" data-tab-shape="ear" ${{ onclick: 'onTabShapePick', '@aria-pressed': earPressed }}>Ear</button>
      <button type="button" data-tab-shape="classic-ear" ${{ onclick: 'onTabShapePick', '@aria-pressed': classicEarPressed }}>Classic ear</button>
    </div>
  `;
}

export function cascadeThemeLocaleControls({
  className,
  hidden = '!hasLocale',
  enPressed,
  ruPressed,
  esPressed,
}) {
  return html`
    <div class="${className}" aria-label="Language" ${{ '@hidden': hidden }}>
      <button type="button" data-locale="en" ${{ onclick: 'onLocalePick', '@aria-pressed': enPressed }}>EN</button>
      <button type="button" data-locale="ru" ${{ onclick: 'onLocalePick', '@aria-pressed': ruPressed }}>RU</button>
      <button type="button" data-locale="es" ${{ onclick: 'onLocalePick', '@aria-pressed': esPressed }}>ES</button>
    </div>
  `;
}

export function cascadeThemeRegisterControls({
  className,
  defaultPressed,
  productPressed,
  toolPressed,
  spaciousPressed,
}) {
  return html`
    <div class="${className}" aria-label="Geometry register">
      <button type="button" data-geometry-register="" ${{ onclick: 'onRegisterPick', '@aria-pressed': defaultPressed }}>Default</button>
      <button type="button" data-geometry-register="product" ${{ onclick: 'onRegisterPick', '@aria-pressed': productPressed }}>Product</button>
      <button type="button" data-geometry-register="tool" ${{ onclick: 'onRegisterPick', '@aria-pressed': toolPressed }}>Tool</button>
      <button type="button" data-geometry-register="spacious" ${{ onclick: 'onRegisterPick', '@aria-pressed': spaciousPressed }}>Spacious</button>
    </div>
  `;
}

export function cascadeThemeTargetControls({
  className,
  listClassName,
  targetClassName,
  labelClassName,
  targetItemClassName = '',
  hidden = '!hasTargets',
  onTargetPick = '^onTargetPick',
  includeRemove = false,
  removeClassName = '',
  removeHidden = 'removeHidden',
  onTargetRemove = '^onTargetRemove',
  includePick = false,
  pickClassName = '',
  pickHidden = '!pickable',
  pickPressed = 'picking',
  onPickStart = 'onPickStart',
  includeApplyAll = false,
  applyAllClassName = '',
  applyAllHidden = '!hasTargets',
  onApplyAll = 'onApplyAll',
}) {
  return html`
    <div class="${className}" aria-label="Theme target" ${{ '@hidden': hidden }}>
      <div class="${listClassName}" itemize="targets">
        <template>
          ${includeRemove ? html`
            <div class="${targetItemClassName}">
              <button type="button" class="${targetClassName}" ${{ onclick: onTargetPick, '@data-target-id': 'id', '@aria-pressed': 'active', title: 'hint' }}>
                <span class="material-symbols-outlined" aria-hidden="true">{{icon}}</span>
                <span class="${labelClassName}">{{label}}</span>
              </button>
              <button type="button" class="${removeClassName}" ${{ onclick: onTargetRemove, '@data-target-id': 'id', '@hidden': removeHidden, title: 'removeLabel', '@aria-label': 'removeLabel' }}>
                <span class="material-symbols-outlined" aria-hidden="true">delete</span>
              </button>
            </div>
          ` : html`
            <button type="button" class="${targetClassName}" ${{ onclick: onTargetPick, '@data-target-id': 'id', '@aria-pressed': 'active', title: 'hint' }}>
              <span class="material-symbols-outlined" aria-hidden="true">{{icon}}</span>
              <span class="${labelClassName}">{{label}}</span>
            </button>
          `}
        </template>
      </div>
      ${includePick ? html`
        <button type="button" class="${pickClassName}" ${{ onclick: onPickStart, '@aria-pressed': pickPressed, '@hidden': pickHidden }} title="Pick theme target" aria-label="Pick theme target">
          <span class="material-symbols-outlined" aria-hidden="true">colorize</span>
        </button>
      ` : ''}
      ${includeApplyAll ? html`
        <button type="button" class="${applyAllClassName}" ${{ onclick: onApplyAll, '@hidden': applyAllHidden }} title="Apply active theme to all targets" aria-label="Apply active theme to all targets">
          <span class="material-symbols-outlined" aria-hidden="true">select_all</span>
        </button>
      ` : ''}
    </div>
  `;
}
