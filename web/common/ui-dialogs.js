export function uiConfirm(message) {
  return new Promise(resolve => {
    let d = document.createElement('dialog');
    d.innerHTML = `
      <div style="padding:20px; font-family:var(--sn-font, sans-serif); font-size:14px; min-width:250px;">
        <p style="margin:0 0 20px 0; white-space:pre-wrap;">${message}</p>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="dlg-no" class="ui-btn">Cancel</button>
          <button id="dlg-yes" class="ui-btn danger">Confirm</button>
        </div>
      </div>
    `;
    d.style.cssText = "border:1px solid var(--sn-node-border); border-radius:6px; padding:0; box-shadow:0 10px 30px rgba(0,0,0,0.3); background:var(--sn-panel-bg); color:var(--sn-text);";
    document.body.appendChild(d);
    d.showModal();
    const close = (val) => { d.close(); d.remove(); resolve(val); };
    d.querySelector('#dlg-no').onclick = () => close(false);
    d.querySelector('#dlg-yes').onclick = () => close(true);
  });
}

export function uiPrompt(message, defaultValue = '') {
  return new Promise(resolve => {
    let d = document.createElement('dialog');
    d.innerHTML = `
      <div style="padding:20px; font-family:var(--sn-font, sans-serif); font-size:14px; min-width:300px;">
        <p style="margin:0 0 10px 0; white-space:pre-wrap;">${message}</p>
        <input type="text" id="dlg-input" value="${defaultValue}" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid var(--sn-node-border); border-radius:4px; background:var(--sn-bg); color:var(--sn-text); outline:none; font-family:inherit;" />
        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
          <button id="dlg-no" class="ui-btn">Cancel</button>
          <button id="dlg-yes" class="ui-btn primary">OK</button>
        </div>
      </div>
    `;
    d.style.cssText = "border:1px solid var(--sn-node-border); border-radius:6px; padding:0; box-shadow:0 10px 30px rgba(0,0,0,0.3); background:var(--sn-panel-bg); color:var(--sn-text);";
    document.body.appendChild(d);
    d.showModal();
    const input = d.querySelector('#dlg-input');
    input.focus();
    const close = (val) => { d.close(); d.remove(); resolve(val); };
    input.onkeydown = e => { if (e.key === 'Enter') close(input.value); };
    d.querySelector('#dlg-no').onclick = () => close(null);
    d.querySelector('#dlg-yes').onclick = () => close(input.value);
  });
}
