/* LETUS Assist - 小さな通知（元に戻す付き）
 * Shadow DOM に出すので LETUS の CSS と干渉しない。
 */
(function (g) {
  'use strict';

  const HOST_ID = 'la-toast-host';
  const CSS = `
:host { all: initial; }
.box {
  position: fixed;
  left: 50%;
  bottom: max(24px, 5vh);
  transform: translateX(-50%) translateY(16px);
  display: flex;
  align-items: center;
  gap: .75em;
  max-width: min(560px, 92vw);
  padding: .7em 1em;
  border-radius: 10px;
  background: #111827;
  color: #f8fafc;
  font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  box-shadow: 0 10px 30px rgba(0,0,0,.35);
  opacity: 0;
  pointer-events: auto;
  transition: opacity .2s ease, transform .25s cubic-bezier(.2,1.3,.4,1);
  z-index: 2147483600;
}
.box.on { opacity: 1; transform: translateX(-50%) translateY(0); }
.text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.text b { color: #fff; }
.action {
  flex: 0 0 auto;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: .35em .9em;
  border-radius: 999px;
  color: #052e16;
  background: #86efac;
}
.action:hover { filter: brightness(1.08); }
.close {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: #94a3b8;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 .2em;
}
.close:hover { color: #fff; }
`;

  let host = null;
  let refs = null;
  let timer = 0;

  function ensure() {
    if (host && host.isConnected) return refs;
    const old = document.getElementById(HOST_ID);
    if (old) old.remove();

    host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;

    const box = document.createElement('div');
    box.className = 'box';
    const text = document.createElement('div');
    text.className = 'text';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'action hidden';
    action.style.display = 'none';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = '\u00D7';
    close.title = '閉じる';
    box.append(text, action, close);
    root.append(style, box);

    document.documentElement.appendChild(host);
    refs = { box, text, action, close };
    return refs;
  }

  function hide() {
    if (!refs) return;
    refs.box.classList.remove('on');
    clearTimeout(timer);
    const h = host;
    setTimeout(() => { if (h && h.parentNode) h.remove(); }, 260);
    host = null;
    refs = null;
  }

  /**
   * @param {{text:string, actionLabel?:string, onAction?:Function, ms?:number}} opts
   */
  function show(opts) {
    const r = ensure();
    clearTimeout(timer);

    r.text.innerHTML = opts.text || '';

    if (opts.actionLabel && typeof opts.onAction === 'function') {
      r.action.style.display = '';
      r.action.textContent = opts.actionLabel;
      r.action.onclick = (e) => {
        e.stopPropagation();
        hide();
        try { opts.onAction(); } catch (err) { /* ignore */ }
      };
    } else {
      r.action.style.display = 'none';
      r.action.onclick = null;
    }
    r.close.onclick = (e) => { e.stopPropagation(); hide(); };

    requestAnimationFrame(() => r.box.classList.add('on'));
    timer = setTimeout(hide, Math.max(1500, opts.ms || 6000));
  }

  g.LA_TOAST = { show, hide };
})(window);
