/* ============================================================
   site-nav.js — shared site chrome + home-page agenda mirror
   ------------------------------------------------------------
   1. Includes: <div data-include="file.html"></div> → that file.
   2. Active link: the current page's nav link gets .active.
   3. Agenda mirror: any element with data-agenda-source="X.html"
      has its <table.agenda> body filled from that page's
      #engagements-source rows.
        • Rows WITH data-date="YYYY-MM-DD": upcoming only, soonest first.
        • Rows WITHOUT a date: shown in document order after the dated
          ones (so placeholders still appear before you add real dates).
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
            var raw = tr.getAttribute('data-date');   // expects YYYY-MM-DD
            if (!raw) return null;
            var d = new Date(raw + 'T00:00:00');
            return isNaN(d.getTime()) ? null : d;
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
            tbody.appendChild(document.importNode(tr, true)); // clone across docs
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
