import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Arc wants one combined file for attendance records and one for proof of
// commitment, so the minutes logged against each meeting get stitched into a single
// PDF. pdf-lib rather than hand-rolling it: unlike an .xlsx, a PDF is not a zip of
// XML — it has cross-reference tables and object streams, and merging means
// rewriting them.

export interface MergeSource {
  /** What the meeting was, for the contents page. */
  title: string;
  /** Displayed date, already formatted. */
  date: string;
  hours: number;
  attendees: number;
  bytes: Uint8Array;
}

export interface MergeResult {
  pdf: Uint8Array;
  pages: number;
  /** Documents that could not be read, by title, so the exec can fix them. */
  failed: string[];
}

/**
 * Merges the minutes into one document, front-loaded with a contents page so the
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
      const pages = await out.copyPages(doc, doc.getPageIndices());
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
    cover.drawText(`${source.date} · ${source.hours}h · ${source.attendees} attended`, {
      x: 55, y, size: 9, font, color: rgb(0.45, 0.45, 0.45),
    });
    y -= 18;
  }

  return { pdf: await out.save(), pages: out.getPageCount(), failed };
}
