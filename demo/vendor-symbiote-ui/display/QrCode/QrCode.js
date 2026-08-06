import Symbiote from '@symbiotejs/symbiote';
import template from './QrCode.tpl.js';
import css from './QrCode.css.js';

const QR_LOW_ECC_SPECS = [
  { version: 1, size: 21, dataCodewords: 19, errorCodewords: 7, alignment: [] },
  { version: 2, size: 25, dataCodewords: 34, errorCodewords: 10, alignment: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, errorCodewords: 15, alignment: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, errorCodewords: 20, alignment: [6, 26] },
];

/**
 * Renderable SVG QR code generator element.
 */
class QrCode extends Symbiote {
  static observedAttributes = ['value'];

  constructor() {
    super();
    this.init$ = {
      value: '',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.#syncValue();
  }

  get value() {
    return this.getAttribute('value') || '';
  }

  set value(val) {
    this.setAttribute('value', String(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'value') {
      this.#syncValue();
    }
  }

  #syncValue() {
    const val = this.value;
    this.$.value = val;
    this.#renderQr(val);
  }

  #renderQr(text) {
    const svg = this.ref.svg;
    if (!svg) return;

    svg.innerHTML = '';
    svg.removeAttribute('data-error');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', text ? `QR code for ${text}` : 'QR code');

    if (!text) {
      svg.setAttribute('viewBox', '0 0 21 21');
      return;
    }

    try {
      this.#renderMatrix(svg, this.#createQrMatrix(text));
    } catch (error) {
      svg.setAttribute('viewBox', '0 0 21 21');
      svg.setAttribute('data-error', '');
      this.dispatchEvent(new CustomEvent('sn-qr-error', {
        bubbles: true,
        composed: true,
        detail: { value: text, error: error.message },
      }));
    }
  }

  #createQrMatrix(text) {
    const bytes = [...new TextEncoder().encode(text)];
    const spec = this.#selectVersion(bytes);
    if (!spec) {
      throw new RangeError('QR value is too long for the built-in encoder.');
    }

    const { matrix, functionModules } = this.#createBaseMatrix(spec);
    const codewords = this.#encodeCodewords(bytes, spec);
    this.#drawCodewords(matrix, functionModules, codewords);

