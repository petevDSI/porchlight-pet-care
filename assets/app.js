/* Porchlight shared helpers: Supabase client, field definitions, small DOM builders. */
(function () {
  var SUPABASE_URL = 'https://ngiwnyoxdcycwotxargm.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5naXdueW94ZGN5Y3dvdHhhcmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MjQzOTEsImV4cCI6MjA5NzMwMDM5MX0.qcK6CUQkMzxoCZ2Dk8682It2honSch-blEyDXZEt9dc';

  var P = window.Porchlight = {};
  P.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'porchlight-auth' }
  });
  P.BUCKET = 'porchlight-photos';

  P.TOWNS = [
    ['belmont', 'Belmont'], ['mt-holly', 'Mt. Holly'], ['cramerton', 'Cramerton'], ['mcadenville', 'McAdenville'],
    ['lake-wylie', 'Lake Wylie'], ['steele-creek', 'Steele Creek'], ['east-gastonia', 'East Gastonia']
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
      { k: 'vet_spend_limit', label: 'Care we may approve if we can’t reach you', placeholder: 'e.g. up to $500', wide: true }
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
      any = true;
      dl.appendChild(P.h('dt', { text: f.label }));
      dl.appendChild(P.h('dd', { class: f.secret && opts.secretsBold ? 'secret' : null, text: String(v) }));
    });
    return any ? dl : P.h('p', { class: 'muted', text: opts.empty || 'Nothing on file yet.' });
  };

  /* ---------- Dates (the business runs on Eastern time) ---------- */
  var TZ = 'America/New_York';
  P.fmtTime = function (iso) { return new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }); };
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
  P.shrinkImage = function (file) {
    if (!window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function (bmp) {
      var scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(function (b) { res(b || file); }, 'image/jpeg', 0.82); });
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
  P.signedUrls = function (paths) {
    paths = (paths || []).filter(Boolean);
    if (!paths.length) return Promise.resolve({});
    return P.sb.storage.from(P.BUCKET).createSignedUrls(paths, 3600).then(function (r) {
      var map = {};
      (r.data || []).forEach(function (x) { if (x.signedUrl) map[x.path] = x.signedUrl; });
      return map;
    });
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
