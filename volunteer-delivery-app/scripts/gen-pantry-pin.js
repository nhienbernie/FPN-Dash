/**
 * Generates pantry-pin.png / @2x / @3x — a small purple circle with a white
 * border — into assets/. Uses only Node built-ins (zlib + fs), no extra deps.
 *
 * Run: node scripts/gen-pantry-pin.js
 */

"use strict";

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ── CRC-32 table (needed by the PNG chunk format) ────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── PNG builder ───────────────────────────────────────────────────────────────
function makePng(width, height, pixelsFn) {
  // pixelsFn(x, y) → [r, g, b, a]
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelsFn(x, y);
      const off = y * (1 + width * 4) + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Circle renderer ───────────────────────────────────────────────────────────
function circlePixel(x, y, size, outerR, innerR, fill, border) {
  const cx = size / 2;
  const cy = size / 2;
  // Sample centre of pixel
  const dist = Math.sqrt((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2);
  if (dist <= innerR) return [...fill, 255];
  if (dist <= outerR) return [...border, 255];
  return [0, 0, 0, 0]; // transparent
}

// ── Config ────────────────────────────────────────────────────────────────────
// Purple #7C3AED, white border. Displayed at 20 pt on screen across all
// densities, which is noticeably smaller than the default ~27×45 pt pin.
const PURPLE = [0x7c, 0x3a, 0xed];
const WHITE = [255, 255, 255];

const SIZES = [
  { suffix: "",    size: 10, outerR: 4.5,  innerR: 3.0  }, // @1x → 10 pt
  { suffix: "@2x", size: 20, outerR: 9.5,  innerR: 7.0  }, // @2x → 10 pt
  { suffix: "@3x", size: 30, outerR: 14.0, innerR: 10.5 }, // @3x → 10 pt
];

const outDir = path.resolve(__dirname, "../assets");

for (const { suffix, size, outerR, innerR } of SIZES) {
  const png = makePng(size, size, (x, y) =>
    circlePixel(x, y, size, outerR, innerR, PURPLE, WHITE),
  );
  const file = path.join(outDir, `pantry-pin${suffix}.png`);
  fs.writeFileSync(file, png);
  const displayPt = SIZES[0].size; // @1x pixel size = display pt size
  console.log(`✓ ${path.relative(process.cwd(), file)}  (${size}×${size} px → ${displayPt} pt)`);
}
