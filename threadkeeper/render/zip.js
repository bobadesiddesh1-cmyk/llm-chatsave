/* Threadkeeper — render/zip.js
 * Hand-written, dependency-free STORE-only (method 0, no compression) ZIP writer,
 * with CRC-32 implemented from scratch. Produces standard archives openable by
 * macOS Finder, Windows Explorer, and 7-Zip.
 *
 * Structure written (PKZIP APPNOTE, all little-endian):
 *   [ local file header + filename + file data ] * N
 *   [ central directory file header + filename ] * N
 *   [ end of central directory record ]
 *
 * General-purpose bit flag sets bit 11 (0x0800) => filenames are UTF-8. */
(function () {
  "use strict";
  window.TK = window.TK || {};

  // ---- CRC-32 (reflected, polynomial 0xEDB88320) -----------------------------

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ---- Byte buffer helper ----------------------------------------------------

  function ByteWriter() { this.parts = []; this.length = 0; }
  ByteWriter.prototype.u16 = function (v) {
    this.parts.push(new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]));
    this.length += 2;
  };
  ByteWriter.prototype.u32 = function (v) {
    this.parts.push(new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]));
    this.length += 4;
  };
  ByteWriter.prototype.bytes = function (u8) {
    this.parts.push(u8);
    this.length += u8.length;
  };
  ByteWriter.prototype.toUint8Array = function () {
    var out = new Uint8Array(this.length);
    var offset = 0;
    for (var i = 0; i < this.parts.length; i++) {
      out.set(this.parts[i], offset);
      offset += this.parts[i].length;
    }
    return out;
  };

  // ---- DOS date/time ---------------------------------------------------------

  function dosDateTime(date) {
    var d = date || new Date();
    var year = d.getFullYear();
    if (year < 1980) year = 1980;
    var time = ((d.getHours() & 0x1F) << 11) |
               ((d.getMinutes() & 0x3F) << 5) |
               ((Math.floor(d.getSeconds() / 2)) & 0x1F);
    var dosdate = (((year - 1980) & 0x7F) << 9) |
                  (((d.getMonth() + 1) & 0x0F) << 5) |
                  (d.getDate() & 0x1F);
    return { time: time & 0xFFFF, date: dosdate & 0xFFFF };
  }

  // ---- Public: build a ZIP ---------------------------------------------------

  /**
   * files: [{ name:string, data:string|Uint8Array }]
   * returns a Blob (application/zip).
   */
  function createZip(files, date) {
    var dt = dosDateTime(date);
    var entries = [];
    var localChunks = [];
    var offset = 0;

    var UTF8_FLAG = 0x0800; // general purpose bit 11
    var VERSION = 20;       // 2.0
    var METHOD = 0;         // store

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var nameBytes = TK.base64.utf8Bytes(f.name);
      var dataBytes = f.data instanceof Uint8Array ? f.data : TK.base64.utf8Bytes(String(f.data));
      var crc = crc32(dataBytes);
      var size = dataBytes.length;

      // ---- Local file header ----
      var lh = new ByteWriter();
      lh.u32(0x04034b50);      // local file header signature
      lh.u16(VERSION);          // version needed to extract
      lh.u16(UTF8_FLAG);        // general purpose bit flag
      lh.u16(METHOD);           // compression method (store)
      lh.u16(dt.time);          // last mod file time
      lh.u16(dt.date);          // last mod file date
      lh.u32(crc);              // crc-32
      lh.u32(size);             // compressed size (== uncompressed for store)
      lh.u32(size);             // uncompressed size
      lh.u16(nameBytes.length); // file name length
      lh.u16(0);                // extra field length
      lh.bytes(nameBytes);      // file name
      var localHeader = lh.toUint8Array();

      localChunks.push(localHeader);
      localChunks.push(dataBytes);

      entries.push({
        nameBytes: nameBytes,
        crc: crc,
        size: size,
        offset: offset,
        time: dt.time,
        date: dt.date
      });

      offset += localHeader.length + dataBytes.length;
    }

    // ---- Central directory ----
    var central = new ByteWriter();
    var centralStart = offset;
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      central.u32(0x02014b50);   // central file header signature
      central.u16(VERSION);       // version made by
      central.u16(VERSION);       // version needed to extract
      central.u16(UTF8_FLAG);     // general purpose bit flag
      central.u16(METHOD);        // compression method
      central.u16(e.time);        // last mod time
      central.u16(e.date);        // last mod date
      central.u32(e.crc);         // crc-32
      central.u32(e.size);        // compressed size
      central.u32(e.size);        // uncompressed size
      central.u16(e.nameBytes.length); // file name length
      central.u16(0);             // extra field length
      central.u16(0);             // file comment length
      central.u16(0);             // disk number start
      central.u16(0);             // internal file attributes
      central.u32(0);             // external file attributes
      central.u32(e.offset);      // relative offset of local header
      central.bytes(e.nameBytes); // file name
    }
    var centralBytes = central.toUint8Array();

    // ---- End of central directory ----
    var eocd = new ByteWriter();
    eocd.u32(0x06054b50);           // EOCD signature
    eocd.u16(0);                     // number of this disk
    eocd.u16(0);                     // disk with start of central directory
    eocd.u16(entries.length);        // entries on this disk
    eocd.u16(entries.length);        // total entries
    eocd.u32(centralBytes.length);   // size of central directory
    eocd.u32(centralStart);          // offset of central directory
    eocd.u16(0);                     // .ZIP comment length
    var eocdBytes = eocd.toUint8Array();

    var blobParts = localChunks.concat([centralBytes, eocdBytes]);
    return new Blob(blobParts, { type: "application/zip" });
  }

  TK.zip = { createZip: createZip, crc32: crc32 };
})();
