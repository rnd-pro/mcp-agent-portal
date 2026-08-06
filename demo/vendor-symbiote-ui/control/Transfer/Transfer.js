import Symbiote from '@symbiotejs/symbiote';
import template from './Transfer.tpl.js';
import css from './Transfer.css.js';

class Transfer extends Symbiote {
  static observedAttributes = ['disabled', 'value', 'source-title', 'target-title'];

  #sourceItems = []; // Array of { value, label, selected }
  #targetItems = []; // Array of { value, label, selected }
  #instanceId = `sn-transfer-${Math.random().toString(36).slice(2, 9)}`;

  #onToTarget = () => {
    if (this.disabled) return;
    const moving = this.#sourceItems.filter(item => item.selected);
    if (moving.length === 0) return;

    moving.forEach(item => {
      item.selected = false;
    });

    this.#sourceItems = this.#sourceItems.filter(item => !moving.includes(item));
    this.#targetItems = [...this.#targetItems, ...moving];

    this.#renderLists();
    this.#emitChange();
  };

  #onToSource = () => {
    if (this.disabled) return;
    const moving = this.#targetItems.filter(item => item.selected);
    if (moving.length === 0) return;

    moving.forEach(item => {
      item.selected = false;
    });

    this.#targetItems = this.#targetItems.filter(item => !moving.includes(item));
    this.#sourceItems = [...this.#sourceItems, ...moving];

    this.#renderLists();
    this.#emitChange();
  };

  constructor() {
    super();
    this.init$ = {
      sourceTitle: 'Source',
      targetTitle: 'Target',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.toTargetBtn?.addEventListener('click', this.#onToTarget);
    this.ref.toSourceBtn?.addEventListener('click', this.#onToSource);

    this.$.sourceTitle = this.getAttribute('source-title') || 'Source';
    this.$.targetTitle = this.getAttribute('target-title') || 'Target';

    if (this.ref.sourceHeader && this.ref.sourceList) {
      this.ref.sourceHeader.id = `${this.#instanceId}-source-title`;
      this.ref.sourceList.setAttribute('aria-labelledby', this.ref.sourceHeader.id);
    }
    if (this.ref.targetHeader && this.ref.targetList) {
      this.ref.targetHeader.id = `${this.#instanceId}-target-title`;
      this.ref.targetList.setAttribute('aria-labelledby', this.ref.targetHeader.id);
    }

    this.#parseChildren();
    this.#renderLists();
  }

  disconnectedCallback() {
    this.ref.toTargetBtn?.removeEventListener('click', this.#onToTarget);
    this.ref.toSourceBtn?.removeEventListener('click', this.#onToSource);
    super.disconnectedCallback?.();
  }

  get value() {
    return this.#targetItems.map(item => item.value).join(',');
  }

  set value(val) {
    const targetVals = String(val || '').split(',').filter(Boolean);
    const all = [...this.#sourceItems, ...this.#targetItems];

    this.#targetItems = all.filter(item => targetVals.includes(item.value));
    this.#sourceItems = all.filter(item => !targetVals.includes(item.value));

    this.#renderLists();
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
    this.#renderLists();
  }

  setData(data = {}) {
    if (data.source) {
      this.#sourceItems = data.source.map(item => ({
        value: typeof item === 'string' ? item : item.value,
        label: typeof item === 'string' ? item : item.label,
        selected: false
      }));
    }
    if (data.target) {
      this.#targetItems = data.target.map(item => ({
        value: typeof item === 'string' ? item : item.value,
        label: typeof item === 'string' ? item : item.label,
        selected: false
      }));
    }
    this.#renderLists();
  }

  #parseChildren() {
    const optionElements = Array.from(this.querySelectorAll('option'));
    if (optionElements.length > 0) {
      this.#sourceItems = optionElements.map(opt => ({
        value: opt.value || opt.textContent.trim(),
        label: opt.textContent.trim(),
        selected: false
      }));
    }
  }

  #renderLists() {
    this.#renderList(this.ref.sourceList, this.#sourceItems, 'source');
    this.#renderList(this.ref.targetList, this.#targetItems, 'target');

    this.setAttribute('aria-disabled', this.disabled ? 'true' : 'false');

    // Update buttons disabled status
    const sourceSelected = this.#sourceItems.some(item => item.selected);
    const targetSelected = this.#targetItems.some(item => item.selected);

    if (this.ref.toTargetBtn) {
      this.ref.toTargetBtn.disabled = this.disabled || !sourceSelected;
    }
    if (this.ref.toSourceBtn) {
      this.ref.toSourceBtn.disabled = this.disabled || !targetSelected;
    }
  }

  #renderList(container, items, type) {
    if (!container) return;
    container.innerHTML = '';

    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'sn-transfer-item';
      li.setAttribute('data-value', item.value);
      li.role = 'option';
      li.setAttribute('aria-selected', item.selected ? 'true' : 'false');
      li.tabIndex = this.disabled ? -1 : 0;
      if (this.disabled) {
        li.setAttribute('aria-disabled', 'true');
      }
      if (item.selected) {
        li.setAttribute('data-selected', '');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.selected;
      checkbox.disabled = this.disabled;
      checkbox.tabIndex = -1;
      checkbox.setAttribute('aria-hidden', 'true');
      checkbox.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      checkbox.addEventListener('change', (event) => {
        event.stopPropagation();
        item.selected = checkbox.checked;
        this.#renderLists();
      });

      const label = document.createElement('span');
      label.textContent = item.label;

      li.appendChild(checkbox);
      li.appendChild(label);

      const toggle = (event) => {
        event.stopPropagation();
        if (this.disabled) return;
        item.selected = !item.selected;
        this.#renderLists();
      };

      li.addEventListener('click', toggle);
      li.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          toggle(event);
        }
      });

      container.appendChild(li);
    });
  }

  #emitChange() {
    const val = this.value;
    const detail = { value: val };
    this.dispatchEvent(new CustomEvent('sn-control-change', { bubbles: true, composed: true, detail }));
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true, detail }));
  }
}

Transfer.template = template;
Transfer.rootStyles = css;
Transfer.reg('sn-transfer');

export default Transfer;
