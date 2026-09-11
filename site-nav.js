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
      data-agenda-limit sets how many engagement rows (default 3).

   4. NEW — event grouping + offers. On a source row:
        data-event="KMWorld 2026"      groups sibling rows under one
                                       header; 2+ rows required.
        data-venue="JW Marriott, …"    shown right-aligned on the header.
        data-offer-url="https://…"     renders a note below the group.
        data-offer-code="WKEY"         typeset in the .agenda-code chip.
        data-offer-link="Register …"   link text (optional).
        data-offer-text="{link} for …" sentence template (optional);
                                       {link} and {code} are substituted.
      Only one row per group needs the venue/offer attributes.
      The offer disappears on its own once every row in the group has
      passed, because the upcoming-only filter runs first — no manual
      cleanup, no expiry date to maintain.

   Needs a server (http/https), not file://.  Local preview:
     python3 -m http.server   → http://localhost:8000
   ============================================================ */
(function () {

  /* Grouped rows repeat their venue in the last cell, which the group
     header already states. Set to false to keep the cell as authored. */
  var BLANK_VENUE_CELL_WHEN_GROUPED = true;

  var DEFAULT_OFFER_LINK = 'Register through this link';
  var DEFAULT_OFFER_TEXT = '{link} for a discounted rate, or use code {code} at checkout.';

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

  /* ---- grouping helpers ---- */

  /* Rows sharing a data-event value collect into one group, in order of
     first appearance. Rows without one stay on their own. */
  function groupRows(rows) {
    var groups = [];
    var seen = Object.create(null);
    rows.forEach(function (tr) {
      var key = tr.getAttribute('data-event');
      if (!key) { groups.push({ key: null, rows: [tr] }); return; }
      var at = seen[key];
      if (at === undefined) {
        seen[key] = groups.length;
        groups.push({ key: key, rows: [] });
        at = seen[key];
      }
      groups[at].rows.push(tr);
    });
    return groups;
  }

  /* First non-empty value of an attribute across a group's rows. */
  function attrFromGroup(group, name) {
    for (var i = 0; i < group.rows.length; i++) {
      var v = group.rows[i].getAttribute(name);
      if (v) return v;
    }
    return null;
  }

  function columnCount(group) {
    var n = group.rows[0] ? group.rows[0].children.length : 3;
    return n > 0 ? n : 3;
  }

  function groupHeaderRow(group, cols) {
    var tr = document.createElement('tr');
    tr.className = 'agenda-group';

    var th = document.createElement('th');
    th.scope = 'rowgroup';
    th.className = 'agenda-group-name';
    th.textContent = group.key;

    var venue = attrFromGroup(group, 'data-venue');
    if (venue && cols > 1) {
      th.colSpan = cols - 1;
      var td = document.createElement('td');
      td.className = 'agenda-group-venue';
      td.textContent = venue;
      tr.appendChild(th);
      tr.appendChild(td);
    } else {
      th.colSpan = cols;
      tr.appendChild(th);
    }
    return tr;
  }

  /* Builds the offer sentence as real nodes — no innerHTML, so an
     apostrophe or ampersand in the copy can't break anything. */
  function offerFragment(text, url, code, linkLabel) {
    var frag = document.createDocumentFragment();
    text.split(/(\{link\}|\{code\})/).forEach(function (part) {
      if (!part) return;
      if (part === '{link}') {
        if (!url) return;
        var a = document.createElement('a');
        a.className = 'agenda-offer-link';
        a.href = url;
        a.rel = 'noopener';
        a.textContent = linkLabel;
        frag.appendChild(a);
      } else if (part === '{code}') {
        if (!code) return;
        var span = document.createElement('span');
        span.className = 'agenda-code';
        span.textContent = code;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    return frag;
  }

  function offerRow(group, cols) {
    var url  = attrFromGroup(group, 'data-offer-url');
    var code = attrFromGroup(group, 'data-offer-code');
    if (!url && !code) return null;

    var text  = attrFromGroup(group, 'data-offer-text') || DEFAULT_OFFER_TEXT;
    var label = attrFromGroup(group, 'data-offer-link') || DEFAULT_OFFER_LINK;

    var tr = document.createElement('tr');
    tr.className = 'agenda-offer';

    /* Leading spacer cell keeps the note aligned with the session
       titles rather than the date column. */
    if (cols > 1) {
      tr.appendChild(document.createElement('td'));
    }
    var cell = document.createElement('td');
    cell.className = 'agenda-offer-cell';
    cell.colSpan = Math.max(1, cols - 1);
    cell.appendChild(offerFragment(text, url, code, label));
    tr.appendChild(cell);
    return tr;
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

          // The limit counts engagements. Group headers and offer notes
          // are chrome and don't consume a slot.
          var rows = dated.concat(undated).slice(0, limit);

          if (!rows.length) { mount.hidden = true; return; }

          tbody.innerHTML = '';

          groupRows(rows).forEach(function (group) {
            var cols    = columnCount(group);
            var grouped = !!group.key && group.rows.length > 1;

            if (grouped) tbody.appendChild(groupHeaderRow(group, cols));

            group.rows.forEach(function (tr) {
              var clone = document.importNode(tr, true);   // clone across docs
              var when = whenOf(tr);
              var d = clone.querySelector('.d');
              if (when && d) {                 // compact date for the hero table
                d.textContent = when.toLocaleDateString('en-US',
                  { month: 'short', day: 'numeric' });
              }
              if (grouped) {
                clone.classList.add('agenda-child');
                if (BLANK_VENUE_CELL_WHEN_GROUPED &&
                    clone.children.length > 2 &&
                    clone.lastElementChild) {
                  clone.lastElementChild.textContent = '';
                }
              }
              tbody.appendChild(clone);
            });

            var offer = offerRow(group, cols);
            if (offer) tbody.appendChild(offer);
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
})();/* ============================================================
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
