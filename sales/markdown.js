(() => {
  'use strict';

  function renderSafeMarkdown(value) {
    const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (/^```/.test(line.trim())) {
        const code = [];
        index += 1;
        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          code.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
        output.push('<hr>');
        index += 1;
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
          index += 1;
        }
        output.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''));
          index += 1;
        }
        output.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        const quoted = [];
        while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
          quoted.push(lines[index].replace(/^\s*>\s?/, ''));
          index += 1;
        }
        output.push(`<blockquote>${quoted.map(renderInline).join('<br>')}</blockquote>`);
        continue;
      }

      const paragraph = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !startsBlock(lines[index])) {
        paragraph.push(lines[index]);
        index += 1;
      }
      output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
    }

    return output.join('');
  }

  function startsBlock(line) {
    return /^(?:#{1,6}\s+|```|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*>\s?|\s*(?:---+|___+|\*\*\*+)\s*$)/.test(line);
  }

  function renderInline(value) {
    const tokens = [];
    const store = (html) => {
      const token = `\uE000${tokens.length}\uE001`;
      tokens.push(html);
      return token;
    };
    let text = String(value || '');

    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, href) => {
      const safe = safeUrl(href, false);
      return safe ? store(`<img src="${escapeAttribute(safe)}" alt="${escapeAttribute(alt)}" loading="lazy">`) : alt;
    });
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const safe = safeUrl(href, true);
      if (!safe) return label;
      const external = /^https?:\/\//i.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return store(`<a href="${escapeAttribute(safe)}"${external}>${escapeHtml(label)}</a>`);
    });
    text = text.replace(/`([^`]+)`/g, (_, code) => store(`<code>${escapeHtml(code)}</code>`));

    text = escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');

    return text.replace(/\uE000(\d+)\uE001/g, (_, tokenIndex) => tokens[Number(tokenIndex)] || '');
  }

  function safeUrl(value, allowMailto) {
    const url = String(value || '').trim();
    if (!url || /[\u0000-\u001f\u007f]/.test(url)) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (allowMailto && /^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return url;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || /^\/\//.test(url)) return '';
    return url;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  window.renderSafeMarkdown = renderSafeMarkdown;
})();
