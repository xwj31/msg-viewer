// Generates icon.png (128x128) — an envelope glyph on an indigo gradient.
// Renders at 512px and box-downsamples 4x for smooth edges; PNG encoded by hand.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const S = 512; // supersampled size
const OUT = 128;
const px = new Float64Array(S * S * 4);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// distance to rounded-rect boundary (negative = inside)
function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}

function sdSegment(x, y, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const wx = x - x1, wy = y - y1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (x1 + vx * t), y - (y1 + vy * t));
}

function blend(i, r, g, b, a) {
  const ia = 1 - a;
  px[i] = px[i] * ia + r * a;
  px[i + 1] = px[i + 1] * ia + g * a;
  px[i + 2] = px[i + 2] * ia + b * a;
  px[i + 3] = Math.min(1, px[i + 3] * ia + a);
}

const AA = 1.5; // edge softness in supersampled px

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;

    // background rounded rect, vertical gradient #2B3A8F -> #151E4E
    const dBg = sdRoundRect(x + 0.5, y + 0.5, S / 2, S / 2, S / 2, S / 2, 112);
    if (dBg < AA) {
      const t = y / S;
      const a = Math.min(1, (AA - dBg) / (2 * AA));
      blend(i, lerp(0x2b, 0x15, t) / 255, lerp(0x3a, 0x1e, t) / 255, lerp(0x8f, 0x4e, t) / 255, a);
    }

    // envelope body: white rounded rect
    const dEnv = sdRoundRect(x + 0.5, y + 0.5, 256, 264, 152, 96, 22);
    if (dEnv < AA) {
      const a = Math.min(1, (AA - dEnv) / (2 * AA));
      blend(i, 0.96, 0.97, 1.0, a);
    }

    // flap: two lines from the top corners meeting below center
    const d1 = sdSegment(x + 0.5, y + 0.5, 112, 180, 256, 296);
    const d2 = sdSegment(x + 0.5, y + 0.5, 400, 180, 256, 296);
    const dFlap = Math.min(d1, d2) - 11; // stroke half-width
    if (dFlap < AA && dEnv < 0) {
      const a = Math.min(1, (AA - dFlap) / (2 * AA));
      blend(i, 0x2b / 255, 0x3a / 255, 0x8f / 255, a);
    }
  }
}

// downsample 4x
const out = Buffer.alloc(OUT * OUT * 4);
for (let y = 0; y < OUT; y++) {
  for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < 4; sy++) {
      for (let sx = 0; sx < 4; sx++) {
        const i = ((y * 4 + sy) * S + x * 4 + sx) * 4;
        r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3];
      }
    }
    const o = (y * OUT + x) * 4;
    out[o] = Math.round((r / 16) * 255);
    out[o + 1] = Math.round((g / 16) * 255);
    out[o + 2] = Math.round((b / 16) * 255);
    out[o + 3] = Math.round((a / 16) * 255);
  }
}

// PNG encode
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OUT, 0);
ihdr.writeUInt32BE(OUT, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const scanlines = Buffer.alloc(OUT * (OUT * 4 + 1));
for (let y = 0; y < OUT; y++) {
  scanlines[y * (OUT * 4 + 1)] = 0; // filter: none
  out.copy(scanlines, y * (OUT * 4 + 1) + 1, y * OUT * 4, (y + 1) * OUT * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync(path.join(__dirname, '..', 'icon.png'), png);
console.log(`wrote icon.png (${png.length} bytes)`);
