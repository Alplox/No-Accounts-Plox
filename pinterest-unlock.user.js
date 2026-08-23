// ==UserScript==
// @name         No Accounts Plox - Pinterest unlock
// @namespace    https://github.com/Alplox/No-Accounts-Plox
// @version      1.0.0
// @description  Restores click-through to expanded pin pages on Pinterest's gated feed (companion to the filter list)
// @author       Alplox
// @match        *://*.pinterest.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const MAP = new Map();

  function collectIds(node, depth) {
    if (!node || typeof node !== 'object' || depth > 30) return;
    if (typeof node.id === 'string' && /^\d{10,}$/.test(node.id) && (node.images || node.video_list)) {
      const sources = [...Object.values(node.images || {}), ...Object.values(node.video_list || {})];
      for (const v of sources) {
        const url = v && typeof v === 'object' ? v.url : v;
        const m = typeof url === 'string' ? url.match(/\/([0-9a-f]{32})\./) : null;
        if (m) MAP.set(m[1], node.id);
      }
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') collectIds(v, depth + 1);
    }
  }

  function scan(text) {
    if (MAP.size > 5000) return;
    if (!/i\.pinimg\.com/.test(text)) return;
    try {
      collectIds(JSON.parse(text), 0);
    } catch (e) { /* non-JSON response */ }
  }

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener('load', () => {
      try { scan(this.responseText); } catch (e) { /* noop */ }
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
    const id = m && MAP.get(m[1]);
    if (id) {
      e.preventDefault();
      e.stopPropagation();
      location.assign('/pin/' + id + '/');
    }
  }, true);

  const style = document.createElement('style');
  style.textContent = '[data-test-id="gated-pin-rep"] { cursor: pointer; }';
  document.documentElement.appendChild(style);
})();
