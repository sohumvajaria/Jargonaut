// Client-side PDF text extraction using pdfjs-dist.
//
// pdfjs is imported dynamically so its (large) bundle and Web Worker only load
// when a user actually uploads a PDF — keeping the initial page light and
// avoiding any server-side execution. The worker file is bundled via the
// `new URL(..., import.meta.url)` pattern, which both webpack and Turbopack
// understand, so this works in dev and in production without a CDN.

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });

  try {
    const pdf = await loadingTask.promise;

    const pages: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      pages.push(pageText);
    }

    return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
  } finally {
    // Release the worker/document resources whether or not extraction succeeded.
    await loadingTask.destroy();
  }
}
