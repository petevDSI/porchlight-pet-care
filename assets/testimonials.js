/* Porchlight reviews: builds the carousel, score badge and filterable grid
   from window.PORCHLIGHT_REVIEWS (see assets/testimonials-data.js).

   Markup hooks (all optional, use any combination on a page):
     [data-tm-section]   a <section> that stays hidden until there are reviews
     [data-tm-score]     badge filled with stars, average and review count
     [data-tm-carousel]  empty div, becomes the carousel
     [data-tm-filters]   empty div, becomes service filter chips
     [data-tm-count]     <p> that says how many reviews the filter is showing
     [data-tm-grid]      empty div, becomes the grid of all reviews
*/
(function () {
  'use strict';

  var cfg = window.PORCHLIGHT_REVIEWS_CONFIG || {};
  var list = (window.PORCHLIGHT_REVIEWS || []).filter(function (r) {
    if (!r || !r.name || !r.text) return false;
    if (cfg.hideSamples && r.sample) return false;
    return true;
  });
  // Newest first, whatever order they were typed in.
  list.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });

  // No reviews to show: leave every [data-tm-section] hidden.
  if (!list.length) return;

  var NS = 'http://www.w3.org/2000/svg';
  var STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z';
  var PLAY_D = 'M8 5l11 7-11 7z';
  var PAUSE_D = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z';
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var uid = 0;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(viewBox) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', viewBox);
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    return s;
  }
  function path(d) {
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    return p;
  }
  function icon(kind) {
    var s = svg('0 0 24 24');
    if (kind === 'prev') s.appendChild(path('M15 5l-7 7 7 7'));
    else if (kind === 'next') s.appendChild(path('M9 5l7 7-7 7'));
    else if (kind === 'pause') { s.appendChild(path(PAUSE_D)); }
    else s.appendChild(path(PLAY_D));
    return s;
  }
  function rating(r) {
    var n = Math.round(Number(r.rating));
    return n >= 1 && n <= 5 ? n : 5;
  }
  function stars(n) {
    var wrap = el('span', 'tm-stars');
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', n + ' out of 5 stars');
    for (var i = 0; i < 5; i++) {
      var s = svg('0 0 24 24');
      if (i >= n) s.setAttribute('class', 'off');
      s.appendChild(path(STAR));
      wrap.appendChild(s);
    }
    return wrap;
  }
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  function initials(name) {
    var parts = String(name).replace(/[^A-Za-z\s.]/g, ' ').trim().split(/\s+/);
    var a = (parts[0] || '?').charAt(0);
    var b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (a + b).toUpperCase();
  }

  function card(r) {
    var a = el('article', 'tm-card');
    var top = el('div', 'tm-top');
    top.appendChild(stars(rating(r)));
    if (r.service) top.appendChild(el('span', 'tm-pill', r.service));
    a.appendChild(top);
    if (r.title) a.appendChild(el('h3', null, r.title));
    var q = el('blockquote');
    q.appendChild(el('p', null, r.text));
    a.appendChild(q);

    var by = el('div', 'tm-by');
    var av = el('span', 'tm-avatar', initials(r.name));
    av.setAttribute('aria-hidden', 'true');
    by.appendChild(av);
    var who = el('span', 'tm-who');
    who.appendChild(el('b', null, r.name));
    if (r.city) who.appendChild(el('span', null, r.city));
    by.appendChild(who);
    var when = fmtDate(r.date);
    if (when) {
      var t = el('time', 'tm-date', when);
      t.setAttribute('datetime', r.date);
      by.appendChild(t);
    }
    a.appendChild(by);
    return a;
  }

  /* ---------- Score badge ---------- */
  function buildScore(box) {
    var sum = 0;
    list.forEach(function (r) { sum += rating(r); });
    var avg = sum / list.length;
    box.textContent = '';
    box.appendChild(stars(Math.round(avg)));
    box.appendChild(el('b', null, avg.toFixed(1)));
    box.appendChild(el('span', null, list.length + (list.length === 1 ? ' review' : ' reviews')));
  }

  /* ---------- Carousel ---------- */
  function buildCarousel(root) {
    root.textContent = '';
    var n = list.length;

    var viewport = el('div', 'tm-viewport');
    var track = el('div', 'tm-track');
    track.id = 'tm-track-' + (++uid);
    track.tabIndex = 0;
    track.setAttribute('role', 'group');
    track.setAttribute('aria-roledescription', 'carousel');
    track.setAttribute('aria-label', 'Customer reviews');
    list.forEach(function (r, i) {
      var c = card(r);
      c.setAttribute('aria-roledescription', 'slide');
      c.setAttribute('aria-label', (i + 1) + ' of ' + n);
      track.appendChild(c);
    });
    viewport.appendChild(track);

    var status = el('p', 'tm-sr');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'off');

    var controls = el('div', 'tm-controls');
    var dots = el('div', 'tm-dots');
    var btns = el('div', 'tm-btns');

    function button(cls, label, kind) {
      var b = el('button', 'tm-btn ' + cls);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-controls', track.id);
      b.appendChild(icon(kind));
      return b;
    }
    var prev = button('tm-prev', 'Previous reviews', 'prev');
    var next = button('tm-next', 'Next reviews', 'next');
    var play = button('tm-play', 'Pause automatic rotation', 'pause');
    if (reduce) play.hidden = true;
    btns.appendChild(play);
    btns.appendChild(prev);
    btns.appendChild(next);
    controls.appendChild(dots);
    controls.appendChild(btns);

    root.appendChild(viewport);
    root.appendChild(controls);
    root.appendChild(status);

    var step = 1, per = 1, pages = 1, page = 0;
    var timer = null, hovering = false, focusing = false, inView = true, userPaused = reduce;
    var touchTimer = null;

    function gap() {
      var cs = getComputedStyle(track);
      return parseFloat(cs.columnGap || cs.gap) || 0;
    }
    function maxLeft() { return Math.max(0, track.scrollWidth - track.clientWidth); }
    function currentPage() {
      if (track.scrollLeft >= maxLeft() - 2) return pages - 1;
      return Math.min(pages - 1, Math.round(track.scrollLeft / (step * per)));
    }
    function buildDots() {
      dots.textContent = '';
      for (var i = 0; i < pages; i++) {
        (function (p) {
          var d = el('button', 'tm-dot');
          d.type = 'button';
          d.setAttribute('aria-label', 'Go to reviews page ' + (p + 1) + ' of ' + pages);
          d.setAttribute('aria-controls', track.id);
          d.addEventListener('click', function () { go(p); });
          dots.appendChild(d);
        })(i);
      }
    }
    function measure() {
      var g = gap();
      step = track.firstElementChild.getBoundingClientRect().width + g;
      per = Math.max(1, Math.round((track.clientWidth + g) / step));
      var np = Math.ceil(n / per);
      if (np !== pages || !dots.children.length) { pages = np; buildDots(); }
      controls.hidden = pages <= 1;
    }
    function update() {
      page = currentPage();
      for (var i = 0; i < dots.children.length; i++) {
        if (i === page) dots.children[i].setAttribute('aria-current', 'true');
        else dots.children[i].removeAttribute('aria-current');
      }
      var first = Math.min(n, Math.round(track.scrollLeft / step) + 1);
      var last = Math.min(n, first + per - 1);
      status.textContent = 'Showing reviews ' + first + (last > first ? ' to ' + last : '') + ' of ' + n;
    }
    function go(p) {
      p = (p + pages) % pages;
      var left = p === pages - 1 ? maxLeft() : p * per * step;
      track.scrollTo({ left: left, behavior: reduce ? 'auto' : 'smooth' });
    }
    function sync() {
      if (timer) { clearInterval(timer); timer = null; }
      var playing = !userPaused && !hovering && !focusing && inView && !document.hidden && pages > 1;
      if (playing) timer = setInterval(function () { go(currentPage() + 1); }, 7000);
      status.setAttribute('aria-live', userPaused ? 'polite' : 'off');
      var label = userPaused ? 'Start automatic rotation' : 'Pause automatic rotation';
      play.setAttribute('aria-label', label);
      // Update the icon in place; replacing the node mid-click can swallow the click.
      play.firstChild.firstChild.setAttribute('d', userPaused ? PLAY_D : PAUSE_D);
    }

    prev.addEventListener('click', function () { go(currentPage() - 1); });
    next.addEventListener('click', function () { go(currentPage() + 1); });
    play.addEventListener('click', function () { userPaused = !userPaused; sync(); });

    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(currentPage() + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(currentPage() - 1); }
    });

    var ticking = false;
    track.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; update(); });
    }, { passive: true });

    root.addEventListener('mouseenter', function () { hovering = true; sync(); });
    root.addEventListener('mouseleave', function () { hovering = false; sync(); });
    root.addEventListener('touchstart', function () {
      hovering = true; sync();
      clearTimeout(touchTimer);
      touchTimer = setTimeout(function () { hovering = false; sync(); }, 10000);
    }, { passive: true });
    root.addEventListener('focusin', function () { focusing = true; sync(); });
    root.addEventListener('focusout', function () {
      setTimeout(function () { focusing = root.contains(document.activeElement); sync(); }, 0);
    });
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { inView = e[0].isIntersecting; sync(); }, { threshold: 0.25 }).observe(root);
    }

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { measure(); update(); sync(); }, 120);
    });

    // Section may be unhidden after this runs; measure once it has a width.
    measure(); update(); sync();
    if (!track.clientWidth) {
      var tries = 0;
      var wait = setInterval(function () {
        if (track.clientWidth || ++tries > 20) { clearInterval(wait); measure(); update(); sync(); }
      }, 100);
    }
  }

  /* ---------- Filterable grid ---------- */
  function buildGrid(grid, filters, count) {
    var services = [];
    list.forEach(function (r) {
      if (r.service && services.indexOf(r.service) < 0) services.push(r.service);
    });
    var current = '';

    function render() {
      grid.textContent = '';
      var shown = list.filter(function (r) { return !current || r.service === current; });
      shown.forEach(function (r) { grid.appendChild(card(r)); });
      if (count) {
        count.textContent = 'Showing ' + shown.length + ' of ' + list.length + (list.length === 1 ? ' review' : ' reviews') +
          (current ? ' for ' + current.toLowerCase() : '');
      }
      if (filters) {
        Array.prototype.forEach.call(filters.children, function (c) {
          c.setAttribute('aria-pressed', String((c.getAttribute('data-service') || '') === current));
        });
      }
    }

    if (filters) {
      filters.textContent = '';
      filters.setAttribute('role', 'group');
      filters.setAttribute('aria-label', 'Filter reviews by service');
      ['All reviews'].concat(services).forEach(function (label, i) {
        var b = el('button', 'tm-chip', label);
        b.type = 'button';
        b.setAttribute('data-service', i === 0 ? '' : label);
        b.addEventListener('click', function () { current = i === 0 ? '' : label; render(); });
        filters.appendChild(b);
      });
    }
    render();
  }

  /* ---------- Wire up the page ---------- */
  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tm-section]'), function (s) { s.hidden = false; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tm-score]'), buildScore);
    Array.prototype.forEach.call(document.querySelectorAll('[data-tm-carousel]'), buildCarousel);
    var grid = document.querySelector('[data-tm-grid]');
    if (grid) buildGrid(grid, document.querySelector('[data-tm-filters]'), document.querySelector('[data-tm-count]'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
