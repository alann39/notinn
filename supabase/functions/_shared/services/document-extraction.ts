import { MAX_PASTED_TEXT_CHARS } from "../config/constants.ts";
import { AppError } from "../errors/app-error.ts";
import { normaliseSourceText } from "./text-normalisation.ts";

const MAX_DOCX_ENTRIES = 2_000;
const MAX_DOCX_EXPANDED_BYTES = 20 * 1024 * 1024;
const MAX_DOCX_XML_BYTES = 8 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function validatedImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  throw AppError.unsupportedInput("image magic bytes did not match JPEG, PNG, or WebP");
}

export function validatePdf(bytes: Uint8Array): void {
  if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    throw AppError.unsupportedInput("PDF magic bytes were absent");
  }
  const sample = new TextDecoder("latin1").decode(bytes);
  if (/\/Encrypt\b/.test(sample)) {
    throw AppError.unsupportedInput("encrypted PDFs are not supported");
  }
}

export function extractPlainText(bytes: Uint8Array): string {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (thrown) {
    throw AppError.validation("text document was not valid UTF-8", thrown);
  }
  const normalised = normaliseSourceText(decoded.replace(/^\uFEFF/, ""));
  if (normalised.kind === "empty") throw AppError.validation("text document was empty");
  if (normalised.kind === "too_long") {
    throw AppError.inputTooLong(
      `text document length ${normalised.length} exceeded ${MAX_PASTED_TEXT_CHARS}`,
    );
  }
  return normalised.text;
}

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly flags: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly expandedSize: number;
  readonly localOffset: number;
}

function readU16(view: DataView, offset: number): number {
  if (offset + 2 > view.byteLength) throw AppError.validation("DOCX ZIP field was truncated");
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  if (offset + 4 > view.byteLength) throw AppError.validation("DOCX ZIP field was truncated");
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const floor = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= floor; offset -= 1) {
    if (
      bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06
    ) return offset;
  }
  throw AppError.validation("DOCX ZIP central directory was absent");
}

function safeZipName(raw: Uint8Array): string {
  let name: string;
  try {
    name = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch (thrown) {
    throw AppError.validation("DOCX ZIP filename was not UTF-8", thrown);
  }
  if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
    throw AppError.validation("DOCX ZIP contained an unsafe path");
  }
  return name;
}

function parseEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  const disk = readU16(view, eocd + 4);
  const centralDisk = readU16(view, eocd + 6);
  const diskEntries = readU16(view, eocd + 8);
  const entryCount = readU16(view, eocd + 10);
  const centralSize = readU32(view, eocd + 12);
  const centralOffset = readU32(view, eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) {
    throw AppError.unsupportedInput("multi-disk DOCX archives are not supported");
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw AppError.unsupportedInput("ZIP64 DOCX archives are not supported");
  }
  if (entryCount === 0 || entryCount > MAX_DOCX_ENTRIES) {
    throw AppError.inputTooLarge("DOCX entry count exceeded the safety limit");
  }
  if (centralOffset + centralSize > eocd || centralOffset + centralSize > bytes.length) {
    throw AppError.validation("DOCX central directory bounds were invalid");
  }

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let totalExpanded = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(view, offset) !== 0x02014b50) {
      throw AppError.validation("DOCX central entry signature was invalid");
    }
    const flags = readU16(view, offset + 8);
    const method = readU16(view, offset + 10);
    const crc32 = readU32(view, offset + 16);
    const compressedSize = readU32(view, offset + 20);
    const expandedSize = readU32(view, offset + 24);
    const nameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localOffset = readU32(view, offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > centralOffset + centralSize) {
      throw AppError.validation("DOCX central entry exceeded its directory");
    }
    const name = safeZipName(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if ((flags & 0x0001) !== 0) throw AppError.unsupportedInput("encrypted DOCX is not supported");
    if (method !== 0 && method !== 8) {
      throw AppError.unsupportedInput("DOCX used an unsupported ZIP compression method");
    }
    totalExpanded += expandedSize;
    if (totalExpanded > MAX_DOCX_EXPANDED_BYTES) {
      throw AppError.inputTooLarge("DOCX expanded size exceeded the safety limit");
    }
    if (expandedSize > 0 && compressedSize === 0) {
      throw AppError.validation("DOCX entry declared an impossible compressed size");
    }
    if (compressedSize > 0 && expandedSize / compressedSize > MAX_COMPRESSION_RATIO) {
      throw AppError.inputTooLarge("DOCX compression ratio exceeded the safety limit");
    }
    entries.push({ name, method, flags, crc32, compressedSize, expandedSize, localOffset });
    offset = end;
  }
  return entries;
}

