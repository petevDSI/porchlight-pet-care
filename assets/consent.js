/*
 * Porchlight agreement checkboxes.
 *
 * Needs /assets/legal-docs.js first (it lists every agreement with its current version and fingerprint).
 * Every box is unchecked by default, links to the full text, and hands back exactly what the person saw:
 * the document key, its version and fingerprint, and the words next to the box. The database refuses a
 * record whose version or fingerprint is not the current published one.
 *
 *   var box = PorchlightConsent.box([
 *     { id: 'terms', docs: ['terms', 'privacy', 'owner', 'home-safety'], parts: ['I have read and agree to the ', {doc:'terms'}, ', ', ...] },
 *     ...
 *   ]);
 *   container.appendChild(box.el);
 *   box.items()    -> [{ doc_key, version, sha256, text }, ...] for every checked box
 *   box.missing()  -> the first unchecked <input>, or null when everything is checked
 *
 * PorchlightConsent.gate(P) (portal only) blocks the page until a signed-in person has accepted the current
 * version of every agreement that applies to them.
 */
(function () {
  var L = (window.PorchlightLegal && window.PorchlightLegal.docs) || {};
  var C = window.PorchlightConsent = {};

  function doc(k) {
    if (!L[k]) throw new Error('Unknown agreement: ' + k);
    return L[k];
  }
  C.doc = doc;

  function link(k, label) {
    var a = document.createElement('a');
    a.href = doc(k).url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = label || doc(k).title;
    return a;
  }
  C.link = link;

  // A list like: "Terms of Service, Privacy Policy and Owner Service Agreement" built from document keys.
  function names(keys, lead) {
    var parts = [lead || ''];
    keys.forEach(function (k, i) {
      parts.push({ doc: k });
      if (i < keys.length - 2) parts.push(', ');
      else if (i === keys.length - 2) parts.push(keys.length > 2 ? ', and ' : ' and ');
    });
    return parts;
  }
  C.names = names;

  function build(group) {
    var input = document.createElement('input');
    input.type = 'checkbox'; input.id = 'consent-' + group.id; input.required = true;
    var span = document.createElement('span');
    group.parts.forEach(function (p) {
      span.appendChild(typeof p === 'string' ? document.createTextNode(p) : link(p.doc, p.label));
    });
    var label = document.createElement('label');
    label.className = 'check';
    label.style.cssText = 'margin-top:10px;align-items:flex-start;gap:10px;cursor:pointer';
    label.appendChild(input); label.appendChild(span);
    return { group: group, input: input, label: label, span: span };
  }

  C.box = function (groups) {
    var wrap = document.createElement('div');
    wrap.className = 'consent-box';
    var built = groups.map(build);
    built.forEach(function (b) { wrap.appendChild(b.label); });
    return {
      el: wrap,
      groups: built,
      items: function () {
        var out = [];
        built.forEach(function (b) {
          if (!b.input.checked) return;
          var text = b.span.textContent.replace(/\s+/g, ' ').trim();
          b.group.docs.forEach(function (k) { out.push({ doc_key: k, version: doc(k).version, sha256: doc(k).hash, text: text }); });
        });
        return out;
      },
      missing: function () {
        for (var i = 0; i < built.length; i++) if (!built[i].input.checked) return built[i].input;
        return null;
      },
      show: function (id, on) {   // optional boxes (for example the overnight box) can be switched on and off
        built.forEach(function (b) { if (b.group.id === id) { b.label.hidden = !on; b.input.required = !!on; if (!on) b.input.checked = false; } });
      }
    };
  };

  /* ---------- Standard wording, so every page says the same thing ---------- */

  C.groups = {
    owner: function () {
      return { id: 'owner', docs: ['terms', 'privacy', 'owner', 'home-safety'],
        parts: ['I have read and agree to the ', { doc: 'terms' }, ', ', { doc: 'privacy' }, ', ', { doc: 'owner' }, ', and ', { doc: 'home-safety' }, '.'] };
    },
    animals: function () {
      return { id: 'animals', docs: ['animals'],
        parts: ['I have counted every animal that will be in the home, including animals I am not booking care for. I understand each additional animal is charged for every night of an overnight stay, and on walks, drop-ins and check-ins when it needs care from my sitter (fish and reptiles that need no care are not charged), and that a sitter cannot be asked to ignore an animal in the home, even with automatic feeders or waterers. (', { doc: 'animals', label: 'Animals in the Home Policy' }, ')'] };
    },
    overnight: function () {
      return { id: 'overnight', docs: ['overnight'],
        parts: ['I have read and agree to the ', { doc: 'overnight' }, '. I confirm there are no hidden cameras or recording devices in the home, I have listed every camera, and no one will stay in the home except the people I listed.'] };
    },
    sitterApplication: function () {
      return { id: 'sitter-app', docs: ['terms', 'privacy'],
        parts: ['I have read and agree to the ', { doc: 'terms' }, ' and ', { doc: 'privacy' }, '.'] };
    },
    bgcheck: function () {
      return { id: 'bgcheck', docs: ['bgcheck'],
        parts: ['I have read the ', { doc: 'bgcheck' }, ' and I authorize Porchlight to obtain a background check on me. A background check is required before anyone works with Porchlight clients.'] };
    }
  };

  /* ---------- Portal gate: accept the current agreements before using the portal ---------- */

  C.gate = function (P) {
    var h = P.h;
    return P.sb.rpc('porchlight_consent_status').then(function (r) {
      if (r.error) { return null; }                       // never lock people out because of a hiccup
      var st = r.data || {};
      var missing = st.missing || [];
      if (!missing.length) return null;
      return new Promise(function (resolve) {
        var overlay = h('div', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title',
          style: 'position:fixed;inset:0;z-index:1000;background:rgba(20,35,59,.72);overflow:auto;padding:18px' });
        var panel = h('div', { class: 'panel stack', style: 'max-width:640px;margin:24px auto' });
        var err = h('p', { class: 'notice err', role: 'alert', hidden: true });
        var boxes = [];
        var list = h('div', { class: 'stack', style: 'gap:6px' });
        var isSitter = (st.roles || []).indexOf('sitter') >= 0;
        missing.forEach(function (m) {
          var input = h('input', { type: 'checkbox', id: 'gate-' + m.doc_key });
          var a = h('a', { href: m.url, target: '_blank', rel: 'noopener', text: m.title });
          var label = h('label', { class: 'check', style: 'cursor:pointer' }, input, h('span', null, 'I have read and agree to the ', a, '.'));
          boxes.push({ m: m, input: input, label: label });
          list.appendChild(label);
        });
        var btn = h('button', { type: 'button', class: 'btn', text: 'Accept and continue' });
        btn.addEventListener('click', function () {
          err.hidden = true;
          var bad = boxes.filter(function (b) { return !b.input.checked; })[0];
          if (bad) { err.textContent = 'Please check each box to continue.'; err.hidden = false; bad.input.focus(); return; }
          btn.disabled = true; btn.textContent = 'Saving…';
          var items = boxes.map(function (b) {
            return { doc_key: b.m.doc_key, version: b.m.version, sha256: b.m.sha256, text: b.label.textContent.replace(/\s+/g, ' ').trim() };
          });
          P.sb.rpc('porchlight_record_consents', { p_items: items }).then(function (res) {
            if (res.error) throw res.error;
            overlay.remove(); resolve();
          }).catch(function (e) {
            err.textContent = (P.errMsg ? P.errMsg(e) : (e && e.message)) || 'Something went wrong. Please try again.'; err.hidden = false;
            btn.disabled = false; btn.textContent = 'Accept and continue';
          });
        });
        panel.appendChild(h('p', { class: 'eyebrow', text: isSitter ? 'Before you continue' : 'A quick review' }));
        panel.appendChild(h('h2', { id: 'gate-title', class: 'display', style: 'font-size:28px', text: 'Please review and accept our agreements' }));
        panel.appendChild(h('p', { class: 'muted', text: 'We keep a record of what you accepted and when, so everyone knows the rules. Click a title to read it.' }));
        panel.appendChild(list); panel.appendChild(err); panel.appendChild(btn);
        overlay.appendChild(panel); document.body.appendChild(overlay);
        var first = boxes[0]; if (first) first.input.focus();
      });
    });
  };
})();
