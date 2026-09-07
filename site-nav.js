/* ============================================================
   site-nav.js — shared site chrome + home-page agenda mirror
   ------------------------------------------------------------
   1. Includes: <div data-include="file.html"></div> → that file.
   2. Active link: the current page's nav link gets .active.
   3. Agenda mirror: any element with data-agenda-source="X.html"
      has its <table.agenda> body filled from that page's
      #engagements-source rows.
        • A row's date comes from data-date="YYYY-MM-DD" if present,
          else parsed from its .d cell ("Wednesday, November 18, 2026"
          and "November 6, 2014" both work).
        • Dated rows: upcoming only, soonest first; dates shown
          compact ("Nov 18") on the mirror, full on the source page.
        • Undated rows: document order, after the dated ones.
      data-agenda-limit sets how many rows (default 3).

   Needs a server (http/https), not file://.  Local preview:
     python3 -m http.server   → http://localhost:8000
   ============================================================ */
(function () {

  /* ---- 1. HTML includes ---- */
  function loadIncludes() {
    var hosts = Array.prototype.slice.call(
      document.querySelectorAll('[data-include]')
    );
    return Promise.all(hosts.map(function (host) {
      var url = host.getAttribute('data-include');
      return fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
          return res.text();
        })
        .then(function (html) { host.outerHTML = html; })
        .catch(function (err) {
          console.error('[site-nav] could not load "' + url + '":', err);
        });
    }));
  }

  /* ---- 2. Active link ---- */
  function currentPage() {
    var name = location.pathname.split('/').pop();
    return (name || 'index.html').toLowerCase();
  }
  function markActiveLinks() {
    var here = currentPage();
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      var target = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
      if (target === here) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
    });
  }

  /* ---- scrolled state (keeps .nav.scrolled working) ---- */
  function scrolledState() {
    var nav = document.getElementById('nav');
    if (!nav) return;
    var onScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- date parsing for the agenda mirror ---- */
  var MONTHS = ['january','february','march','april','may','june',
                'july','august','september','october','november','december'];
  var DATE_TEXT = new RegExp('(' + MONTHS.join('|') + ')\\s+(\\d{1,2})\\s*,\\s*(\\d{4})', 'i');

  /* ---- 3. Home-page agenda mirror ---- */
  function hydrateAgendas() {
    document.querySelectorAll('[data-agenda-source]').forEach(function (mount) {
      var src   = mount.getAttribute('data-agenda-source');
      var limit = parseInt(mount.getAttribute('data-agenda-limit') || '3', 10);
      var tbody = mount.querySelector('table.agenda tbody');
      if (!tbody) return;

      fetch(src)
        .then(function (res) {
          if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
          return res.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var all = Array.prototype.slice.call(
            doc.querySelectorAll('#engagements-source tbody tr')
          );

          var today = new Date(); today.setHours(0, 0, 0, 0);

          function whenOf(tr) {
            var raw = tr.getAttribute('data-date');   // YYYY-MM-DD, wins if present
            if (raw) {
              var d = new Date(raw + 'T00:00:00');
              if (!isNaN(d.getTime())) return d;
            }
            // Fall back to the visible date cell, e.g.
            // "Wednesday, November 18, 2026" or "November 6, 2014".
            var cell = tr.querySelector('.d');
            var m = cell && cell.textContent.match(DATE_TEXT);
            if (!m) return null;
            return new Date(+m[3], MONTHS.indexOf(m[1].toLowerCase()), +m[2]);
          }

          // Dated + upcoming, soonest first:
          var dated = all
            .map(function (tr) { return { tr: tr, when: whenOf(tr) }; })
            .filter(function (x) { return x.when && x.when >= today; })
            .sort(function (a, b) { return a.when - b.when; })
            .map(function (x) { return x.tr; });

          // Undated rows keep document order (placeholders still show):
          var undated = all.filter(function (tr) { return !whenOf(tr); });

          var rows = dated.concat(undated).slice(0, limit);

          if (!rows.length) { mount.hidden = true; return; }

          tbody.innerHTML = '';
          rows.forEach(function (tr) {
            var clone = document.importNode(tr, true);   // clone across docs
            var when = whenOf(tr);
            var d = clone.querySelector('.d');
            if (when && d) {                 // compact date for the hero table
              d.textContent = when.toLocaleDateString('en-US',
                { month: 'short', day: 'numeric' });
            }
            tbody.appendChild(clone);
          });
        })
        .catch(function (err) {
          console.error('[site-nav] agenda mirror failed from "' + src + '":', err);
          mount.hidden = true;  // degrade cleanly instead of an empty block
        });
    });
  }

  function enhance() {
    markActiveLinks();
    scrolledState();
    hydrateAgendas();
  }

  function start() { loadIncludes().then(enhance); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