async function inflateEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readU32(view, entry.localOffset) !== 0x04034b50) {
    throw AppError.validation("DOCX local entry signature was invalid");
  }
  if (
    readU16(view, entry.localOffset + 6) !== entry.flags ||
    readU16(view, entry.localOffset + 8) !== entry.method
  ) {
    throw AppError.validation("DOCX local and central entry metadata disagreed");
  }
  const nameLength = readU16(view, entry.localOffset + 26);
  const extraLength = readU16(view, entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (start < 0 || end > bytes.length) throw AppError.validation("DOCX entry bounds were invalid");
  const localName = safeZipName(
    bytes.subarray(entry.localOffset + 30, entry.localOffset + 30 + nameLength),
  );
  if (localName !== entry.name) {
    throw AppError.validation("DOCX local and central entry names disagreed");
  }
  const compressed = bytes.slice(start, end);
  let expanded: Uint8Array;
  if (entry.method === 0) {
    expanded = compressed;
  } else {
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(
        new DecompressionStream("deflate-raw"),
      );
      expanded = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (thrown) {
      throw AppError.validation("DOCX deflate stream was invalid", thrown);
    }
  }
  if (expanded.length !== entry.expandedSize) {
    throw AppError.validation("DOCX entry expanded to an unexpected size");
  }
  if (crc32(expanded) !== entry.crc32) {
    throw AppError.validation("DOCX entry checksum was invalid");
  }
  return expanded;
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

function decodeXmlEntities(value: string): string {
  return value.replace(/&(?:#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    const radix = entity.startsWith("&#x") ? 16 : 10;
    const body = entity.slice(entity.startsWith("&#x") ? 3 : 2, -1);
    const codePoint = Number.parseInt(body, radix);
    return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : "";
  });
}

function textFromWordXml(xml: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw AppError.unsupportedInput("DOCX XML declarations were unsafe");
  }
  const pieces: string[] = [];
  const token =
    /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<\/w:p\s*>|<\/w:tr\s*>/gi;
  for (const match of xml.matchAll(token)) {
    const whole = match[0].toLowerCase();
    if (whole.startsWith("<w:t")) pieces.push(decodeXmlEntities(match[1] ?? ""));
    else if (whole.startsWith("<w:tab")) pieces.push("\t");
    else pieces.push("\n");
  }
  return extractPlainText(new TextEncoder().encode(pieces.join("")));
}

export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  if (!startsWith(bytes, [0x50, 0x4b])) throw AppError.unsupportedInput("DOCX was not a ZIP file");
  const entries = parseEntries(bytes);
  const lowerNames = new Set(entries.map((entry) => entry.name.toLowerCase()));
  if ([...lowerNames].some((name) => name.endsWith(".bin") || name.includes("vbaproject"))) {
    throw AppError.unsupportedInput("macro-enabled DOCX files are not supported");
  }
  if (!lowerNames.has("[content_types].xml")) {
    throw AppError.unsupportedInput("ZIP file was not an OOXML document");
  }
  const document = entries.find((entry) => entry.name.toLowerCase() === "word/document.xml");
  if (document === undefined) throw AppError.validation("DOCX main document XML was absent");
  if (document.expandedSize > MAX_DOCX_XML_BYTES) {
    throw AppError.inputTooLarge("DOCX main XML exceeded the safety limit");
  }
  const xmlBytes = await inflateEntry(bytes, document);
  try {
    return textFromWordXml(new TextDecoder("utf-8", { fatal: true }).decode(xmlBytes));
  } catch (thrown) {
    if (thrown instanceof AppError) throw thrown;
    throw AppError.validation("DOCX main XML was not valid UTF-8", thrown);
  } finally {
    xmlBytes.fill(0);
  }
}
