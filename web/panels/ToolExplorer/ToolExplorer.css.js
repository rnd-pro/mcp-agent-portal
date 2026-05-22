export default `
:host {
  display: block;
  height: 100%;
}

sn-list-detail-shell {
  height: 100%;
  --sn-list-detail-main-padding: 0;
}

.te-detail {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
}

.te-tools-grid {
  overflow-y: auto;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  align-content: start;
}
`;
