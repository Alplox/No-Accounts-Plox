// ==UserScript==
// @name         No Accounts Plox - Pinterest unlock
// @namespace    https://github.com/Alplox/No-Accounts-Plox
// @version      1.1.0
// @description  Restores click-through to expanded pin pages on Pinterest's gated feed (companion to the filter list)
// @author       Alplox
// @match        *://*.pinterest.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const MAP = new Map();

  function savePin(id, sources) {
    for (const v of sources) {
      const url = v && typeof v === 'object' ? v.url : v;
      const m = typeof url === 'string' ? url.match(/\/([0-9a-f]{32})\./) : null;
      if (m) MAP.set(m[1], String(id));
    }
  }

  function collectIds(node, depth) {
    if (!node || typeof node !== 'object' || depth > 30) return;
    // Standard pin objects: { id, images | video_list }
    if (node.id != null && /^\d{10,}$/.test(String(node.id)) && (node.images || node.video_list)) {
      savePin(node.id, [...Object.values(node.images || {}), ...Object.values(node.video_list || {})]);
    }
    // Impression/tracking events: { pinIdStr, imageURL }
    if (node.pinIdStr && node.imageURL) {
      savePin(node.pinIdStr, [node.imageURL]);
    }
    // GraphQL/Relay pin nodes (related pins on /pin/ pages): { entityId, imageSignature }
    if (node.entityId && /^[0-9a-f]{32}$/.test(String(node.imageSignature))) {
      const m = String(node.entityId).match(/\d{10,}/);
      if (m) MAP.set(String(node.imageSignature), m[0]);
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') collectIds(v, depth + 1);
    }
  }

  function scan(text) {
    if (MAP.size > 5000) return;
    if (!/pinimg\.com/.test(text)) return;
    try {
      collectIds(JSON.parse(text), 0);
    } catch (e) { /* non-JSON response */ }
  }

  // Server-rendered payloads embedded in the initial HTML (e.g. __PWS_DATA__)
  function scanInlineJson() {
    for (const s of document.querySelectorAll('script[type="application/json"]')) scan(s.textContent);
  }

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener('load', () => {
      try {
        scan(this.responseText);
      } catch (e) {
        // responseType "json"/"arraybuffer" makes responseText throw; scan the decoded object instead
        try { collectIds(this.response, 0); } catch (e2) { /* noop */ }
      }
    });
    return origOpen.apply(this, args);
  };

  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    try {
      res.clone().text().then(scan).catch(() => {});
    } catch (e) { /* noop */ }
    return res;
  };

  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-test-id="gated-pin-rep"]');
    if (!card) return;
    const img = card.querySelector('img[src*="pinimg.com"]');
    const m = img && img.src.match(/\/([0-9a-f]{32})\./);
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    const go = () => {
      const id = MAP.get(m[1]);
      if (id) location.assign('/pin/' + id + '/');
    };
    go();
    // Impression batches flush on a timer; retry before giving up.
    // Dead click if Pinterest truly sent no data for this pin anywhere; acceptable vs login modal
    setTimeout(go, 500);
    setTimeout(go, 1500);
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanInlineJson);
  } else {
    scanInlineJson();
  }

  const style = document.createElement('style');
  style.textContent = '[data-test-id="gated-pin-rep"] { cursor: pointer; }';
  document.documentElement.appendChild(style);
})();
