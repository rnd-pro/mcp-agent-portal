const EPSILON = 1e-10;

export function isFiniteVector(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

export function isFiniteMatrix4(value) {
  return isFiniteVector(value, 16);
}

export function addVectors(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtractVectors(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vectorLength(value) {
  return Math.hypot(value[0], value[1], value[2]);
}

export function distance(a, b) {
  return vectorLength(subtractVectors(a, b));
}

export function normalizeVector(value) {
  let length = vectorLength(value);
  if (length <= EPSILON) return null;
  return value.map((component) => component / length);
}

export function normalizeQuaternion(value) {
  if (!isFiniteVector(value, 4)) return null;
  let length = Math.hypot(...value);
  if (length <= EPSILON) return null;
  return value.map((component) => component / length);
}

export function isNormalizedQuaternion(value, tolerance = 1e-6) {
  if (!isFiniteVector(value, 4)) return false;
  return Math.abs(Math.hypot(...value) - 1) <= tolerance;
}

export function multiplyMatrices(a, b) {
  if (!isFiniteMatrix4(a) || !isFiniteMatrix4(b)) {
    throw new TypeError('multiplyMatrices requires two finite column-major matrices.');
  }
  let result = new Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += a[index * 4 + row] * b[column * 4 + index];
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
}

export function multiplyMatrixVector4(matrix, vector) {
  if (!isFiniteMatrix4(matrix) || !isFiniteVector(vector, 4)) {
    throw new TypeError('multiplyMatrixVector4 requires a finite matrix and vector.');
  }
  let [x, y, z, w] = vector;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w,
  ];
}

export function multiplyMatrixVector(matrix, vector) {
  if (!isFiniteVector(vector, 3)) {
    throw new TypeError('multiplyMatrixVector requires a finite three-component vector.');
  }
  let result = multiplyMatrixVector4(matrix, [...vector, 1]);
  if (Math.abs(result[3]) <= EPSILON) {
    throw new RangeError('Point transform produced an invalid homogeneous coordinate.');
  }
  return result.slice(0, 3).map((component) => component / result[3]);
}

export function invertMatrix(matrix) {
  if (!isFiniteMatrix4(matrix)) {
    throw new TypeError('invertMatrix requires a finite column-major matrix.');
  }
  let a00 = matrix[0];
  let a01 = matrix[1];
  let a02 = matrix[2];
  let a03 = matrix[3];
  let a10 = matrix[4];
  let a11 = matrix[5];
  let a12 = matrix[6];
  let a13 = matrix[7];
  let a20 = matrix[8];
  let a21 = matrix[9];
  let a22 = matrix[10];
  let a23 = matrix[11];
  let a30 = matrix[12];
  let a31 = matrix[13];
  let a32 = matrix[14];
  let a33 = matrix[15];
  let b00 = a00 * a11 - a01 * a10;
  let b01 = a00 * a12 - a02 * a10;
  let b02 = a00 * a13 - a03 * a10;
  let b03 = a01 * a12 - a02 * a11;
  let b04 = a01 * a13 - a03 * a11;
  let b05 = a02 * a13 - a03 * a12;
  let b06 = a20 * a31 - a21 * a30;
  let b07 = a20 * a32 - a22 * a30;
  let b08 = a20 * a33 - a23 * a30;
  let b09 = a21 * a32 - a22 * a31;
  let b10 = a21 * a33 - a23 * a31;
  let b11 = a22 * a33 - a23 * a32;
  let determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= EPSILON) return null;
  let inverseDeterminant = 1 / determinant;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * inverseDeterminant,
    (a02 * b10 - a01 * b11 - a03 * b09) * inverseDeterminant,
    (a31 * b05 - a32 * b04 + a33 * b03) * inverseDeterminant,
    (a22 * b04 - a21 * b05 - a23 * b03) * inverseDeterminant,
    (a12 * b08 - a10 * b11 - a13 * b07) * inverseDeterminant,
    (a00 * b11 - a02 * b08 + a03 * b07) * inverseDeterminant,
    (a32 * b02 - a30 * b05 - a33 * b01) * inverseDeterminant,
    (a20 * b05 - a22 * b02 + a23 * b01) * inverseDeterminant,
    (a10 * b10 - a11 * b08 + a13 * b06) * inverseDeterminant,
    (a01 * b08 - a00 * b10 - a03 * b06) * inverseDeterminant,
    (a30 * b04 - a31 * b02 + a33 * b00) * inverseDeterminant,
    (a21 * b02 - a20 * b04 - a23 * b00) * inverseDeterminant,
    (a11 * b07 - a10 * b09 - a12 * b06) * inverseDeterminant,
    (a00 * b09 - a01 * b07 + a02 * b06) * inverseDeterminant,
    (a31 * b01 - a30 * b03 - a32 * b00) * inverseDeterminant,
    (a20 * b03 - a21 * b01 + a22 * b00) * inverseDeterminant,
  ];
}

