// Empty shim — three.js is not needed in the demo (XR features only).
// All three.js imports resolve to this no-op module at build time.
export default {};
export const Scene = class {};
export const PerspectiveCamera = class {};
export const WebGLRenderer = class {};
export const Vector3 = class { constructor() { this.x = 0; this.y = 0; this.z = 0; } set() { return this; } copy() { return this; } };
export const Quaternion = class { constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; } };
export const Color = class { constructor() {} set() { return this; } };
export const Group = class { add() {} remove() {} };
export const Mesh = class { constructor() { this.position = new Vector3(); this.rotation = { x: 0, y: 0, z: 0 }; } };
export const BoxGeometry = class {};
export const SphereGeometry = class {};
export const MeshBasicMaterial = class {};
export const MeshStandardMaterial = class {};
export const LineBasicMaterial = class {};
export const BufferGeometry = class {};
export const Line = class { constructor() { this.position = new Vector3(); } };
export const Raycaster = class { setFromCamera() {} intersectObjects() { return []; } };
export const Clock = class { getDelta() { return 0; } getElapsedTime() { return 0; } };
export const Object3D = class { add() {} remove() {} };
export const Matrix4 = class {};
export const Euler = class {};
