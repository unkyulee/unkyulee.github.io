(() => {
  'use strict';

  const config = window.WAITLIST_CONFIG || {};
  const query = new URLSearchParams(window.location.search);
  const requestedProductId = query.get('id') || '';
  const waitlistId = query.get('waitlistId') || '';
  const state = { catalog: null, product: null, waitlist: null, submitting: false, submissionTimer: null };
  const nodes = {
    status: document.getElementById('product-status'),
    publicMessage: document.getElementById('public-message'),
    detail: document.getElementById('product-detail'),
    eyebrow: document.getElementById('product-eyebrow'),
    title: document.getElementById('product-title'),
    description: document.getElementById('product-description'),
    fullDescription: document.getElementById('product-full-description'),
    galleryMain: document.getElementById('gallery-main'),
    galleryThumbs: document.getElementById('gallery-thumbs'),
    form: document.getElementById('waitlist-form'),
    productId: document.getElementById('product-id'),
    selectedOptions: document.getElementById('selected-options'),
    optionFields: document.getElementById('option-fields'),
    registrationFields: document.getElementById('registration-fields'),
    total: document.getElementById('total-price'),
    rateNote: document.getElementById('rate-note'),
    submit: document.querySelector('.submit-button'),
    formStatus: document.getElementById('form-status'),
    summary: document.getElementById('waitlist-summary'),
    summaryQueue: document.getElementById('summary-queue'),
    summaryStatus: document.getElementById('summary-status'),
    summaryCreated: document.getElementById('summary-created'),
    email: document.getElementById('email'),
    registrationTarget: document.getElementById('registration-target'),
  };

  async function init() {
    if (!requestedProductId && !waitlistId) {
      showError('제품 ID가 없습니다. 제품 목록에서 다시 선택해 주세요.');
      return;
    }
    if (!/^https:\/\/.+\/exec(?:\?.*)?$/.test(String(config.apiUrl || ''))) {
      showError('웨이팅 리스트가 아직 연결되지 않았습니다. sales/config.js의 apiUrl을 확인해 주세요.');
      return;
    }

    try {
      const requests = [loadJsonp({ action: 'products' })];
      if (waitlistId) requests.push(loadJsonp({ action: 'waitlist', waitlistId }));
      const [catalog, waitlistPayload] = await Promise.all(requests);
      if (!catalog || !catalog.ok) throw new Error((catalog && catalog.error) || '제품 정보를 불러오지 못했습니다.');
      if (waitlistId && (!waitlistPayload || !waitlistPayload.ok)) {
        throw new Error((waitlistPayload && waitlistPayload.error) || '웨이팅 등록 내용을 불러오지 못했습니다.');
      }
      state.catalog = catalog;
      state.waitlist = waitlistPayload ? waitlistPayload.waitlist : null;
      const productId = requestedProductId || (state.waitlist && state.waitlist.productId);
      if (state.waitlist && requestedProductId && requestedProductId !== state.waitlist.productId) {
        throw new Error('제품 ID와 웨이팅 등록 정보가 일치하지 않습니다.');
      }
      state.product = (catalog.products || []).find((item) => String(item.id) === String(productId));
      if (!state.product && state.waitlist && state.waitlist.product) state.product = state.waitlist.product;
      if (!state.product) throw new Error('해당 제품을 찾을 수 없습니다.');
      renderProduct();
    } catch (error) {
      showError(error.message || String(error));
    }
  }

  function loadJsonp(params) {
    return new Promise((resolve, reject) => {
      const callbackName = `waitlistProduct_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('정보를 불러오는 시간이 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요.'));
      }, 20000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      };
      window[callbackName] = (payload) => { cleanup(); resolve(payload); };
      script.onerror = () => { cleanup(); reject(new Error('웨이팅 서비스에 연결할 수 없습니다.')); };
      const paramsWithCallback = new URLSearchParams({ ...params, callback: callbackName });
      script.src = `${config.apiUrl}${config.apiUrl.includes('?') ? '&' : '?'}${paramsWithCallback}`;
      document.head.appendChild(script);
    });
  }

  function renderProduct() {
    const product = state.product;
    const publicMessage = String(state.catalog.publicMessage || '').trim();
    nodes.publicMessage.textContent = publicMessage;
    nodes.publicMessage.hidden = !publicMessage;
    document.title = `${product.title} — Micro Journal`;
    nodes.title.textContent = product.title;
    nodes.description.textContent = product.description || '';
    nodes.description.hidden = !product.description;
    const fullDescription = String(product.fullDescription || '').trim();
    nodes.fullDescription.innerHTML = fullDescription && typeof window.renderSafeMarkdown === 'function'
      ? window.renderSafeMarkdown(fullDescription)
      : '';
    nodes.fullDescription.hidden = !fullDescription;
    nodes.productId.value = product.id;
    nodes.rateNote.textContent = state.catalog.currency.note || '';
    renderGallery(product);

    if (state.waitlist) renderRegisteredOptions();
    else renderRegistrationForm();

    nodes.status.hidden = true;
    nodes.detail.hidden = false;
  }

  function renderGallery(product) {
    const images = (product.images || []).length ? product.images : ['images/placeholder-product.svg'];
    const resolved = images.map(resolveImage);
    nodes.galleryMain.src = resolved[0];
    nodes.galleryMain.alt = product.title;
    nodes.galleryThumbs.innerHTML = resolved.map((src, index) => `
      <button type="button" class="gallery-thumb${index === 0 ? ' active' : ''}" data-image="${escapeAttribute(src)}" aria-label="제품 사진 ${index + 1} 보기">
        <img src="${escapeAttribute(src)}" alt="">
      </button>`).join('');
    nodes.galleryThumbs.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        nodes.galleryMain.src = button.dataset.image;
        nodes.galleryThumbs.querySelectorAll('button').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
      });
    });
  }

  function renderRegistrationForm() {
    nodes.form.addEventListener('submit', submitWaitlist);
    nodes.registrationTarget.addEventListener('load', finishRegistration);
    renderOptionGroups(state.product.optionGroups || []);
    updateDynamicOptions();
  }

  function renderRegisteredOptions() {
    const item = state.waitlist;
    nodes.eyebrow.textContent = '웨이팅 등록 내용';
    nodes.summary.hidden = false;
    nodes.summaryQueue.textContent = `${Number(item.queueNumber || 0)}번`;
    nodes.summaryStatus.textContent = item.statusLabel || item.status || '확인 중';
    nodes.summaryCreated.textContent = formatDate(item.createdAt);
    nodes.registrationFields.hidden = true;
    nodes.submit.hidden = true;
    nodes.formStatus.hidden = true;
    nodes.total.textContent = formatKrw(item.totalPriceKrw);
    nodes.rateNote.textContent = '웨이팅 등록 시 저장된 예상 가격입니다.';
    const options = Object.values(item.selectedOptions || {});
    if (!options.length) {
      nodes.optionFields.innerHTML = '<p class="saved-options-empty">선택 옵션: 기본 구성</p>';
      return;
    }
    nodes.optionFields.innerHTML = `<dl class="saved-options">${options.map((option) => `
      <div><dt>${escapeHtml(option.label || '옵션')}</dt><dd>${escapeHtml(option.valueLabel || option.value || option.valueId || '')}</dd></div>`).join('')}</dl>`;
  }

  function renderOptionGroups(groups) {
    nodes.optionFields.innerHTML = groups.map((group) => {
      const controlId = `option-${safeDomId(group.id)}`;
      const required = group.required ? ' required' : '';
      let control;
      if (group.inputType === 'text') {
        control = `<input id="${controlId}" type="text" data-option-control data-group-id="${escapeAttribute(group.id)}" maxlength="${Number(group.maxLength || 120)}" placeholder="${escapeAttribute(group.placeholder || '')}"${required}>`;
      } else {
        const choices = (group.choices || []).map((choice) =>
          `<option value="${escapeAttribute(choice.id)}"${choice.default ? ' selected' : ''}>${escapeHtml(choice.label)}${choice.priceUsd ? ` (+${formatKrw(choice.priceUsd * state.catalog.currency.usdKrwRate)})` : ''}</option>`
        ).join('');
        control = `<select id="${controlId}" data-option-control data-group-id="${escapeAttribute(group.id)}"${required}>${choices}</select>`;
      }
      return `<div class="field-group dynamic-option-group" data-group-wrapper="${escapeAttribute(group.id)}">
        <label for="${controlId}">${escapeHtml(group.label)}</label>${control}
      </div>`;
    }).join('');
    nodes.optionFields.querySelectorAll('[data-option-control]').forEach((control) => {
      control.addEventListener('input', updateDynamicOptions);
      control.addEventListener('change', updateDynamicOptions);
    });
  }

  function updateDynamicOptions() {
    const groups = state.product.optionGroups || [];
    const rawSelections = Object.fromEntries([...nodes.optionFields.querySelectorAll('[data-option-control]')]
      .map((control) => [control.dataset.groupId, control.value]));
    groups.forEach((group) => {
      const wrapper = nodes.optionFields.querySelector(`[data-group-wrapper="${cssEscape(group.id)}"]`);
      const control = wrapper && wrapper.querySelector('[data-option-control]');
      if (!wrapper || !control) return;
      const visible = isOptionGroupVisible(group, groups, rawSelections, new Set());
      wrapper.hidden = !visible;
      control.disabled = !visible;
      control.required = visible && Boolean(group.required);
    });
    const selections = collectVisibleSelections();
    const optionPrice = groups.reduce((sum, group) => {
      if (!(group.id in selections) || group.inputType === 'text') return sum;
      const choice = (group.choices || []).find((candidate) => candidate.id === selections[group.id]);
      return sum + (choice ? Number(choice.priceUsd || 0) : 0);
    }, 0);
    nodes.selectedOptions.value = JSON.stringify(selections);
    nodes.total.textContent = formatKrw((Number(state.product.basePriceUsd || 0) + optionPrice) * state.catalog.currency.usdKrwRate);
  }

  function collectVisibleSelections() {
    return Object.fromEntries([...nodes.optionFields.querySelectorAll('[data-option-control]')]
      .filter((control) => !control.disabled)
      .map((control) => [control.dataset.groupId, control.value]));
  }

  function isOptionGroupVisible(group, groups, selections, visiting) {
    if (!group.showIfGroup) return true;
    if (visiting.has(group.id)) return false;
    const parent = groups.find((candidate) => candidate.id === group.showIfGroup);
    if (!parent) return false;
    visiting.add(group.id);
    const parentVisible = isOptionGroupVisible(parent, groups, selections, visiting);
    visiting.delete(group.id);
    return parentVisible && selections[parent.id] === group.showIfChoice;
  }

  function submitWaitlist(event) {
    event.preventDefault();
    if (!nodes.form.reportValidity()) return;
    updateDynamicOptions();
    state.submitting = true;
    nodes.form.action = config.apiUrl;
    nodes.submit.disabled = true;
    nodes.formStatus.textContent = '웨이팅 리스트에 등록하고 있습니다…';
    try {
      window.sessionStorage.setItem('waitlistPendingEmail', nodes.email.value.trim().toLowerCase());
    } catch (_) {
      // Storage can be unavailable in privacy modes; the lookup page still opens.
    }
    state.submissionTimer = window.setTimeout(() => {
      if (!state.submitting) return;
      state.submitting = false;
      nodes.submit.disabled = false;
      nodes.formStatus.textContent = '등록 응답이 지연되고 있습니다. 다시 시도해 주세요.';
    }, 30000);
    nodes.form.submit();
  }

  function finishRegistration() {
    if (!state.submitting) return;
    state.submitting = false;
    window.clearTimeout(state.submissionTimer);
    window.location.assign('order.html?registered=1');
  }

  function resolveImage(value) {
    try { return new URL(String(value || 'images/placeholder-product.svg'), document.baseURI).href; }
    catch (_) { return 'images/placeholder-product.svg'; }
  }

  function formatKrw(value) {
    const rounded = Math.round(Number(value || 0) / 1000) * 1000;
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(rounded);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
  }

  function showError(message) {
    nodes.status.hidden = false;
    nodes.status.classList.add('error');
    nodes.status.textContent = message;
    nodes.detail.hidden = true;
  }

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value == null ? '' : value);
    return node.innerHTML;
  }

  function escapeAttribute(value) {
    return String(value == null ? '' : value).replace(/[&'"<>]/g, (char) => ({ '&': '&amp;', "'": '&#39;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[char]));
  }

  function safeDomId(value) { return String(value || '').replace(/[^a-z0-9_-]/gi, '-'); }
  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/[^a-z0-9_-]/gi, '\\$&');
  }

  init();
})();
