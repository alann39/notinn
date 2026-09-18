import { assertEquals, assertRejects } from "@std/assert";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import {
  extractDocxText,
  extractPlainText,
  validatedImageMime,
  validatePdf,
} from "../../supabase/functions/_shared/services/document-extraction.ts";

function little16(value: number): Uint8Array {
  const result = new Uint8Array(2);
  new DataView(result.buffer).setUint16(0, value, true);
  return result;
}

function little32(value: number): Uint8Array {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value, true);
  return result;
}

function join(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files: Readonly<Record<string, string>>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const [name, contents] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(contents);
    const checksum = crc32(data);
    const local = join([
      little32(0x04034b50),
      little16(20),
      little16(0),
      little16(0),
      little16(0),
      little16(0),
      little32(checksum),
      little32(data.length),
      little32(data.length),
      little16(nameBytes.length),
      little16(0),
      nameBytes,
      data,
    ]);
    localParts.push(local);
    centralParts.push(join([
      little32(0x02014b50),
      little16(20),
      little16(20),
      little16(0),
      little16(0),
      little16(0),
      little16(0),
      little32(checksum),
      little32(data.length),
      little32(data.length),
      little16(nameBytes.length),
      little16(0),
      little16(0),
      little16(0),
      little16(0),
      little32(0),
      little32(localOffset),
      nameBytes,
    ]));
    localOffset += local.length;
  }

  const central = join(centralParts);
  return join([
    ...localParts,
    central,
    little32(0x06054b50),
    little16(0),
    little16(0),
    little16(centralParts.length),
    little16(centralParts.length),
    little32(central.length),
    little32(localOffset),
    little16(0),
  ]);
}

Deno.test("plain documents require UTF-8 and are normalized", () => {
  assertEquals(
    extractPlainText(new TextEncoder().encode("\uFEFF  Alpha\r\nBeta  ")),
    "Alpha\nBeta",
  );
  assertRejects(
    () => Promise.resolve(extractPlainText(new Uint8Array([0xff]))),
    AppError,
  );
});

Deno.test("image MIME is determined by magic bytes rather than metadata", () => {
  assertEquals(validatedImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0])), "image/jpeg");
  assertEquals(
    validatedImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])),
    "image/png",
  );
});

Deno.test("encrypted PDFs are rejected before provider upload", () => {
  const error = assertRejects(
    () => Promise.resolve(validatePdf(new TextEncoder().encode("%PDF-1.7 /Encrypt"))),
    AppError,
  );
  return error.then((value) => assertEquals(value.code, "unsupported_input"));
});

Deno.test("DOCX text is extracted without executing XML instructions", async () => {
  const docx = storedZip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml":
      "<w:document><w:body><w:p><w:r><w:t>Hello &amp; aman</w:t></w:r></w:p><w:p><w:r><w:t>Baris dua</w:t></w:r></w:p></w:body></w:document>",
  });
  assertEquals(await extractDocxText(docx), "Hello & aman\nBaris dua");
});

Deno.test("macro-bearing DOCX archives are rejected", async () => {
  const docx = storedZip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": "<w:document><w:p><w:t>Hello</w:t></w:p></w:document>",
    "word/vbaProject.bin": "synthetic macro",
  });
  const error = await assertRejects(() => extractDocxText(docx), AppError);
  assertEquals(error.code, "unsupported_input");
});