export function makeTranslation(x, y, z) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

export function makeRotationX(radians) {
  let cosine = Math.cos(radians);
  let sine = Math.sin(radians);
  return [1, 0, 0, 0, 0, cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1];
}

export function makeRotationY(radians) {
  let cosine = Math.cos(radians);
  let sine = Math.sin(radians);
  return [cosine, 0, -sine, 0, 0, 1, 0, 0, sine, 0, cosine, 0, 0, 0, 0, 1];
}

export function makeRotationZ(radians) {
  let cosine = Math.cos(radians);
  let sine = Math.sin(radians);
  return [cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function makeRotationFromQuaternion(value) {
  let quaternion = normalizeQuaternion(value);
  if (!quaternion) throw new TypeError('A finite non-zero quaternion is required.');
  let [x, y, z, w] = quaternion;
  let xx = x * x;
  let yy = y * y;
  let zz = z * z;
  let xy = x * y;
  let xz = x * z;
  let yz = y * z;
  let wx = w * x;
  let wy = w * y;
  let wz = w * z;
  return [
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    0, 0, 0, 1,
  ];
}

export function makeTransform(position, quaternion) {
  if (!isFiniteVector(position, 3)) throw new TypeError('A finite position is required.');
  let matrix = makeRotationFromQuaternion(quaternion);
  matrix[12] = position[0];
  matrix[13] = position[1];
  matrix[14] = position[2];
  return matrix;
}

export function multiplyQuaternions(a, b) {
  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function eulerToQuaternion(rx, ry, rz) {
  let x = [Math.sin(rx / 2), 0, 0, Math.cos(rx / 2)];
  let y = [0, Math.sin(ry / 2), 0, Math.cos(ry / 2)];
  let z = [0, 0, Math.sin(rz / 2), Math.cos(rz / 2)];
  return normalizeQuaternion(multiplyQuaternions(z, multiplyQuaternions(y, x)));
}

export function makeTransformEuler(position, rx, ry, rz) {
  return multiplyMatrices(
    makeTranslation(...position),
    multiplyMatrices(makeRotationZ(rz), multiplyMatrices(makeRotationY(ry), makeRotationX(rx))),
  );
}

export function quaternionFromMatrix(matrix) {
  if (!isFiniteMatrix4(matrix)) return null;
  let scaleX = Math.hypot(matrix[0], matrix[1], matrix[2]);
  let scaleY = Math.hypot(matrix[4], matrix[5], matrix[6]);
  let scaleZ = Math.hypot(matrix[8], matrix[9], matrix[10]);
  if (scaleX <= EPSILON || scaleY <= EPSILON || scaleZ <= EPSILON) return null;
  let m00 = matrix[0] / scaleX;
  let m01 = matrix[4] / scaleY;
  let m02 = matrix[8] / scaleZ;
  let m10 = matrix[1] / scaleX;
  let m11 = matrix[5] / scaleY;
  let m12 = matrix[9] / scaleZ;
  let m20 = matrix[2] / scaleX;
  let m21 = matrix[6] / scaleY;
  let m22 = matrix[10] / scaleZ;
  let trace = m00 + m11 + m22;
  let x;
  let y;
  let z;
  let w;
  if (trace > 0) {
    let scale = Math.sqrt(trace + 1) * 2;
    w = 0.25 * scale;
    x = (m21 - m12) / scale;
    y = (m02 - m20) / scale;
    z = (m10 - m01) / scale;
  } else if (m00 > m11 && m00 > m22) {
    let scale = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / scale;
    x = 0.25 * scale;
    y = (m01 + m10) / scale;
    z = (m02 + m20) / scale;
  } else if (m11 > m22) {
    let scale = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / scale;
    x = (m01 + m10) / scale;
    y = 0.25 * scale;
    z = (m12 + m21) / scale;
  } else {
    let scale = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / scale;
    x = (m02 + m20) / scale;
    y = (m12 + m21) / scale;
    z = 0.25 * scale;
  }
  return normalizeQuaternion([x, y, z, w]);
}

export function poseFromMatrix(matrix) {
  let quaternion = quaternionFromMatrix(matrix);
  if (!quaternion) return null;
  return {
    position: [matrix[12], matrix[13], matrix[14]],
    quaternion,
  };
}

export function relativeMatrix(rootMatrix, worldMatrix) {
  let rootInverse = invertMatrix(rootMatrix);
  if (!rootInverse) return null;
  return multiplyMatrices(rootInverse, worldMatrix);
}

export function shortestAngle(a, b) {
  let normalizedA = normalizeQuaternion(a);
  let normalizedB = normalizeQuaternion(b);
  if (!normalizedA || !normalizedB) return Number.NaN;
  let dot = normalizedA.reduce((sum, value, index) => sum + value * normalizedB[index], 0);
  let clamped = Math.min(1, Math.max(0, Math.abs(dot)));
  return 2 * Math.acos(clamped) * 180 / Math.PI;
}

export function getOBBWorldCorners(position, quaternion, size) {
  if (!isFiniteVector(size, 3) || size.some((value) => value <= 0)) {
    throw new TypeError('OBB size requires three positive finite values.');
  }
  let [x, y, z] = size.map((value) => value / 2);
  let local = [
    [-x, -y, -z], [x, -y, -z], [-x, y, -z], [x, y, -z],
    [-x, -y, z], [x, -y, z], [-x, y, z], [x, y, z],
  ];
  let matrix = makeTransform(position, quaternion);
  return local.map((corner) => multiplyMatrixVector(matrix, corner));
}

export function getOBBEdgeMidpoints(corners) {
  if (!Array.isArray(corners) || corners.length !== 8) {
    throw new TypeError('Eight ordered OBB corners are required.');
  }
  let edges = [
    [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
    [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7],
  ];
  return edges.map(([a, b]) => corners[a].map((value, index) => (value + corners[b][index]) / 2));
}

export function maximumCornerEdgeError(expectedCorners, observedCorners) {
  let expectedPoints = [...expectedCorners, ...getOBBEdgeMidpoints(expectedCorners)];
  let observedPoints = [...observedCorners, ...getOBBEdgeMidpoints(observedCorners)];
  return Math.max(...expectedPoints.map((point, index) => distance(point, observedPoints[index])));
}

export function getAABBFromCorners(corners) {
  if (!Array.isArray(corners) || corners.length === 0) {
    throw new TypeError('At least one corner is required.');
  }
  let minimum = [Infinity, Infinity, Infinity];
  let maximum = [-Infinity, -Infinity, -Infinity];
  for (let corner of corners) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], corner[axis]);
      maximum[axis] = Math.max(maximum[axis], corner[axis]);
    }
  }
  return {
    min: minimum,
    max: maximum,
    center: minimum.map((value, axis) => (value + maximum[axis]) / 2),
    size: minimum.map((value, axis) => maximum[axis] - value),
  };
}

export function getAABBForOBB(position, quaternion, size) {
  return getAABBFromCorners(getOBBWorldCorners(position, quaternion, size));
}
