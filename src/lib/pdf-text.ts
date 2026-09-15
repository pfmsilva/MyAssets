/**
 * Extracts text lines from a PDF (server side, pdf.js legacy build). Items on the same baseline are
 * merged into one line, sorted by x; a space is inserted where there is a visible gap.
 */
export async function pdfLines(buffer: ArrayBuffer): Promise<string[][]> {
  // The worker file is shipped via outputFileTracingIncludes (next.config.ts); pdf.js loads it in-process in Node.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer.slice(0)), useSystemFonts: true, disableFontFace: true }).promise;
  const pages: string[][] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      type Item = { x: number; y: number; w: number; s: string };
      const items: Item[] = [];
      for (const it of tc.items) {
        if (!("str" in it) || it.str.trim() === "") continue;
        items.push({ x: it.transform[4], y: it.transform[5], w: it.width, s: it.str });
      }
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: { y: number; items: Item[] }[] = [];
      for (const it of items) {
        const last = lines[lines.length - 1];
        if (last && Math.abs(last.y - it.y) <= 2.5) last.items.push(it);
        else lines.push({ y: it.y, items: [it] });
      }
      pages.push(
        lines.map((l) =>
          l.items
            .sort((a, b) => a.x - b.x)
            .map((it, i, arr) => (i > 0 && it.x - (arr[i - 1].x + arr[i - 1].w) > 1.5 ? " " : "") + it.s)
            .join("")
            .replace(/\s+/g, " ")
            .trim(),
        ),
      );
    }
  } finally {
    await doc.cleanup();
  }
  return pages;
}
