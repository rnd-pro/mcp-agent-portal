export default /*css*/ `
sn-aspect-ratio {
  display: block;
  width: 100%;
}

.sn-aspect-ratio-box {
  position: relative;
  width: 100%;
  box-sizing: border-box;
}

.sn-aspect-ratio-box > ::slotted(*) {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
`;
