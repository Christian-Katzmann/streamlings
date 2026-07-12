// Endless GIF plumbing. A stream = one handshake (header, no global palette, infinite
// loop ext) + frames forever, each carrying its own local palette so a viewer can join
// at any tick. No trailer is ever written — the image simply never finishes.
import gifencMod from 'gifenc';
let gifenc = gifencMod;
while (gifenc && !(gifenc.GIFEncoder && gifenc.quantize)) gifenc = gifenc.default;
const { GIFEncoder } = gifenc;

export function handshake(width, height) {
  const b = Buffer.alloc(6 + 7 + 19);
  let o = 0;
  b.write('GIF89a', o); o += 6;
  b.writeUInt16LE(width, o); o += 2;
  b.writeUInt16LE(height, o); o += 2;
  b.writeUInt8(0x70, o++); // no GCT, 8-bit color resolution
  b.writeUInt8(0, o++);    // bg color index
  b.writeUInt8(0, o++);    // aspect
  // NETSCAPE2.0 infinite loop
  for (const byte of [0x21, 0xFF, 0x0B]) b.writeUInt8(byte, o++);
  b.write('NETSCAPE2.0', o); o += 11;
  for (const byte of [0x03, 0x01, 0x00, 0x00, 0x00]) b.writeUInt8(byte, o++);
  return b;
}

export function encodeFrame(indexed, width, height, palette, delayMs) {
  const enc = GIFEncoder({ auto: false });
  enc.writeFrame(indexed, width, height, { palette, delay: delayMs, dispose: 1 });
  return Buffer.from(enc.bytesView());
}
