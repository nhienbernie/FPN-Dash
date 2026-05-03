/**
 * Generates custom map marker PNGs into assets/. No extra deps — Node built-ins only.
 *
 *   pantry-pin{,@2x,@3x}.png       — purple 5-pointed star, 12 pt display
 *   active-delivery-pin{,@2x,@3x}.png — exact-teal circle, 20 pt display
 *
 * Run: node scripts/gen-pantry-pin.js
 */

"use strict";

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ── CRC-32 ────────────────────────────────────────────────────────────────────
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
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function buildStar(cx, cy, outerR, innerR) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2; // start pointing up
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts;
}

// ── Pixel renderers ───────────────────────────────────────────────────────────

/** 5-pointed star with a white border ring. */
function starPixel(x, y, size, outerR, innerR, borderWidth, fill) {
  const cx = size / 2;
  const cy = size / 2;
  const px = x + 0.5;
  const py = y + 0.5;

  const starFill   = buildStar(cx, cy, outerR, innerR);
  const starBorder = buildStar(cx, cy, outerR + borderWidth, innerR + borderWidth);

  if (pointInPolygon(px, py, starFill))   return [...fill, 255];
  if (pointInPolygon(px, py, starBorder)) return [255, 255, 255, 255];
  return [0, 0, 0, 0];
}

// ── Colours ───────────────────────────────────────────────────────────────────
const PURPLE = [0x7c, 0x3a, 0xed]; // #7C3AED — drive-thru pantry

// ── Output specs ─────────────────────────────────────────────────────────────
const outDir = path.resolve(__dirname, "../assets");

const MARKERS = [
  {
    // Drive-thru pantry: purple star, 15 pt on screen
    baseName: "pantry-pin",
    sizes: [
      { suffix: "",    px: 15, outerR: 6.5,  innerR: 2.6, borderWidth: 1.3 },
      { suffix: "@2x", px: 30, outerR: 13.0, innerR: 5.2, borderWidth: 1.8 },
      { suffix: "@3x", px: 45, outerR: 19.5, innerR: 7.8, borderWidth: 2.2 },
    ],
    render: (x, y, px, s) =>
      starPixel(x, y, px, s.outerR, s.innerR, s.borderWidth, PURPLE),
  },
];

for (const marker of MARKERS) {
  const displayPt = marker.sizes[0].px;
  for (const s of marker.sizes) {
    const png = makePng(s.px, s.px, (x, y) => marker.render(x, y, s.px, s));
    const file = path.join(outDir, `${marker.baseName}${s.suffix}.png`);
    fs.writeFileSync(file, png);
    console.log(
      `✓ ${path.relative(process.cwd(), file)}  (${s.px}×${s.px} px → ${displayPt} pt)`,
    );
  }
}
