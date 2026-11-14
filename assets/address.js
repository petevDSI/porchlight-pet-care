/* Address box with Google suggestions, shared by the booking form, the new client form and the portal.
 *
 *   PorchlightAddress.attach(inputEl, function (place) { ... })
 *     place = { address, lat, lng, town }  (town = nearest service-area town id)
 *   PorchlightAddress.geocode(text)  -> Promise<place|null>   (server-side lookup, for typed addresses)
 *
 * The browser key below only works from porchlightpetcare.com and the Vercel site, and only for
 * Places/Maps. Drive times and geocoding use a separate server key that never reaches the browser.
 */
(function () {
  var MAPS_KEY = 'AIzaSyDqOemkGeadYN2u_9hK-oF4InhtPUrqVAo';
  var SUPABASE_URL = 'https://vnwifihyyivxjsdvxlsv.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZud2lmaWh5eWl2eGpzZHZ4bHN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2MjcxNDcsImV4cCI6MjExMDIwMzE0N30.niE-ejnfYbPk6GqyH2ZlNtXtiBlrZxvSi-mcLmW9Lck';
  var HOME = { lat: 35.2429, lng: -81.0373 };
  var TOWNS = [
    ['belmont', 35.2429, -81.0373], ['mt-holly', 35.2982, -81.0159], ['cramerton', 35.2390, -81.0751],
    ['mcadenville', 35.2601, -81.0784], ['lake-wylie', 35.1076, -81.0423],
    ['east-gastonia', 35.2615, -81.1360], ['lowell', 35.2680, -81.0994], ['ranlo', 35.2863, -81.1305],
    ['clover', 35.1112, -81.2265], ['york', 34.9943, -81.2420], ['india-hook', 35.0097, -81.0368],
    ['newport', 34.9899, -81.1009]
  ];

  // Service-area border, [lat, lng]. West of the Catawba River / Lake Wylie, south to Celanese Rd.
  // The database holds the authoritative copy (table porchlight_area); keep the two in step.
  var AREA = [[35.340,-81.000],[35.300,-81.002],[35.260,-81.008],[35.230,-81.012],[35.200,-81.005],[35.170,-81.005],
    [35.150,-81.020],[35.120,-81.033],[35.100,-81.036],[35.060,-81.040],[35.020,-81.037],[35.005,-81.030],
    [34.995,-81.000],[34.975,-80.975],[34.975,-81.270],[35.340,-81.270]];
  function inArea(lat, lng) {
    var inside = false;
    for (var i = 0, j = AREA.length - 1; i < AREA.length; j = i++) {
      var yi = AREA[i][0], xi = AREA[i][1], yj = AREA[j][0], xj = AREA[j][1];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function nearestTown(lat, lng) {
    var best = null, bd = 1e9;
    TOWNS.forEach(function (t) {
      var d = Math.pow(t[1] - lat, 2) + Math.pow((t[2] - lng) * 0.82, 2);
      if (d < bd) { bd = d; best = t[0]; }
    });
    return best;
  }

  function token() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function geocode(text) {
    return fetch(SUPABASE_URL + '/functions/v1/porchlight-geo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
      body: JSON.stringify({ action: 'geocode', address: text })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok || !j.in_area || !inArea(j.lat, j.lng)) return null;
      return { address: j.formatted.replace(/, USA$/, ''), lat: j.lat, lng: j.lng, town: nearestTown(j.lat, j.lng), exact: j.exact };
    }).catch(function () { return null; });
  }

  // Asks the server to fetch real drive times between this address and that day's booked stops.
  function prime(date, place, days) {
    if (!place || !date) return Promise.resolve();
    return fetch(SUPABASE_URL + '/functions/v1/porchlight-geo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
      body: JSON.stringify({ action: 'prime', date: date, days: days || 1, lat: place.lat, lng: place.lng })
    }).then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  function attach(input, onPick) {
    var wrap = document.createElement('div');
    wrap.className = 'addr-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var list = document.createElement('ul');
    list.className = 'addr-list';
    list.id = (input.id || 'addr') + '-suggestions';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.appendChild(list);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');

    var session = token(), timer = null, items = [], active = -1, picked = null, seq = 0;

    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); }
    function render() {
      list.innerHTML = '';
      items.forEach(function (s, i) {
        var li = document.createElement('li');
        li.id = list.id + '-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', i === active ? 'true' : 'false');
        var main = document.createElement('b'); main.textContent = s.main;
        var sub = document.createElement('span'); sub.textContent = s.sub;
        li.appendChild(main); li.appendChild(sub);
        li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(i); });
        list.appendChild(li);
      });
      list.hidden = !items.length;
      input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
      if (active >= 0) input.setAttribute('aria-activedescendant', list.id + '-' + active);
    }
    function suggest() {
      var q = input.value.trim();
      if (q.length < 4) { items = []; render(); return; }
      var my = ++seq;
      fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': MAPS_KEY },
        body: JSON.stringify({
          input: q, sessionToken: session, includedRegionCodes: ['us'],
          includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
          locationBias: { circle: { center: { latitude: HOME.lat, longitude: HOME.lng }, radius: 40000 } }
        })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (my !== seq) return;
        items = (j.suggestions || []).filter(function (s) { return s.placePrediction; }).slice(0, 5).map(function (s) {
          var p = s.placePrediction;
          return { id: p.placeId,
            main: (p.structuredFormat && p.structuredFormat.mainText && p.structuredFormat.mainText.text) || p.text.text,
            sub: (p.structuredFormat && p.structuredFormat.secondaryText && p.structuredFormat.secondaryText.text) || '' };
        });
        active = -1; render();
      }).catch(function () { items = []; render(); });
    }
    function choose(i) {
      var s = items[i];
      close();
      input.value = s.main + (s.sub ? ', ' + s.sub.replace(/, USA$/, '') : '');
      fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(s.id) + '?sessionToken=' + session, {
        headers: { 'X-Goog-Api-Key': MAPS_KEY, 'X-Goog-FieldMask': 'location,formattedAddress' }
      }).then(function (r) { return r.json(); }).then(function (d) {
        session = token();
        if (!d.location) return geocode(input.value).then(done);
        done({ address: (d.formattedAddress || input.value).replace(/, USA$/, ''), lat: d.location.latitude, lng: d.location.longitude,
               town: nearestTown(d.location.latitude, d.location.longitude), exact: true });
      }).catch(function () { geocode(input.value).then(done); });
    }
    function done(place) {
      if (place) {
        if (!inArea(place.lat, place.lng)) place = Object.assign({ outside: true }, place);
        input.value = place.address;
      }
      picked = place;
      onPick(place);
    }

    input.addEventListener('input', function () {
      if (picked) { picked = null; onPick(null); }
      clearTimeout(timer); timer = setTimeout(suggest, 220);
    });
    input.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { close(); }
    });
    // Typed it out without picking a suggestion: look it up on the server.
    input.addEventListener('blur', function () {
      setTimeout(close, 150);
      if (!picked && input.value.trim().length >= 8) geocode(input.value.trim()).then(function (p) { if (!picked) done(p); });
    });
    return { get place() { return picked; }, set: function (p) { picked = p; if (p) input.value = p.address; } };
  }

  window.PorchlightAddress = { attach: attach, geocode: geocode, prime: prime, nearestTown: nearestTown };
})();
