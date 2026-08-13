import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Arc wants one combined file per evidence slot, so the minutes logged against each
// meeting and the documents each group uploaded get stitched into a single PDF.
// pdf-lib rather than hand-rolling it: unlike an .xlsx, a PDF is not a zip of XML —
// it has cross-reference tables and object streams, and merging means rewriting them.

export interface MergeSource {
  /** What the document is, for the contents page. */
  title: string;
  /** The line under it: date, duration, who it came from. */
  subtitle: string;
  bytes: Uint8Array;
  /**
   * Which pages to take. Minutes carry the attendance sheet on page 1 and the meeting
   * itself on the pages after it, so the same document feeds both of Arc's files:
   * "first" builds the attendance record, "rest" the proof of commitment. Omit for
   * the whole document.
   */
  take?: "first" | "rest";
}

export interface MergeResult {
  pdf: Uint8Array;
  pages: number;
  /** Documents that could not be read, by title, so the exec can fix them. */
  failed: string[];
}

/**
 * A one-page set of minutes has its attendance and its content on the same sheet, so
 * "rest" keeps that page rather than contributing nothing — an empty proof-of-
 * commitment file is a failed submission, a duplicated page is not.
 */
function pageIndices(all: number[], take: MergeSource["take"]): number[] {
  if (take === "first") return all.slice(0, 1);
  if (take === "rest") return all.length > 1 ? all.slice(1) : all;
  return all;
}

/**
 * Merges the sources into one document, front-loaded with a contents page so the
 * result is legible to whoever at Arc opens it rather than being 40 undifferentiated
 * pages. A document that won't parse is skipped and named rather than failing the
 * whole merge — one corrupt file shouldn't block the submission.
 */
export async function mergeMinutes(heading: string, sources: MergeSource[]): Promise<MergeResult> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  const failed: string[] = [];
  const merged: MergeSource[] = [];

  for (const source of sources) {
    try {
      const doc = await PDFDocument.load(source.bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(doc, pageIndices(doc.getPageIndices(), source.take));
      for (const page of pages) out.addPage(page);
      merged.push(source);
    } catch {
      failed.push(source.title);
    }
  }

  // Contents page goes in first, built after the fact so it can list what actually
  // made it in rather than what was attempted.
  const cover = out.insertPage(0, [595.28, 841.89]); // A4
  const { height } = cover.getSize();
  let y = height - 70;

  cover.drawText(heading, { x: 55, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 22;
  cover.drawText(`${merged.length} document${merged.length === 1 ? "" : "s"}, combined for submission`, {
    x: 55, y, size: 10, font, color: rgb(0.4, 0.4, 0.4),
  });
  y -= 30;

  for (const source of merged) {
    if (y < 60) break; // one page of contents is enough; the documents follow regardless
    cover.drawText(source.title.slice(0, 70), { x: 55, y, size: 10, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 13;
    cover.drawText(source.subtitle.slice(0, 90), {
      x: 55, y, size: 9, font, color: rgb(0.45, 0.45, 0.45),
    });
    y -= 18;
  }

  return { pdf: await out.save(), pages: out.getPageCount(), failed };
}
