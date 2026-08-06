import Symbiote from '@symbiotejs/symbiote';
import template from './DatePicker.tpl.js';
import css from './DatePicker.css.js';

class DatePicker extends Symbiote {
  static observedAttributes = ['value', 'disabled', 'name', 'placeholder'];

  #isOpen = false;
  #currentDate = new Date();
  #viewDate = new Date();

  #onTriggerClick = (event) => {
    if (this.disabled) return;
    this.#isOpen ? this.close() : this.open();
  };

  #onOutsideClick = (event) => {
    if (this.#isOpen && !this.contains(event.target)) {
      this.close();
    }
  };

  #onPrevMonth = (event) => {
    event.stopPropagation();
    this.#viewDate.setMonth(this.#viewDate.getMonth() - 1);
    this.#renderCalendar();
  };

  #onNextMonth = (event) => {
    event.stopPropagation();
    this.#viewDate.setMonth(this.#viewDate.getMonth() + 1);
    this.#renderCalendar();
  };

  #onGridKeyDown = (event) => {
    const cell = event.target.closest('[role="gridcell"]');
    if (!cell) return;
    const current = cell.dataset.value;

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        this.#moveFocus(current, 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.#moveFocus(current, -1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.#moveFocus(current, 7);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.#moveFocus(current, -7);
        break;
      case 'Home': {
        event.preventDefault();
        const base = this.#parseDateValue(current);
        if (base) this.#moveFocus(current, -base.getDay());
        break;
      }
      case 'End': {
        event.preventDefault();
        const base = this.#parseDateValue(current);
        if (base) this.#moveFocus(current, 6 - base.getDay());
        break;
      }
      case 'PageUp': {
        event.preventDefault();
        const base = this.#parseDateValue(current) || new Date(this.#viewDate);
        this.#focusDate(new Date(base.getFullYear(), base.getMonth() - 1, base.getDate()));
        break;
      }
      case 'PageDown': {
        event.preventDefault();
        const base = this.#parseDateValue(current) || new Date(this.#viewDate);
        this.#focusDate(new Date(base.getFullYear(), base.getMonth() + 1, base.getDate()));
        break;
      }
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.#selectDay(cell);
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        this.ref.trigger?.focus();
        break;
      default:
        break;
    }
  };

  #onTriggerKeyDown = (event) => {
    if (this.disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open();
    } else if (event.key === 'Escape' && this.#isOpen) {
      event.preventDefault();
      this.close();
    }
  };

  constructor() {
    super();
    this.init$ = {
      displayLabel: '',
      calendarTitle: '',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.trigger?.addEventListener('click', this.#onTriggerClick);
    this.ref.trigger?.addEventListener('keydown', this.#onTriggerKeyDown);
    this.ref.prevBtn?.addEventListener('click', this.#onPrevMonth);
    this.ref.nextBtn?.addEventListener('click', this.#onNextMonth);
    this.ref.calendarGrid?.addEventListener('keydown', this.#onGridKeyDown);
    document.addEventListener('click', this.#onOutsideClick);

    this.#syncValue();
    this.#renderCalendar();
  }

  disconnectedCallback() {
    this.ref.trigger?.removeEventListener('click', this.#onTriggerClick);
    this.ref.trigger?.removeEventListener('keydown', this.#onTriggerKeyDown);
    this.ref.prevBtn?.removeEventListener('click', this.#onPrevMonth);
    this.ref.nextBtn?.removeEventListener('click', this.#onNextMonth);
    this.ref.calendarGrid?.removeEventListener('keydown', this.#onGridKeyDown);
    document.removeEventListener('click', this.#onOutsideClick);
    super.disconnectedCallback?.();
  }

  get value() {
    return this.getAttribute('value') || '';
  }

  set value(val) {
    this.setAttribute('value', String(val));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  get placeholder() {
    return this.getAttribute('placeholder') || 'Select date...';
  }

  set placeholder(val) {
    this.setAttribute('placeholder', String(val));
  }

  get name() {
    return this.getAttribute('name') || '';
  }

  set name(val) {
    this.setAttribute('name', String(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'value') {
      this.#syncValue();
      this.#renderCalendar();
    } else {
      this.#syncControlAttributes();
      if (name === 'placeholder' && !this.value) {
        this.$.displayLabel = this.placeholder;
      }
    }
  }

  open() {
    if (this.disabled || this.#isOpen) return;
    this.#isOpen = true;
    this.ref.trigger?.setAttribute('aria-expanded', 'true');
    this.ref.dropdown?.setAttribute('data-visible', '');
    this.#renderCalendar();
    const focusTarget = this.ref.calendarGrid?.querySelector('[role="gridcell"][tabindex="0"]');
    focusTarget?.focus();
    this.dispatchEvent(new CustomEvent('sn-date-picker-open', { bubbles: true, composed: true }));
  }

  close() {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.ref.trigger?.setAttribute('aria-expanded', 'false');
    this.ref.dropdown?.removeAttribute('data-visible');
    this.dispatchEvent(new CustomEvent('sn-date-picker-close', { bubbles: true, composed: true }));
  }

  #syncValue() {
    const val = this.value;
    if (val) {
      const parsed = this.#parseDateValue(val);
      if (parsed) {
        this.#currentDate = parsed;
        this.#viewDate = new Date(parsed);
        this.$.displayLabel = val;
        if (this.ref.nativeInput) {
          this.ref.nativeInput.value = val;
        }
        this.#syncControlAttributes();
        return;
      }
    }
    this.$.displayLabel = this.placeholder;
    if (this.ref.nativeInput) {
      this.ref.nativeInput.value = '';
    }
    this.#syncControlAttributes();
  }

  #syncControlAttributes() {
    if (!this.ref.nativeInput) return;
    this.ref.nativeInput.disabled = this.disabled;
    this.ref.nativeInput.name = this.name;
    this.ref.nativeInput.placeholder = this.placeholder;
  }

  #parseDateValue(val) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(val));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      return null;
    }
    return parsed;
  }

  #renderCalendar() {
    const grid = this.ref.calendarGrid;
    if (!grid) return;

    grid.innerHTML = '';

    const year = this.#viewDate.getFullYear();
    const month = this.#viewDate.getMonth();

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    this.$.calendarTitle = `${monthNames[month]} ${year}`;
    grid.setAttribute('aria-label', this.$.calendarTitle);

    // Weekday header row
    const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const headerRow = document.createElement('div');
    headerRow.className = 'sn-calendar-row';
    headerRow.setAttribute('role', 'row');
    weekdays.forEach((day, i) => {
      const header = document.createElement('div');
      header.className = 'sn-calendar-weekday';
      header.setAttribute('role', 'columnheader');
      header.setAttribute('aria-label', weekdayNames[i]);
      header.textContent = day;
      headerRow.appendChild(header);
    });
    grid.appendChild(headerRow);

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    // Flatten all 42 cells, then split into week rows.
    const cells = [];
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      cells.push(this.#createDayCell(prevMonthTotalDays - i, true));
    }
    for (let i = 1; i <= totalDays; i++) {
      cells.push(this.#createDayCell(i, false));
    }
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push(this.#createDayCell(i, true));
    }

    for (let i = 0; i < cells.length; i += 7) {
      const row = document.createElement('div');
      row.className = 'sn-calendar-row';
      row.setAttribute('role', 'row');
      for (const cell of cells.slice(i, i + 7)) {
        row.appendChild(cell);
      }
      grid.appendChild(row);
    }

    this.#setRovingTabStop();
  }

  // Place the roving tabindex on the selected day, else today, else the first
  // selectable day of the view. Only one gridcell is in the tab order.
  #setRovingTabStop() {
    const grid = this.ref.calendarGrid;
    if (!grid) return;
    const cells = grid.querySelectorAll('[role="gridcell"]:not([aria-disabled="true"])');
    cells.forEach((cell) => cell.setAttribute('tabindex', '-1'));
    if (!cells.length) return;
    const target =
      grid.querySelector('[role="gridcell"][aria-selected="true"]') ||
      grid.querySelector('[role="gridcell"][aria-current="date"]') ||
      cells[0];
    target.setAttribute('tabindex', '0');
  }

  #createDayCell(day, isOtherMonth) {
    const cell = document.createElement('div');
    cell.className = 'sn-calendar-day';
    cell.setAttribute('role', 'gridcell');
    cell.textContent = String(day);
    if (isOtherMonth) {
      cell.setAttribute('data-other-month', '');
      cell.setAttribute('aria-disabled', 'true');
    }

    const monthOffset = isOtherMonth ? (day > 15 ? -1 : 1) : 0;
    const cellDate = new Date(this.#viewDate.getFullYear(), this.#viewDate.getMonth() + monthOffset, day);

    const cellValue = this.#formatDate(cellDate);
    cell.dataset.value = cellValue;
    cell.setAttribute('aria-label', this.#formatAriaDate(cellDate));

    if (!isOtherMonth && this.value === cellValue) {
      cell.setAttribute('data-selected', '');
      cell.setAttribute('aria-selected', 'true');
    } else {
      cell.setAttribute('aria-selected', 'false');
    }

    if (!isOtherMonth && cellValue === this.#formatDate(new Date())) {
      cell.setAttribute('aria-current', 'date');
    }

    cell.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#selectDay(cell);
    });

    return cell;
  }

  #selectDay(cell) {
    if (this.disabled || cell.getAttribute('aria-disabled') === 'true') return;
    const cellValue = cell.dataset.value;
    const oldValue = this.value;
    this.value = cellValue;
    this.close();
    this.ref.trigger?.focus();

    if (oldValue !== cellValue) {
      const detail = { value: cellValue };
      this.dispatchEvent(new CustomEvent('sn-control-change', { bubbles: true, composed: true, detail }));
      this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true, detail }));
    }
  }

  // Move day focus by a number of days, changing month if the move crosses a
  // boundary. Keeps the roving tabindex on the focused day.
  #moveFocus(currentValue, deltaDays) {
    const base = this.#parseDateValue(currentValue) || new Date(this.#viewDate);
    const target = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
    this.#focusDate(target);
  }

  #focusDate(target) {
    if (
      target.getMonth() !== this.#viewDate.getMonth() ||
      target.getFullYear() !== this.#viewDate.getFullYear()
    ) {
      this.#viewDate = new Date(target.getFullYear(), target.getMonth(), 1);
      this.#renderCalendar();
    }
    const targetValue = this.#formatDate(target);
    const grid = this.ref.calendarGrid;
    const cell = grid?.querySelector(`[role="gridcell"][data-value="${targetValue}"]:not([data-other-month])`);
    if (cell) {
      grid.querySelectorAll('[role="gridcell"]').forEach((c) => c.setAttribute('tabindex', '-1'));
      cell.setAttribute('tabindex', '0');
      cell.focus();
    }
  }

  #formatAriaDate(date) {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  #formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

DatePicker.template = template;
DatePicker.rootStyles = css;
DatePicker.reg('sn-date-picker');

export default DatePicker;