    let bestMatrix = null;
    let bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const candidate = matrix.map((row) => row.slice());
      this.#applyMask(candidate, functionModules, mask);
      this.#drawFormatBits(candidate, functionModules, mask);
      const penalty = this.#scoreMatrix(candidate);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestMatrix = candidate;
      }
    }
    return bestMatrix;
  }

  #selectVersion(bytes) {
    return QR_LOW_ECC_SPECS.find((spec) => {
      const bitLength = 4 + 8 + bytes.length * 8;
      return bitLength <= spec.dataCodewords * 8;
    }) || null;
  }

  #encodeCodewords(bytes, spec) {
    const bits = [];
    const appendBits = (value, length) => {
      for (let i = length - 1; i >= 0; i--) {
        bits.push(((value >>> i) & 1) === 1);
      }
    };

    appendBits(0b0100, 4);
    appendBits(bytes.length, 8);
    for (let byte of bytes) {
      appendBits(byte, 8);
    }

    const capacityBits = spec.dataCodewords * 8;
    const terminator = Math.min(4, capacityBits - bits.length);
    for (let i = 0; i < terminator; i++) bits.push(false);
    while (bits.length % 8 !== 0) bits.push(false);

    const dataCodewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | (bits[i + j] ? 1 : 0);
      }
      dataCodewords.push(byte);
    }

    for (let padIndex = 0; dataCodewords.length < spec.dataCodewords; padIndex++) {
      dataCodewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
    }

    const divisor = this.#computeReedSolomonDivisor(spec.errorCodewords);
    const remainder = this.#computeReedSolomonRemainder(dataCodewords, divisor);
    return [...dataCodewords, ...remainder];
  }

  #createBaseMatrix(spec) {
    const matrix = Array.from({ length: spec.size }, () => Array(spec.size).fill(false));
    const functionModules = Array.from({ length: spec.size }, () => Array(spec.size).fill(false));
    const last = spec.size - 7;

    this.#drawFinderPattern(matrix, functionModules, 0, 0);
    this.#drawFinderPattern(matrix, functionModules, last, 0);
    this.#drawFinderPattern(matrix, functionModules, 0, last);

    if (spec.alignment.length) {
      for (let y of spec.alignment) {
        for (let x of spec.alignment) {
          const overlapsFinder = (x === 6 && y === 6) || (x === 6 && y === last) || (x === last && y === 6);
          if (!overlapsFinder) {
            this.#drawAlignmentPattern(matrix, functionModules, x, y);
          }
        }
      }
    }

    for (let i = 8; i < spec.size - 8; i++) {
      const dark = i % 2 === 0;
      this.#setFunctionModule(matrix, functionModules, i, 6, dark);
      this.#setFunctionModule(matrix, functionModules, 6, i, dark);
    }

    this.#drawFormatBits(matrix, functionModules, 0);
    return { matrix, functionModules };
  }

  #drawFinderPattern(matrix, functionModules, x, y) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || yy >= matrix.length || xx >= matrix.length) continue;
        const inFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const dark = inFinder && (
          dx === 0 || dx === 6 ||
          dy === 0 || dy === 6 ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
        );
        this.#setFunctionModule(matrix, functionModules, xx, yy, dark);
      }
    }
  }

  #drawAlignmentPattern(matrix, functionModules, x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
        this.#setFunctionModule(matrix, functionModules, x + dx, y + dy, dark);
      }
    }
  }

  #setFunctionModule(matrix, functionModules, x, y, dark) {
    matrix[y][x] = Boolean(dark);
    functionModules[y][x] = true;
  }

  #drawFormatBits(matrix, functionModules, mask) {
    const bits = this.#formatBits(mask);
    const size = matrix.length;

    for (let i = 0; i <= 5; i++) this.#setFunctionModule(matrix, functionModules, 8, i, this.#getBit(bits, i));
    this.#setFunctionModule(matrix, functionModules, 8, 7, this.#getBit(bits, 6));
    this.#setFunctionModule(matrix, functionModules, 8, 8, this.#getBit(bits, 7));
    this.#setFunctionModule(matrix, functionModules, 7, 8, this.#getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.#setFunctionModule(matrix, functionModules, 14 - i, 8, this.#getBit(bits, i));

    for (let i = 0; i < 8; i++) this.#setFunctionModule(matrix, functionModules, size - 1 - i, 8, this.#getBit(bits, i));
    for (let i = 8; i < 15; i++) this.#setFunctionModule(matrix, functionModules, 8, size - 15 + i, this.#getBit(bits, i));
    this.#setFunctionModule(matrix, functionModules, 8, size - 8, true);
  }

  #formatBits(mask) {
    let data = (1 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ (((rem >>> 9) & 1) ? 0x537 : 0);
    }
    return ((data << 10) | rem) ^ 0x5412;
  }

  #drawCodewords(matrix, functionModules, codewords) {
    const size = matrix.length;
    let bitIndex = 0;
    const totalBits = codewords.length * 8;

    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      const upward = ((right + 1) & 2) === 0;
      for (let vert = 0; vert < size; vert++) {
        const y = upward ? size - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          if (functionModules[y][x]) continue;
          const dark = bitIndex < totalBits && this.#getBit(codewords[bitIndex >>> 3], 7 - (bitIndex & 7));
          matrix[y][x] = dark;
          bitIndex++;
        }
      }
    }
  }

  #applyMask(matrix, functionModules, mask) {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix.length; x++) {
        if (!functionModules[y][x] && this.#maskBit(mask, x, y)) {
          matrix[y][x] = !matrix[y][x];
        }
      }
    }
  }

  #maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return false;
    }
  }

  #scoreMatrix(matrix) {
    const size = matrix.length;
    let penalty = 0;

    for (let y = 0; y < size; y++) penalty += this.#scoreLine(matrix[y]);
    for (let x = 0; x < size; x++) {
      const column = [];
      for (let y = 0; y < size; y++) column.push(matrix[y][x]);
      penalty += this.#scoreLine(column);
    }

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const color = matrix[y][x];
        if (color === matrix[y][x + 1] && color === matrix[y + 1][x] && color === matrix[y + 1][x + 1]) {
          penalty += 3;
        }
      }
    }

    const darkCount = matrix.flat().filter(Boolean).length;
    const total = size * size;
    penalty += Math.floor(Math.abs(darkCount * 20 - total * 10) / total) * 10;
    return penalty;
  }

  #scoreLine(line) {
    let penalty = 0;
    let runColor = line[0];
    let runLength = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === runColor) {
        runLength++;
        if (runLength === 5) penalty += 3;
        if (runLength > 5) penalty++;
      } else {
        runColor = line[i];
        runLength = 1;
      }
    }

    const pattern = '10111010000';
    const reversePattern = '00001011101';
    const bits = line.map((bit) => bit ? '1' : '0').join('');
    for (let i = 0; i <= bits.length - pattern.length; i++) {
      const slice = bits.slice(i, i + pattern.length);
      if (slice === pattern || slice === reversePattern) penalty += 40;
    }
    return penalty;
  }

  #computeReedSolomonDivisor(degree) {
    const result = [1];
    let root = 1;
    for (let i = 0; i < degree; i++) {
      result.push(0);
      for (let j = 0; j < result.length; j++) {
        result[j] = this.#reedSolomonMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = this.#reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  #computeReedSolomonRemainder(data, divisor) {
    const result = Array(divisor.length - 1).fill(0);
    for (let byte of data) {
      const factor = byte ^ result.shift();
      result.push(0);
      for (let i = 0; i < result.length; i++) {
        result[i] ^= this.#reedSolomonMultiply(divisor[i + 1], factor);
      }
    }
    return result;
  }

  #reedSolomonMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = ((z << 1) ^ (((z >>> 7) & 1) ? 0x11d : 0)) & 0xff;
      if (((y >>> i) & 1) !== 0) z ^= x;
    }
    return z;
  }

  #getBit(value, index) {
    return ((value >>> index) & 1) !== 0;
  }

  #renderMatrix(svg, matrix) {
    const size = matrix.length;
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (matrix[y][x]) {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', String(x));
          rect.setAttribute('y', String(y));
          rect.setAttribute('width', '1');
          rect.setAttribute('height', '1');
          rect.setAttribute('class', 'sn-qr-module');
          svg.appendChild(rect);
        }
      }
    }
  }
}

QrCode.template = template;
QrCode.rootStyles = css;
QrCode.reg('sn-qr-code');

export default QrCode;
