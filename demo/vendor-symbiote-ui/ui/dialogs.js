import { translate } from '../locale/index.js';

const dialogStyles = `
.sn-dialog {
  border: var(--sn-dialog-border-width) solid var(--sn-dialog-border);
  border-radius: var(--sn-dialog-radius);
  padding: 0;
  box-shadow: var(--sn-dialog-shadow);
  background: var(--sn-dialog-bg);
  color: var(--sn-dialog-color);
}

.sn-dialog::backdrop {
  background: var(--sn-dialog-backdrop);
}

.sn-dialog-body {
  padding: var(--sn-dialog-body-padding);
  font-family: var(--sn-font);
  font-size: var(--sn-dialog-font-size);
  min-width: var(--sn-dialog-min-width);
}

.sn-dialog-message {
  margin: 0 0 var(--sn-dialog-message-gap) 0;
  white-space: pre-wrap;
}

.sn-dialog-prompt .sn-dialog-message {
  margin-bottom: var(--sn-dialog-prompt-message-gap);
}

.sn-dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: var(--sn-field-control-padding);
  border: 1px solid var(--sn-field-control-border);
  border-radius: var(--sn-field-control-radius);
  background: var(--sn-field-control-bg);
  color: var(--sn-field-control-color);
  outline: none;
  font-family: inherit;
}

.sn-dialog-actions {
  display: flex;
  gap: var(--sn-dialog-actions-gap);
  justify-content: flex-end;
}

.sn-dialog-prompt .sn-dialog-actions {
  margin-top: var(--sn-dialog-actions-margin-block-start);
}

.sn-dialog-btn {
  background: var(--sn-button-bg);
  color: var(--sn-button-color);
  border: 1px solid var(--sn-button-border);
  padding: var(--sn-button-padding);
  border-radius: var(--sn-button-radius);
  cursor: pointer;
  font-size: var(--sn-button-font-size);
  font-weight: var(--sn-button-font-weight);
  line-height: var(--sn-button-line-height);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sn-button-gap);
  font-family: inherit;
  min-height: var(--sn-button-min-height);
  transition: var(--sn-effect-hover-transition);
}

.sn-dialog-btn:hover:not(:disabled) {
  background: var(--sn-button-hover-bg);
  border-color: var(--sn-button-hover-border);
}

.sn-dialog-btn:disabled {
  opacity: var(--sn-button-disabled-opacity);
  cursor: not-allowed;
}

.sn-dialog-btn-primary {
  background: var(--sn-button-primary-bg);
  border-color: var(--sn-button-primary-border);
  color: var(--sn-button-primary-color);
}

.sn-dialog-btn-danger {
  background: var(--sn-button-danger-bg);
  color: var(--sn-button-danger-color);
  border-color: var(--sn-button-danger-border);
}

.sn-dialog-btn-danger:hover:not(:disabled) {
  background: var(--sn-button-danger-hover-bg);
  border-color: var(--sn-button-danger-hover-border);
  color: var(--sn-button-danger-hover-color);
}
`;

function ensureDocument() {
  if (typeof document === 'undefined' || !document.createElement || !document.body) {
    throw new Error('Dialog helpers require a browser document.');
  }
  return document;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function closeDialog(dialog, resolve, value) {
  if (typeof dialog.close === 'function') {
    dialog.close();
  }
  dialog.remove();
  resolve(value);
}

function createButton(action, className, label) {
  let button = document.createElement('button');
  button.type = 'button';
  button.dataset.dialogAction = action;
  button.className = className;
  button.textContent = label;
  return button;
}

function createActions(...buttons) {
  let actions = document.createElement('div');
  actions.className = 'sn-dialog-actions';
  actions.append(...buttons);
  return actions;
}

function createMessage(message) {
  let el = document.createElement('p');
  el.className = 'sn-dialog-message';
  el.textContent = message;
  return el;
}

function createDialog(className) {
  let doc = ensureDocument();
  let dialog = doc.createElement('dialog');
  dialog.className = `sn-dialog ${className}`.trim();
  let style = doc.createElement('style');
  style.textContent = dialogStyles;
  dialog.appendChild(style);
  doc.body.appendChild(dialog);
  return dialog;
}

export function uiConfirm(message) {
  return new Promise((resolve) => {
    let dialog = createDialog('sn-dialog-confirm');
    let body = document.createElement('div');
    body.className = 'sn-dialog-body';
    body.append(
      createMessage(message),
      createActions(
        createButton('cancel', 'sn-dialog-btn', translate('dialog.cancel')),
        createButton('confirm', 'sn-dialog-btn sn-dialog-btn-danger', translate('dialog.confirm'))
      )
    );
    dialog.appendChild(body);
    openDialog(dialog);
    dialog.querySelector('[data-dialog-action="cancel"]').onclick = () => closeDialog(dialog, resolve, false);
    dialog.querySelector('[data-dialog-action="confirm"]').onclick = () => closeDialog(dialog, resolve, true);
  });
}

export function uiPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    let dialog = createDialog('sn-dialog-prompt');
    let body = document.createElement('div');
    body.className = 'sn-dialog-body';
    let input = document.createElement('input');
    input.type = 'text';
    input.dataset.dialogInput = '';
    input.className = 'sn-dialog-input';
    input.value = defaultValue;
    body.append(
      createMessage(message),
      input,
      createActions(
        createButton('cancel', 'sn-dialog-btn', translate('dialog.cancel')),
        createButton('confirm', 'sn-dialog-btn sn-dialog-btn-primary', translate('dialog.ok'))
      )
    );
    dialog.appendChild(body);
    openDialog(dialog);
    input.focus();
    input.onkeydown = (event) => {
      if (event.key === 'Enter') closeDialog(dialog, resolve, input.value);
    };
    dialog.querySelector('[data-dialog-action="cancel"]').onclick = () => closeDialog(dialog, resolve, null);
    dialog.querySelector('[data-dialog-action="confirm"]').onclick = () => closeDialog(dialog, resolve, input.value);
  });
}

export function uiAlert(message) {
  return new Promise((resolve) => {
    let dialog = createDialog('sn-dialog-alert');
    let body = document.createElement('div');
    body.className = 'sn-dialog-body';
    body.append(
      createMessage(message),
      createActions(createButton('ok', 'sn-dialog-btn sn-dialog-btn-primary', translate('dialog.ok')))
    );
    dialog.appendChild(body);
    openDialog(dialog);
    dialog.querySelector('[data-dialog-action="ok"]').onclick = () => closeDialog(dialog, resolve);
  });
}
