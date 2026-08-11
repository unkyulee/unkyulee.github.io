(() => {
  'use strict';

  const config = window.WAITLIST_CONFIG || {};
  const nodes = {
    status: document.getElementById('catalog-status'),
    publicMessage: document.getElementById('public-message'),
    grid: document.getElementById('product-grid'),
  };

  async function init() {
    if (!/^https:\/\/.+\/exec(?:\?.*)?$/.test(String(config.apiUrl || ''))) {
      showError('웨이팅 리스트가 아직 연결되지 않았습니다. sales/config.js의 apiUrl을 확인해 주세요.');
      return;
    }
    try {
      const catalog = await loadJsonp({ action: 'products' });
      if (!catalog || !catalog.ok) throw new Error((catalog && catalog.error) || '제품 목록을 불러오지 못했습니다.');
      renderCatalog(catalog);
    } catch (error) {
      showError(error.message || String(error));
    }
  }

  function loadJsonp(params) {
    return new Promise((resolve, reject) => {
      const callbackName = `waitlistCatalog_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('제품 목록 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'));
      }, 15000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      };
      window[callbackName] = (payload) => { cleanup(); resolve(payload); };
      script.onerror = () => { cleanup(); reject(new Error('제품 목록 서비스에 연결할 수 없습니다.')); };
      const query = new URLSearchParams({ ...params, callback: callbackName });
      script.src = `${config.apiUrl}${config.apiUrl.includes('?') ? '&' : '?'}${query}`;
      document.head.appendChild(script);
    });
  }

  function renderCatalog(catalog) {
    const products = catalog.products || [];
    const publicMessage = String(catalog.publicMessage || '').trim();
    nodes.publicMessage.textContent = publicMessage;
    nodes.publicMessage.hidden = !publicMessage;
    nodes.status.hidden = true;
    if (!products.length) {
      nodes.status.hidden = false;
      nodes.status.textContent = '현재 웨이팅 리스트를 받고 있는 제품이 없습니다.';
      return;
    }
    nodes.grid.innerHTML = products.map((product, index) => {
      const image = resolveImage((product.images || [])[0]);
      const price = formatKrw(Number(product.basePriceUsd || 0) * Number(catalog.currency.usdKrwRate || 0));
      const href = `product.html?id=${encodeURIComponent(product.id)}`;
      return `
        <article class="product-card" style="--delay:${index * 65}ms">
          <a class="product-open" href="${escapeAttribute(href)}">
            <span class="product-image"><img src="${escapeAttribute(image)}" alt="" loading="lazy"></span>
            <span class="product-meta">
              <span class="product-title">${escapeHtml(product.title)}</span>
              <span class="product-copy">${escapeHtml(product.description)}</span>
              <span class="product-bottom"><span>${price}부터</span><span class="round-arrow">↗</span></span>
            </span>
          </a>
        </article>`;
    }).join('');
  }

  function resolveImage(value) {
    try { return new URL(String(value || 'images/placeholder-product.svg'), document.baseURI).href; }
    catch (_) { return 'images/placeholder-product.svg'; }
  }

  function formatKrw(value) {
    const rounded = Math.round(Number(value || 0) / 1000) * 1000;
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(rounded);
  }

  function showError(message) {
    nodes.status.hidden = false;
    nodes.status.classList.add('error');
    nodes.status.textContent = message;
  }

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value == null ? '' : value);
    return node.innerHTML;
  }

  function escapeAttribute(value) {
    return String(value == null ? '' : value).replace(/[&'"<>]/g, (char) => ({ '&': '&amp;', "'": '&#39;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[char]));
  }

  init();
})();
