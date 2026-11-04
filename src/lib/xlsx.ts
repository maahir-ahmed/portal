import { readFileSync } from "node:fs";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { parseCsv } from "./csv";

// Arc rejects AHEGS lists that aren't on its own template, so the export fills the
// real .xlsx rather than emitting a CSV: read the template, swap the sheet's rows,
// zip it back up. An .xlsx is a zip of XML, and node ships both halves (zlib for
// deflate and crc32), so this is ~80 lines instead of a spreadsheet dependency.
//
// ponytail: handles exactly the shape of these three templates — one sheet, no
// formulas, values written as inline strings so the shared-string table can stay
// untouched. Reach for a real library before pointing it at anything else.

type ZipEntries = Map<string, Buffer>;

// Uploads are read with this too (member import), so a small hostile file must not
// expand without limit: each entry inflates to at most this, and only the entries the
// caller asks for are inflated at all (a zip can list one huge entry thousands of times).
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;

export function readZip(buf: Buffer, only?: Set<string>): ZipEntries {
  // End-of-central-directory record, scanned from the back (it carries a variable
  // length comment, so its position isn't fixed).
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file");

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntries = new Map();

  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);

    // The local header repeats the name and extra fields at its own lengths.
    const dataStart =
      localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    if (!only || only.has(name)) {
      const raw = buf.subarray(dataStart, dataStart + compSize);
      entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }));
    }

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function writeZip(entries: ZipEntries): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const body = deflateRawSync(data);
    const sum = crc32(data);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed to extract
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(8, 10); // deflate
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.size, 8);
  end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

export type Cell = string | number | Date | null;

const COLUMNS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// Control characters (bar tab and newlines) aren't allowed in XML at all, and Excel
// calls the whole file corrupt over one pasted into a name, so they're dropped.
const escapeXml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

// Excel counts days from 1899-12-30. Built from the UTC parts so a date stored as
// midnight UTC doesn't slide a day backwards for anyone west of Greenwich.
const excelSerial = (d: Date) =>
  Math.round(
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86_400_000
  );

function cellXml(value: Cell, ref: string, style: string): string {
  const s = style ? ` s="${style}"` : "";
  if (value === null || value === "") return `<c r="${ref}"${s}/>`;
  if (value instanceof Date) return `<c r="${ref}"${s}><v>${excelSerial(value)}</v></c>`;
  if (typeof value === "number") return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

/**
 * Fills one of Arc's AHEGS templates. Row 1 (headings) and row 2 (Arc's own example
 * row, which the real submissions keep) are carried over untouched; the data rows
 * are rebuilt from `rows`, borrowing their cell styles from the template's own row 3
 * so dates keep formatting as dates.
 */
export function fillTemplate(templatePath: string, rows: Cell[][]): Buffer {
  const entries = readZip(readFileSync(templatePath));
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheet = entries.get(sheetPath)?.toString("utf8");
  if (!sheet) throw new Error(`${templatePath} has no ${sheetPath}`);

  const rowXml = (n: number) => new RegExp(`<row r="${n}"[^>]*>[\\s\\S]*?</row>`).exec(sheet)?.[0] ?? "";
  const template = rowXml(3);
  const styles = new Map<string, string>();
  for (const [, col, style] of template.matchAll(/<c r="([A-Z]+)\d+"(?: s="(\d+)")?[^>]*\/?>/g)) {
    styles.set(col, style ?? "");
  }

  const body = rows
    .map((cells, i) => {
      const n = i + 3;
      const xml = cells
        .map((value, c) => cellXml(value, `${COLUMNS[c]}${n}`, styles.get(COLUMNS[c]) ?? ""))
        .join("");
      return `<row r="${n}">${xml}</row>`;
    })
    .join("");

  entries.set(
    sheetPath,
    Buffer.from(sheet.replace(/<sheetData>[\s\S]*?<\/sheetData>/, () => `<sheetData>${rowXml(1)}${rowXml(2)}${body}</sheetData>`))
  );
  return writeZip(entries);
}

// Reading, for member imports: the first sheet's cells as text, row by row.
// ponytail: takes xl/worksheets/sheet1.xml as the first sheet, which is what Excel,
// LibreOffice and Google Sheets all write; dates and formulas come through as their
// stored values. Enough for a list of names and emails.
const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (e[0] !== "#") return named[e.toLowerCase()];
    return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  });

/** The text of every <t> in a fragment: a shared string or inline string may be split into runs. */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join("");

// Excel's last column is XFD (16384). A reference past it is a crafted file, and would
// otherwise make each row an array of hundreds of millions of empty cells.
const MAX_COLUMNS = 16384;

const columnIndex = (ref: string) => {
  const n = [...ref.replace(/\d+$/, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  if (n >= MAX_COLUMNS) throw new Error(`column ${ref} is past the last column a spreadsheet can have`);
  return n;
};

/** A spreadsheet or CSV upload as rows of text. XLSX is recognised by its zip header. */
export function readTable(buf: Buffer): string[][] {
  return buf.subarray(0, 2).toString("latin1") === "PK" ? readSheet(buf) : parseCsv(buf.toString("utf8"));
}

function readSheet(buf: Buffer): string[][] {
  const zip = readZip(buf, new Set(["xl/worksheets/sheet1.xml", "xl/sharedStrings.xml"]));
  const sheet = zip.get("xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!sheet) throw new Error("no worksheet found");
  const shared = [...(zip.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (m) => textOf(m[1])
  );
  const rows: string[][] = [];
  for (const [, body = ""] of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const [, attrs, inner = ""] of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? textOf(inner) : decodeXml(v);
      row[ref ? columnIndex(ref) : row.length] = value;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows;
}
