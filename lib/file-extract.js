// file-extract.js — client-side text extraction for uploaded student work.
// Reusable across every app tool (Verify Single / Compare / Citations / Oral).
// Exposes window.__ptFileExtract.extractText(file) -> Promise<{ text, warning, error }>
//
// Supported: .txt .md .docx .pdf (text-based). Old binary .doc and scanned/
// image PDFs are NOT supported — those return a friendly `error`/`warning`
// telling the teacher to paste the text instead. No OCR (deliberate: client-side
// OCR is heavy and unreliable on student scans).
//
// Dependencies (loaded from cdnjs by the host page, globals optional):
//   mammoth   -> window.mammoth        (.docx)
//   pdf.js    -> window.pdfjsLib       (.pdf)
// If a needed library isn't present, extraction returns a clear error rather
// than throwing.

(function () {
  'use strict';

  // A text-based PDF should yield far more than this many characters per page.
  // Well under it usually means an image/scanned PDF with no extractable text.
  var PDF_MIN_CHARS_PER_PAGE = 12;

  function readAsText(file) {
    return file.text();
  }

  async function extractDocx(file) {
    if (!window.mammoth) {
      return { text: '', error: 'Word (.docx) support is still loading. Please try again in a moment, or paste the text instead.' };
    }
    var arrayBuffer = await file.arrayBuffer();
    var result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    var text = (result && result.value ? result.value : '').trim();
    if (!text) return { text: '', error: 'No text could be read from that Word file. Please paste the text instead.' };
    return { text: text };
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) {
      return { text: '', error: 'PDF support is still loading. Please try again in a moment, or paste the text instead.' };
    }
    var arrayBuffer = await file.arrayBuffer();
    var pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var parts = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      var strings = content.items.map(function (it) { return it.str; });
      parts.push(strings.join(' '));
    }
    var text = parts.join('\n\n').replace(/[ \t]+/g, ' ').trim();
    // Heuristic: a text PDF has plenty of characters; a scanned/image PDF has ~none.
    if (text.length < PDF_MIN_CHARS_PER_PAGE * pdf.numPages) {
      return {
        text: text,
        warning: 'This looks like a scanned or image-based PDF — almost no selectable text was found. Please open it, copy the text, and paste it instead.'
      };
    }
    return { text: text };
  }

  // Main entry. Routes by extension/MIME; always resolves (never rejects) so the
  // caller can show `error`/`warning` inline.
  async function extractText(file) {
    if (!file) return { text: '', error: 'No file selected.' };
    var name = (file.name || '').toLowerCase();
    try {
      if (name.endsWith('.txt') || name.endsWith('.md') || file.type === 'text/plain') {
        var t = (await readAsText(file)).trim();
        return t ? { text: t } : { text: '', error: 'That file appears to be empty.' };
      }
      if (name.endsWith('.docx')) return await extractDocx(file);
      if (name.endsWith('.pdf') || file.type === 'application/pdf') return await extractPdf(file);
      if (name.endsWith('.doc')) {
        return { text: '', error: 'Old-format .doc files aren’t supported. Please save as .docx or PDF, or paste the text.' };
      }
      return { text: '', error: 'Unsupported file type. Upload a .pdf, .docx, .txt, or .md — or paste the text.' };
    } catch (e) {
      return { text: '', error: 'Could not read that file (' + ((e && e.message) || 'unknown error') + '). Please paste the text instead.' };
    }
  }

  window.__ptFileExtract = { extractText: extractText };
})();
