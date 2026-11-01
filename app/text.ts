/** Decode documented text encodings; never silently replace invalid source bytes. */
export async function decodeText(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw Error("Unsupported text encoding. Use UTF-8 or UTF-16 with BOM.");
  }
}

