// Endless GIF plumbing. A stream = one handshake (header, no global palette, infinite
// loop ext) + frames forever, each carrying its own local palette so a viewer can join
// at any tick. No trailer is ever written — the image simply never finishes.
import gifencMod from 'gifenc';
let gifenc = gifencMod;
while (gifenc && !(gifenc.GIFEncoder && gifenc.quantize)) gifenc = gifenc.default;
const { GIFEncoder } = gifenc;

export function handshake(width, height) {
  // Deliberately NO NETSCAPE loop extension: when a stream window ends, the image
  // freezes on its final frame (an instruction card) instead of deceptively
  // replaying the recording as if the pet were still live.
  const b = Buffer.alloc(6 + 7);
  let o = 0;
  b.write('GIF89a', o); o += 6;
  b.writeUInt16LE(width, o); o += 2;
  b.writeUInt16LE(height, o); o += 2;
  b.writeUInt8(0x70, o++); // no GCT, 8-bit color resolution
  b.writeUInt8(0, o++);    // bg color index
  b.writeUInt8(0, o++);    // aspect
  return b;
}

export function encodeFrame(indexed, width, height, palette, delayMs) {
  const enc = GIFEncoder({ auto: false });
  enc.writeFrame(indexed, width, height, { palette, delay: delayMs, dispose: 1 });
  return Buffer.from(enc.bytesView());
}
