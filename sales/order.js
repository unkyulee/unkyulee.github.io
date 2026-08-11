(() => {
  'use strict';

  const config = window.WAITLIST_CONFIG || {};
  const publicMessageNode = document.getElementById('public-message');
  const form = document.getElementById('lookup-form');
  const emailInput = document.getElementById('lookup-email');
  const statusNode = document.getElementById('lookup-status');
  const resultsNode = document.getElementById('reservation-results');
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!/^https:\/\/.+\/exec(?:\?.*)?$/.test(String(config.apiUrl || ''))) {
      showError('주문 내용 조회 서비스가 아직 연결되지 않았습니다.');
      return;
    }

    submitButton.disabled = true;
    statusNode.textContent = '등록 내용을 찾고 있습니다…';
    resultsNode.innerHTML = '';
    try {
      const normalizedEmail = emailInput.value.trim().toLowerCase();
      const emailHash = await sha256Hex(normalizedEmail);
      const payload = await loadReservations(emailHash);
      if (!payload.ok) throw new Error(payload.error || '조회하지 못했습니다.');
      renderReservations(payload.reservations || []);
    } catch (error) {
      showError(error.message || String(error));
    } finally {
      submitButton.disabled = false;
    }
  });

  loadPublicMessage();
  restorePendingLookup();

  function loadPublicMessage() {
    if (!/^https:\/\/.+\/exec(?:\?.*)?$/.test(String(config.apiUrl || ''))) return;
    const callbackName = `waitlistNotice_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    let timeout;
    const cleanup = () => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    };
    timeout = window.setTimeout(cleanup, 15000);
    window[callbackName] = (payload) => {
      cleanup();
      if (!payload || !payload.ok) return;
      const message = String(payload.publicMessage || '').trim();
      publicMessageNode.textContent = message;
      publicMessageNode.hidden = !message;
    };
    script.onerror = cleanup;
    const separator = config.apiUrl.includes('?') ? '&' : '?';
    script.src = `${config.apiUrl}${separator}action=products&callback=${encodeURIComponent(callbackName)}`;
    document.head.appendChild(script);
  }

  function restorePendingLookup() {
    const pageQuery = new URLSearchParams(window.location.search);
    if (pageQuery.get('registered') !== '1') return;
    let pendingEmail = '';
    try {
      pendingEmail = window.sessionStorage.getItem('waitlistPendingEmail') || '';
      window.sessionStorage.removeItem('waitlistPendingEmail');
    } catch (_) {
      // Storage can be unavailable in privacy modes.
    }
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('registered');
    window.history.replaceState({}, '', cleanUrl);
    statusNode.textContent = pendingEmail
      ? '방금 등록한 웨이팅 내용을 확인하고 있습니다…'
      : '등록한 이메일 주소를 입력하면 웨이팅 내용을 확인할 수 있습니다.';
    if (!pendingEmail) return;
    emailInput.value = pendingEmail;
    window.setTimeout(() => {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else submitButton.click();
    }, 0);
  }

  async function sha256Hex(value) {
    if (!window.crypto || !window.crypto.subtle) throw new Error('이 브라우저에서는 안전한 이메일 조회를 지원하지 않습니다.');
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function loadReservations(emailHash) {
    return new Promise((resolve, reject) => {
      const callbackName = `waitlistLookup_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('조회 시간이 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요.'));
      }, 20000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      };
      window[callbackName] = (payload) => { cleanup(); resolve(payload); };
      script.onerror = () => { cleanup(); reject(new Error('주문 내용 조회 서비스에 연결할 수 없습니다.')); };
      const separator = config.apiUrl.includes('?') ? '&' : '?';
      script.src = `${config.apiUrl}${separator}action=reservations&emailHash=${encodeURIComponent(emailHash)}&callback=${encodeURIComponent(callbackName)}`;
      document.head.appendChild(script);
    });
  }

  function renderReservations(reservations) {
    if (!reservations.length) {
      statusNode.textContent = '이 이메일로 등록된 웨이팅 내역이 없습니다.';
      return;
    }
    statusNode.textContent = `총 ${reservations.length}개의 웨이팅 내역이 있습니다.`;
    resultsNode.innerHTML = reservations.map((item) => `
      <article class="reservation-card">
        <div class="reservation-card-head">
          <div><span class="reservation-number">대기 ${Number(item.queueNumber)}번</span><h2>${escapeHtml(item.productTitle)}</h2></div>
          <span class="reservation-status">${escapeHtml(item.statusLabel)}</span>
        </div>
        <dl>
          <div><dt>선택 옵션</dt><dd>${escapeHtml(item.optionSummary || '기본 구성')}</dd></div>
          <div><dt>예상 가격</dt><dd>${formatKrw(item.totalPriceKrw)}</dd></div>
          <div><dt>등록 시간</dt><dd>${formatDate(item.createdAt)}</dd></div>
        </dl>
        <a class="reservation-detail-link" href="${escapeAttribute(buildProductUrl(item))}">제품과 선택 옵션 자세히 보기 →</a>
      </article>`).join('');
  }

  function buildProductUrl(item) {
    const params = new URLSearchParams({ id: String(item.productId || ''), waitlistId: String(item.waitlistId || '') });
    return `product.html?${params}`;
  }

  function showError(message) {
    statusNode.textContent = message;
    resultsNode.innerHTML = '';
  }

  function formatKrw(value) {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
  }

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value == null ? '' : value);
    return node.innerHTML;
  }

  function escapeAttribute(value) {
    return String(value == null ? '' : value).replace(/[&'"<>]/g, (char) => ({ '&': '&amp;', "'": '&#39;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[char]));
  }
})();
