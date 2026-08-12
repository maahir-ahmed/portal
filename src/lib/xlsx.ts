import { readFileSync } from "node:fs";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

// Arc rejects AHEGS lists that aren't on its own template, so the export fills the
// real .xlsx rather than emitting a CSV: read the template, swap the sheet's rows,
// zip it back up. An .xlsx is a zip of XML, and node ships both halves (zlib for
// deflate and crc32), so this is ~80 lines instead of a spreadsheet dependency.
//
// ponytail: handles exactly the shape of these three templates — one sheet, no
// formulas, values written as inline strings so the shared-string table can stay
// untouched. Reach for a real library before pointing it at anything else.

type ZipEntries = Map<string, Buffer>;

export function readZip(buf: Buffer): ZipEntries {
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
    const raw = buf.subarray(dataStart, dataStart + compSize);
    entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function writeZip(entries: ZipEntries): Buffer {
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
const escapeXml = (s: string) =>
  s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

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
    Buffer.from(sheet.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${rowXml(1)}${rowXml(2)}${body}</sheetData>`))
  );
  return writeZip(entries);
}
