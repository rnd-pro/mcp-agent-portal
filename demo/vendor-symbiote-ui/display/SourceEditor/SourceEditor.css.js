export default `
:host {
  display: block;
}

source-editor {
  display: block;
  height: 100%;
  min-height: 0;
}

source-editor textarea {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  border: 0;
  outline: 0;
  resize: none;
  padding: var(--sn-source-editor-padding);
  background: var(--sn-source-editor-bg);
  color: var(--sn-source-editor-color);
  font-family: var(--sn-font-mono);
  font-size: var(--sn-source-editor-font-size);
  line-height: var(--sn-source-editor-line-height);
  tab-size: var(--sn-source-editor-tab-size);
}

source-editor textarea::placeholder {
  color: var(--sn-source-editor-placeholder-color);
}

source-editor textarea:disabled,
source-editor textarea[readonly] {
  cursor: default;
  opacity: 0.82;
}
`;
