/* Threadkeeper — content/export-button.js
 * A small, unobtrusive "Export" button injected into the page via Shadow DOM
 * (fully isolated styling, dark-mode aware, never touches host CSS). One click
 * exports the current conversation using the user's last-used settings. */
(function () {
  "use strict";
  window.TK = window.TK || {};

  var HOST_ID = "threadkeeper-export-host";
  var hostEl = null, shadow = null, btn = null, toastEl = null, busy = false;

  function init() {
    if (hostEl && document.getElementById(HOST_ID)) return;
    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    hostEl.setAttribute("aria-hidden", "false");
    // Host sits fixed; the button inside handles its own layout.
    hostEl.style.cssText = "all:initial;position:fixed;right:18px;bottom:96px;z-index:2147483000;";
    (document.body || document.documentElement).appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: "open" });
    shadow.innerHTML = template();
    btn = shadow.getElementById("tk-btn");
    toastEl = shadow.getElementById("tk-toast");
    btn.addEventListener("click", onClick);
    hostEl.style.display = "none"; // hidden until we confirm a conversation exists
  }

  function update(status) {
    if (!hostEl) return;
    var show = status && status.supported && status.hasConversation;
    hostEl.style.display = show ? "block" : "none";
  }

  async function onClick() {
    if (busy) return;
    if (!TK.core) { toast("Threadkeeper is still loading…", true); return; }
    busy = true;
    setBtnBusy(true);
    try {
      var settings = await TK.storage.getSettings();
      toast("Exporting as " + fmtLabel(settings.format) + "…", false, true);
      var res = await TK.core.runExport(settings);
      if (res && res.ok) {
        var warn = warnText(res.warnings);
        toast("Exported ✓" + (warn ? "  " + warn : ""), false);
      } else {
        toast("Export failed: " + ((res && res.error) || "unknown error"), true);
      }
    } catch (e) {
      toast("Export failed: " + String(e && e.message || e), true);
    } finally {
      busy = false;
      setBtnBusy(false);
    }
  }

  function warnText(w) {
    if (!w) return "";
    var parts = [];
    if (w.fallbackCount > 0) parts.push(w.fallbackCount + " fallback element" + (w.fallbackCount > 1 ? "s" : ""));
    if (w.imageFailures > 0) parts.push(w.imageFailures + " image" + (w.imageFailures > 1 ? "s" : "") + " not embedded");
    return parts.length ? "(" + parts.join(", ") + ")" : "";
  }

  function fmtLabel(f) { return f === "pdf" ? "PDF" : f === "html" ? "HTML" : "Markdown"; }

  function setBtnBusy(b) {
    if (!btn) return;
    btn.classList.toggle("busy", b);
    btn.setAttribute("aria-disabled", b ? "true" : "false");
  }

  var toastTimer = null;
  function toast(text, isError, sticky) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.className = "show" + (isError ? " error" : "");
    if (toastTimer) clearTimeout(toastTimer);
    if (!sticky) {
      toastTimer = setTimeout(function () { toastEl.className = ""; }, isError ? 6000 : 3500);
    }
  }

  function template() {
    return (
      "<style>" +
      ":host{ all: initial; }" +
      "*{ box-sizing: border-box; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }" +
      ".wrap{ display:flex; flex-direction:column; align-items:flex-end; gap:8px; }" +
      "#tk-btn{ display:inline-flex; align-items:center; gap:7px; cursor:pointer;" +
      "  background:#15211F; color:#FBF6EC; border:1px solid rgba(251,246,236,.14);" +
      "  font-size:12.5px; font-weight:600; line-height:1; letter-spacing:.1px;" +
      "  padding:9px 13px; border-radius:8px;" +
      "  transition:background .12s ease, opacity .12s ease; opacity:.94; }" +
      "#tk-btn:hover{ background:#1E2E2B; opacity:1; }" +
      "#tk-btn.busy{ opacity:.55; pointer-events:none; }" +
      "#tk-btn svg{ width:14px; height:14px; display:block; }" +
      "#tk-btn .spin{ display:none; width:13px; height:13px; border:2px solid rgba(251,246,236,.3);" +
      "  border-top-color:#E0A33E; border-radius:50%; animation:tk-spin .7s linear infinite; }" +
      "#tk-btn.busy .spin{ display:block; }" +
      "#tk-btn.busy .ico{ display:none; }" +
      "@keyframes tk-spin{ to{ transform:rotate(360deg); } }" +
      "#tk-toast{ max-width:236px; font-size:11.5px; line-height:1.4; color:#FBF6EC; background:#15211F;" +
      "  border:1px solid rgba(251,246,236,.12); padding:8px 11px; border-radius:8px;" +
      "  opacity:0; transform:translateY(3px); pointer-events:none; transition:opacity .15s, transform .15s; }" +
      "#tk-toast.show{ opacity:1; transform:translateY(0); }" +
      "#tk-toast.error{ border-color:#A3341F; color:#F0B4A6; }" +
      "</style>" +
      '<div class="wrap">' +
      '<div id="tk-toast"></div>' +
      '<button id="tk-btn" title="Export this conversation with Threadkeeper" aria-label="Export conversation">' +
      '<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg></span>' +
      '<span class="spin" aria-hidden="true"></span>' +
      "<span>Export</span>" +
      "</button>" +
      "</div>"
    );
  }

  TK.exportButton = { init: init, update: update };
})();
