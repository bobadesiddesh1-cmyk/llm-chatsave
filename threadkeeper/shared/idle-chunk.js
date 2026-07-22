/* Threadkeeper — shared/idle-chunk.js
 * Cooperative chunked processing so large conversations (200+ messages) never
 * freeze the tab. Yields to the UI between chunks using requestIdleCallback when
 * available, falling back to setTimeout(0). */
(function () {
  "use strict";
  window.TK = window.TK || {};

  function yieldToUI() {
    return new Promise(function (resolve) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(function () { resolve(); }, { timeout: 200 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /**
   * Run `fn(item, index)` over `items`, yielding to the UI every `chunkSize` items
   * once the list is longer than `threshold`. `fn` may be async. Returns the array
   * of results in order.
   */
  async function processInChunks(items, fn, opts) {
    opts = opts || {};
    var chunkSize = opts.chunkSize || 8;
    var threshold = typeof opts.threshold === "number" ? opts.threshold : 50;
    var onProgress = opts.onProgress; // optional (done, total) => void
    var results = new Array(items.length);
    var chunked = items.length > threshold;

    for (var i = 0; i < items.length; i++) {
      results[i] = await fn(items[i], i);
      if (onProgress) { try { onProgress(i + 1, items.length); } catch (e) {} }
      if (chunked && (i + 1) % chunkSize === 0) {
        await yieldToUI();
      }
    }
    return results;
  }

  TK.idle = {
    yieldToUI: yieldToUI,
    processInChunks: processInChunks
  };
})();
