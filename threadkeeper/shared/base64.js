/* Threadkeeper — shared/base64.js
 * Pure-ish helpers for turning conversation images into self-contained data URIs
 * and for UTF-8 <-> byte conversions used by the ZIP writer.
 * Attaches to the shared `window.TK` namespace. No external calls beyond fetching
 * images that are already part of the open conversation. */
(function () {
  "use strict";
  window.TK = window.TK || {};

  /** Encode a JS string as UTF-8 bytes. */
  function utf8Bytes(str) {
    return new TextEncoder().encode(str);
  }

  /** Encode a Uint8Array/ArrayBuffer to a base64 string (chunked to avoid
   * "Maximum call stack" on large buffers with String.fromCharCode.apply). */
  function bytesToBase64(input) {
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    var binary = "";
    var chunk = 0x8000; // 32k
    for (var i = 0; i < bytes.length; i += chunk) {
      var slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  /**
   * Fetch an image URL and return a base64 `data:` URI so exports are fully offline.
   * Falls back to the original URL string on any failure (caller counts failures).
   * Returns { dataUri, ok }.
   */
  async function imageToDataUri(url) {
    // Already a data URI — nothing to do.
    if (!url) return { dataUri: url || "", ok: false };
    if (/^data:/i.test(url)) return { dataUri: url, ok: true };
    try {
      var resp = await fetch(url, { credentials: "include", cache: "force-cache" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      var blob = await resp.blob();
      var dataUri = await blobToDataUri(blob);
      return { dataUri: dataUri, ok: true };
    } catch (e) {
      // Second attempt without credentials (some CDNs reject credentialed requests).
      try {
        var resp2 = await fetch(url, { credentials: "omit", cache: "force-cache" });
        if (!resp2.ok) throw new Error("HTTP " + resp2.status);
        var blob2 = await resp2.blob();
        var dataUri2 = await blobToDataUri(blob2);
        return { dataUri: dataUri2, ok: true };
      } catch (e2) {
        return { dataUri: url, ok: false };
      }
    }
  }

  function blobToDataUri(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error("FileReader failed")); };
      reader.readAsDataURL(blob);
    });
  }

  TK.base64 = {
    utf8Bytes: utf8Bytes,
    bytesToBase64: bytesToBase64,
    imageToDataUri: imageToDataUri,
    blobToDataUri: blobToDataUri
  };
})();
