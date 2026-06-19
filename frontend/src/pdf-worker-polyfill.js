/**
 * pdf-worker-polyfill.js
 * 
 * Web Worker entry point for PDF.js that injects polyfills for:
 * 1. Uint8Array.prototype.toHex
 * 2. Map.prototype.getOrInsertComputed / Map.prototype.getOrInsert
 * 3. WeakMap.prototype.getOrInsertComputed / WeakMap.prototype.getOrInsert
 * 
 * Note: These polyfills are preserved to ensure older browser versions, legacy mobile devices,
 * and corporate LTS versions accessed by external clients/visitors do not crash.
 * Modern engines that natively support these methods bypass the polyfills automatically.
 */

// 1. Uint8Array.prototype.toHex polyfill
// Pre-computed lookup table for all 256 possible byte values.
// We use a lookup table and simple loop rather than Array.prototype.map.call
// to avoid allocating a large temporary array of strings (which would consume
// significant memory and trigger heavy garbage collection on large binary PDF files).
const hexTable = [];
for (let i = 0; i < 256; i++) {
  hexTable[i] = i.toString(16).padStart(2, '0');
}

if (!Uint8Array.prototype.toHex) {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value: function () {
      let result = '';
      for (let i = 0; i < this.length; i++) {
        result += hexTable[this[i]];
      }
      return result;
    },
    configurable: true,
    writable: true,
  });
}

// 2. Map prototype helpers
if (!Map.prototype.getOrInsertComputed) {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value: function (key, callback) {
      if (this.has(key)) {
        return this.get(key);
      }
      const value = callback(key, this);
      this.set(key, value);
      return value;
    },
    configurable: true,
    writable: true,
  });
}

if (!Map.prototype.getOrInsert) {
  Object.defineProperty(Map.prototype, 'getOrInsert', {
    value: function (key, value) {
      if (this.has(key)) {
        return this.get(key);
      }
      this.set(key, value);
      return value;
    },
    configurable: true,
    writable: true,
  });
}

// 3. WeakMap prototype helpers
if (!WeakMap.prototype.getOrInsertComputed) {
  Object.defineProperty(WeakMap.prototype, 'getOrInsertComputed', {
    value: function (key, callback) {
      if (this.has(key)) {
        return this.get(key);
      }
      const value = callback(key, this);
      this.set(key, value);
      return value;
    },
    configurable: true,
    writable: true,
  });
}

if (!WeakMap.prototype.getOrInsert) {
  Object.defineProperty(WeakMap.prototype, 'getOrInsert', {
    value: function (key, value) {
      if (this.has(key)) {
        return this.get(key);
      }
      this.set(key, value);
      return value;
    },
    configurable: true,
    writable: true,
  });
}

// Import the actual worker code
import 'pdfjs-dist/build/pdf.worker.mjs';
