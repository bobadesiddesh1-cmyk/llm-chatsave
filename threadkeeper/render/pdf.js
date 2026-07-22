/* Threadkeeper — render/pdf.js
 * PDF path: render the standalone HTML export into a hidden off-screen iframe,
 * wait for its images to settle, then invoke print() scoped to that iframe. Chrome
 * scopes the print job to the iframe document, so the user gets the conversation
 * (not the host page) and picks "Save as PDF". See DECISIONS.md for rationale. */
(function () {
  "use strict";
  window.TK = window.TK || {};

  /**
   * @param {string} html  Full standalone HTML document (from TK.html.render).
   * @param {string} filenameHint  Used to set the iframe document title, which many
   *        browsers use as the default PDF filename.
   * @returns {Promise<{ok:boolean}>}
   */
  function exportPDF(html, filenameHint) {
    return new Promise(function (resolve) {
      var iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;" +
        "pointer-events:none;z-index:-1;";
      var settled = false;

      function cleanup() {
        try { if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch (e) {}
      }

      iframe.onload = function () {
        // onload fires after we write the doc (below); guard against double-run.
        if (settled) return;
      };

      document.documentElement.appendChild(iframe);

      var doc;
      try {
        doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        doc.open();
        doc.write(html);
        doc.close();
      } catch (e) {
        cleanup();
        resolve({ ok: false, error: String(e) });
        return;
      }

      if (filenameHint) { try { doc.title = filenameHint; } catch (e) {} }

      var win = iframe.contentWindow;

      // Remove the iframe after the print dialog closes.
      try {
        win.addEventListener("afterprint", function () {
          if (settled) return;
          settled = true;
          // Delay slightly so the print pipeline finishes reading the document.
          setTimeout(function () { cleanup(); resolve({ ok: true }); }, 300);
        });
      } catch (e) {}

      // Wait for images inside the iframe to finish loading, then print.
      waitForImages(doc, function () {
        try {
          win.focus();
          win.print();
        } catch (e) {
          cleanup();
          resolve({ ok: false, error: String(e) });
          return;
        }
        // Fallback cleanup in case 'afterprint' never fires (some environments).
        setTimeout(function () {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({ ok: true });
        }, 60000);
      });
    });
  }

  function waitForImages(doc, done) {
    var imgs = [];
    try { imgs = Array.prototype.slice.call(doc.images || []); } catch (e) {}
    var pending = 0;
    var finished = false;
    function maybeDone() {
      if (finished) return;
      if (pending <= 0) { finished = true; done(); }
    }
    // Hard cap so a stuck image never blocks the export forever.
    var cap = setTimeout(function () {
      if (finished) return;
      finished = true;
      done();
    }, 8000);

    imgs.forEach(function (img) {
      if (img.complete && img.naturalWidth !== 0) return;
      pending++;
      var settle = function () {
        pending--;
        img.removeEventListener("load", settle);
        img.removeEventListener("error", settle);
        maybeDone();
      };
      img.addEventListener("load", settle);
      img.addEventListener("error", settle);
    });

    if (pending === 0) {
      clearTimeout(cap);
      // Give layout one frame before printing.
      setTimeout(done, 50);
    }
  }

  TK.pdf = { exportPDF: exportPDF };
})();
