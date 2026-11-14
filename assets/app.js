/* Porchlight shared helpers: Supabase client, field definitions, small DOM builders. */
(function () {
  var SUPABASE_URL = 'https://vnwifihyyivxjsdvxlsv.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZud2lmaWh5eWl2eGpzZHZ4bHN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2MjcxNDcsImV4cCI6MjExMDIwMzE0N30.niE-ejnfYbPk6GqyH2ZlNtXtiBlrZxvSi-mcLmW9Lck';

  var P = window.Porchlight = {};
  P.SUPABASE_URL = SUPABASE_URL;
  P.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'porchlight-auth' }
  });
  P.BUCKET = 'porchlight-photos';

  P.TOWNS = [
    ['belmont', 'Belmont'], ['mt-holly', 'Mt. Holly'], ['cramerton', 'Cramerton'], ['mcadenville', 'McAdenville'],
    ['lake-wylie', 'Lake Wylie'], ['east-gastonia', 'East Gastonia'], ['lowell', 'Lowell'], ['ranlo', 'Ranlo'],
    ['clover', 'Clover'], ['york', 'York'], ['india-hook', 'India Hook'], ['newport', 'Newport']
  ];
  P.townName = function (id) { for (var i = 0; i < P.TOWNS.length; i++) if (P.TOWNS[i][0] === id) return P.TOWNS[i][1]; return ''; };

  /* ---------- Field definitions (shared by intake, client edit and Kraig's edit) ---------- */
  P.FIELDS = {
    household: [
      { k: 'name', label: 'Your name', req: true, auto: 'name' },
      { k: 'email', label: 'Email', type: 'email', req: true, auto: 'email', hint: 'Use this email to sign in to your client portal.' },
      { k: 'phone', label: 'Mobile phone', type: 'tel', req: true, auto: 'tel' },
      { k: 'town_id', label: 'Town', type: 'town', req: true },
      { k: 'address', label: 'Street address', req: true, wide: true, auto: 'street-address' },
      { k: 'alt_contact_name', label: 'Backup contact', hint: 'Someone we can call if we can’t reach you' },
      { k: 'alt_contact_phone', label: 'Backup contact phone', type: 'tel' }
    ],
    vet: [
      { k: 'vet_clinic', label: 'Your vet (clinic name)' },
      { k: 'vet_phone', label: 'Vet phone', type: 'tel' },
      { k: 'emergency_clinic', label: 'Preferred emergency clinic', wide: true },
      { k: 'vet_spend_limit', label: 'Care we may approve if we can’t reach you', placeholder: 'e.g. up to $500', wide: true },
      { k: 'vet_records_ok', label: 'May we confirm vaccination records with your vet?', type: 'yesno', wide: true, hint: 'Handy if you can’t find a certificate.' }
    ],
    access: [
      { k: 'access_method', label: 'How we get in', type: 'select', options: ['', 'Lockbox', 'Door keypad / smart lock', 'Key kept by Porchlight', 'Hidden key', 'Someone will be home', 'Other'] },
      { k: 'lockbox_code', label: 'Lockbox code', secret: true },
      { k: 'door_code', label: 'Door or garage code', secret: true },
      { k: 'alarm_code', label: 'Alarm code', secret: true, hint: 'And the alarm company name, if any' },
      { k: 'key_notes', label: 'Entry instructions', type: 'textarea', wide: true, placeholder: 'Which door, lockbox location, tricky locks, gate latch' },
      { k: 'wifi', label: 'Wi-Fi name and password', secret: true },
      { k: 'parking', label: 'Where to park' }
    ],
    home: [
      { k: 'home_notes', label: 'Home care', type: 'textarea', wide: true, placeholder: 'Mail and packages, plants to water, trash day, lights, blinds, thermostat' },
      { k: 'house_rules', label: 'House rules', type: 'textarea', wide: true, placeholder: 'Rooms that are off-limits, furniture pets aren’t allowed on, shoes off, etc.' }
    ],
    pet: [
      { k: 'name', label: 'Pet’s name', req: true },
      { k: 'species', label: 'Type', type: 'select', options: ['Dog', 'Cat', 'Other'] },
      { k: 'breed', label: 'Breed' },
      { k: 'age', label: 'Age', placeholder: 'e.g. 4 years' },
      { k: 'weight_lbs', label: 'Weight (lb)', type: 'number' },
      { k: 'sex', label: 'Sex', type: 'select', options: ['', 'Male', 'Female'] },
      { k: 'spayed_neutered', label: 'Spayed / neutered', type: 'yesno' },
      { k: 'vaccinations_current', label: 'Vaccinations up to date', type: 'yesno' },
      { k: 'rabies_expires_on', label: 'Rabies vaccine expires', type: 'date', hint: 'The "due" or "expires" date on the certificate' },
      { k: 'food', label: 'Food (brand / type)' },
      { k: 'food_amount', label: 'Amount per meal' },
      { k: 'feeding_times', label: 'Feeding times', placeholder: 'e.g. 7am and 5pm' },
      { k: 'treats', label: 'Treats allowed?' },
      { k: 'medications', label: 'Medications', type: 'textarea', wide: true, placeholder: 'Name, dose, time of day, how to give it (in food, pill pocket)' },
      { k: 'medical_notes', label: 'Health conditions or allergies', type: 'textarea', wide: true },
      { k: 'behavior', label: 'Temperament', type: 'textarea', wide: true, placeholder: 'With strangers, kids, other dogs, cats. Anything that scares them.' },
      { k: 'walk_notes', label: 'Walking notes', type: 'textarea', wide: true, placeholder: 'Leash or harness, pulling, favorite route, things to avoid' },
      { k: 'quirks', label: 'Hiding spots, habits, quirks', type: 'textarea', wide: true }
    ]
  };

  /* ---------- DOM helpers (all text goes in via textContent, never innerHTML) ---------- */
  P.h = function (tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  };
  P.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  P.toast = function (msg) {
    var t = P.h('div', { class: 'toast', role: 'status', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  };

  /* Render a set of fields into a grid. Returns { el, read() }. */
  P.renderFields = function (fields, values, opts) {
    values = values || {}; opts = opts || {};
    var grid = P.h('div', { class: 'grid' });
    var inputs = {};
    var uid = 'f' + Math.random().toString(36).slice(2, 8);
    fields.forEach(function (f) {
      if (opts.skip && opts.skip.indexOf(f.k) >= 0) return;
      var id = uid + '-' + f.k;
      var v = values[f.k];
      var input;
      if (f.type === 'textarea') {
        input = P.h('textarea', { id: id, placeholder: f.placeholder || null, maxlength: 3000 });
        input.value = v || '';
      } else if (f.type === 'select' || f.type === 'town' || f.type === 'yesno') {
        var opts2 = f.type === 'town' ? [['', 'Choose your town']].concat(P.TOWNS)
          : f.type === 'yesno' ? [['', 'Not sure'], ['true', 'Yes'], ['false', 'No']]
          : f.options.map(function (o) { return [o, o || 'Choose one']; });
        input = P.h('select', { id: id });
        opts2.forEach(function (o) { input.appendChild(P.h('option', { value: o[0], text: o[1] })); });
        input.value = v === true ? 'true' : v === false ? 'false' : (v === null || v === undefined ? '' : String(v));
      } else {
        input = P.h('input', {
          id: id, type: f.type || 'text', autocomplete: f.auto || (f.secret ? 'off' : null),
          placeholder: f.placeholder || null, maxlength: 300, inputmode: f.type === 'number' ? 'decimal' : null
        });
        input.value = v === null || v === undefined ? '' : String(v);
      }
      if (f.req) input.required = true;
      if (opts.readonly && opts.readonly.indexOf(f.k) >= 0) input.disabled = true;
      inputs[f.k] = { input: input, f: f };
      grid.appendChild(P.h('label', { class: 'f' + (f.wide ? ' wide' : ''), for: id },
        P.h('span', null, f.label, f.req ? P.h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null),
        f.hint ? P.h('span', { class: 'hint', text: f.hint }) : null,
        input));
    });
    return {
      el: grid,
      inputs: inputs,
      read: function () {
        var out = {};
        Object.keys(inputs).forEach(function (k) {
          var x = inputs[k], val = x.input.value.trim();
          if (x.input.disabled) return;
          if (x.f.type === 'yesno') out[k] = val === '' ? null : val === 'true';
          else if (x.f.type === 'number') out[k] = val === '' ? null : Number(val.replace(/[^0-9.]/g, '')) || null;
          else out[k] = val === '' ? null : val;
        });
        return out;
      },
      firstInvalid: function () {
        var keys = Object.keys(inputs);
        for (var i = 0; i < keys.length; i++) {
          var x = inputs[keys[i]];
          if ((x.f.req && !x.input.value.trim()) || !x.input.checkValidity()) return x;
        }
        return null;
      }
    };
  };

  /* Read-only key/value list for a record. */
  P.renderKV = function (fields, values, opts) {
    opts = opts || {};
    var dl = P.h('dl', { class: 'kv' });
    var any = false;
    fields.forEach(function (f) {
      var v = values[f.k];
      if (v === null || v === undefined || v === '') return;
      if (f.type === 'yesno') v = v ? 'Yes' : 'No';
      if (f.type === 'town') v = P.townName(v);
      if (f.type === 'date') v = P.fmtDate(v);
      any = true;
      dl.appendChild(P.h('dt', { text: f.label }));
      dl.appendChild(P.h('dd', { class: f.secret && opts.secretsBold ? 'secret' : null, text: String(v) }));
    });
    return any ? dl : P.h('p', { class: 'muted', text: opts.empty || 'Nothing on file yet.' });
  };

  /* ---------- Dates (the business runs on Eastern time) ---------- */
  var TZ = 'America/New_York';
  P.fmtTime = function (iso) { return new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }); };
  // Clients are promised an arrival window, not an exact minute.
  P.WINDOW_MIN = 30;
  P.fmtWindow = function (iso) { return P.fmtTime(iso) + '–' + P.fmtTime(new Date(new Date(iso).getTime() + P.WINDOW_MIN * 60000).toISOString()); };
  P.milesBetween = function (a, b) {
    var R = 3958.8, toR = Math.PI / 180, dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    var x = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  // Best-effort location for check-in/out. A plain-language notice comes first, and the browser's own permission
  // prompt only appears after the sitter taps "Use my location". Resolves null if they skip it, say no, or it takes too long.
  P.whereAmI = function () {
    return new Promise(function (res) {
      if (!navigator.geolocation) return res(null);
      var ov = document.createElement('div');
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'loc-ttl');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:9999';
      var card = document.createElement('div');
      card.style.cssText = 'background:#fff;color:#1b2a3a;max-width:420px;width:100%;border-radius:14px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3)';
      function el(tag, text, css) { var n = document.createElement(tag); n.textContent = text; if (css) n.style.cssText = css; return n; }
      card.appendChild(el('h2', 'Confirm you are at the home?', 'font-size:20px;margin:0 0 8px')).id = 'loc-ttl';
      card.appendChild(el('p', 'Porchlight will read your phone’s location one time, right now, to confirm this visit. The client sees only “checked in at your home.” Exact coordinates are seen only by Porchlight staff, are used only to resolve a visit or safety question, and are deleted after 90 days. We never track you between visits.', 'margin:0 0 14px;line-height:1.45'));
      card.appendChild(el('p', 'After you tap “Use my location,” your phone will ask for permission. You can skip this and contact Porchlight to verify the visit instead.', 'margin:0 0 16px;font-size:14px;opacity:.85'));
      var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap';
      var skip = el('button', 'Skip'); skip.type = 'button'; skip.className = 'btn ghost';
      var ok = el('button', 'Use my location'); ok.type = 'button'; ok.className = 'btn';
      row.appendChild(skip); row.appendChild(ok); card.appendChild(row); ov.appendChild(card); document.body.appendChild(ov);
      ok.focus();
      function done(v) { if (ov.parentNode) ov.parentNode.removeChild(ov); res(v); }
      skip.addEventListener('click', function () { done(null); });
      ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(null); });
      ok.addEventListener('click', function () {
        ok.disabled = true; ok.textContent = 'Checking…';
        navigator.geolocation.getCurrentPosition(function (pos) {
          done({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0) });
        }, function () { done(null); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
      });
    });
  };
  // A plain calendar date (YYYY-MM-DD), such as a vaccine expiration.
  P.fmtDate = function (ymd) {
    var d = new Date(String(ymd).slice(0, 10) + 'T12:00:00Z');
    return isNaN(d) ? String(ymd) : d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  };
  P.fmtDay = function (iso) { return new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }); };
  P.fmtDayLong = function (iso) { return new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }); };
  P.todayISO = function () {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return p; // YYYY-MM-DD
  };
  P.addDays = function (iso, n) {
    var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  /* Start of a calendar day in Eastern time, as an ISO instant. */
  P.dayStartET = function (iso) {
    var guess = new Date(iso + 'T05:00:00Z');
    var hourET = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(guess)) % 24;
    return new Date(guess.getTime() - hourET * 3600000).toISOString();
  };

  /* ---------- Photos ---------- */
  P.shrinkImage = function (file, maxSide, quality) {
    if (!window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function (bmp) {
      var scale = Math.min(1, (maxSide || 1600) / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(function (b) { res(b || file); }, 'image/jpeg', quality || 0.82); });
    }).catch(function () { return file; });
  };
  P.uploadPhoto = function (path, file) {
    return P.shrinkImage(file).then(function (blob) {
      var type = blob.type || 'image/jpeg';
      return P.sb.storage.from(P.BUCKET).upload(path, blob, { contentType: type, upsert: false }).then(function (r) {
        if (r.error) throw r.error;
        return path;
      });
    });
  };
  P.signedUrls = function (paths, bucket) {
    paths = (paths || []).filter(Boolean);
    if (!paths.length) return Promise.resolve({});
    return P.sb.storage.from(bucket || P.BUCKET).createSignedUrls(paths, 3600).then(function (r) {
      var map = {};
      (r.data || []).forEach(function (x) { if (x.signedUrl) map[x.path] = x.signedUrl; });
      return map;
    });
  };

  /* ---------- Vaccination records (private bucket; PDFs or photos of a certificate) ---------- */
  P.RECORDS = 'porchlight-records';
  P.RECORD_ACCEPT = 'application/pdf,image/*,.pdf,.heic,.heif';
  P.RECORD_MAX = 10 * 1024 * 1024;
  // Uploads one file under `folder` and resolves { path, file_name }. Photos are resized but kept sharp enough to read.
  P.uploadRecord = function (folder, file) {
    var name = file.name || 'record';
    var lower = name.toLowerCase();
    var isPdf = file.type === 'application/pdf' || /\.pdf$/.test(lower);
    var isImage = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/.test(lower);
    if (!isPdf && !isImage) return Promise.reject(new Error('Please choose a PDF or a photo of the record.'));
    return (isPdf ? Promise.resolve(file) : P.shrinkImage(file, 2400, 0.86)).then(function (blob) {
      if (blob.size > P.RECORD_MAX) throw new Error('That file is over 10 MB. A phone photo of the certificate works well.');
      var ext, type;
      if (isPdf) { ext = 'pdf'; type = 'application/pdf'; }
      else if (blob !== file || blob.type === 'image/jpeg' || /\.jpe?g$/.test(lower)) { ext = 'jpg'; type = 'image/jpeg'; }
      else if (blob.type === 'image/png' || /\.png$/.test(lower)) { ext = 'png'; type = 'image/png'; }
      else if (blob.type === 'image/webp' || /\.webp$/.test(lower)) { ext = 'webp'; type = 'image/webp'; }
      else { ext = 'heic'; type = 'image/heic'; }
      var path = folder + '/' + P.uuid() + '.' + ext;
      return P.sb.storage.from(P.RECORDS).upload(path, blob, { contentType: type, upsert: false }).then(function (r) {
        if (r.error) throw r.error;
        return { path: path, file_name: name.slice(0, 200) };
      });
    });
  };
  // Where a pet stands on rabies paperwork. Returns null when it doesn't apply (birds, fish and so on).
  P.vaxStatus = function (pet) {
    var docs = pet.porchlight_pet_docs || [];
    var hasCert = docs.some(function (d) { return d.kind === 'rabies'; });
    var exp = pet.rabies_expires_on, today = P.todayISO();
    if (!/dog|cat|ferret/i.test(pet.species || '') && !hasCert && !exp) return null;
    if (exp && exp < today) return { level: 'bad', ok: false, text: 'Rabies vaccine expired ' + P.fmtDate(exp) };
    if (!hasCert) return { level: 'need', ok: false, text: 'Rabies certificate needed' };
    if (!exp) return { level: 'need', ok: false, text: 'Rabies expiration date needed' };
    if (exp <= P.addDays(today, 30)) return { level: 'soon', ok: true, text: 'Rabies vaccine expires ' + P.fmtDate(exp) };
    return { level: 'ok', ok: true, text: 'Rabies current through ' + P.fmtDate(exp) };
  };
  // Two buttons that upload a rabies certificate or other records into `opts.folder`.
  // opts.onAdded({ path, file_name, kind }) runs per file (may return a promise); opts.onDone() runs once at the end.
  P.recordPicker = function (opts) {
    var h = P.h, busy = 0, kind = 'rabies';
    var fileIn = h('input', { type: 'file', accept: P.RECORD_ACCEPT, multiple: true, hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
    var status = h('p', { class: 'small muted', role: 'status', hidden: true });
    function say(msg, bad) { status.textContent = msg || ''; status.hidden = !msg; status.className = 'small ' + (bad ? 'late' : 'muted'); }
    function pick(k) { return function () { kind = k; fileIn.click(); }; }
    var b1 = h('button', { type: 'button', class: 'btn ghost sm', text: opts.rabiesLabel || 'Add rabies certificate', onclick: pick('rabies') });
    var b2 = h('button', { type: 'button', class: 'btn ghost sm', text: 'Add other vaccine records', onclick: pick('other') });
    fileIn.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileIn.files || [], 0, 4), k = kind, failed = null;
      fileIn.value = '';
      if (!files.length) return;
      busy++; b1.disabled = b2.disabled = true;
      say('Uploading ' + (files.length > 1 ? files.length + ' files' : files[0].name) + '…');
      files.reduce(function (chain, f) {
        return chain.then(function () {
          return P.uploadRecord(opts.folder, f).then(function (d) { d.kind = k; return opts.onAdded(d); })
            .catch(function (e) { failed = e; });
        });
      }, Promise.resolve()).then(function () {
        busy--; b1.disabled = b2.disabled = false;
        if (failed) say(/row-level security|policy/i.test(P.errMsg(failed)) ? 'We couldn’t take that upload right now. You can add it later from your client portal.' : P.errMsg(failed), true);
        else say(files.length > 1 ? files.length + ' files added.' : 'Added ' + files[0].name + '.');
        if (opts.onDone) opts.onDone(!failed);
      });
    });
    return { el: h('div', { class: 'stack', style: 'gap:8px' }, h('div', { class: 'row' }, b1, b2, fileIn), status), busy: function () { return busy > 0; } };
  };
  P.listNames = function (names) {
    return names.length < 3 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  };
  P.vaxChip = function (st) {
    return P.h('span', { class: 'chip ' + ({ ok: 'completed', soon: 'requested', need: 'requested', bad: 'bad' })[st.level], text: st.text });
  };

  P.uuid = function () {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)), hex = [];
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    for (var i = 0; i < 16; i++) hex.push((b[i] + 256).toString(16).slice(1));
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10).join('');
  };
  P.uid = function () { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); };

  P.mapsLink = function (address) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
  };
  P.routeLink = function (addresses) {
    addresses = addresses.filter(Boolean);
    if (!addresses.length) return null;
    var dest = addresses[addresses.length - 1];
    var way = addresses.slice(0, -1).slice(0, 9);
    var url = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(dest);
    if (way.length) url += '&waypoints=' + encodeURIComponent(way.join('|'));
    return url;
  };

  P.errMsg = function (e) { return (e && (e.message || e.error_description)) || 'Something went wrong. Please try again.'; };
})();
