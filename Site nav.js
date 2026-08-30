/* ============================================================
   site-nav.js — loads shared HTML fragments into each page
   ------------------------------------------------------------
   No markup lives in here. Any element with a data-include
   attribute gets replaced by the contents of the file it names:

       <div data-include="nav.html"></div>
       <div data-include="footer.html"></div>

   Edit nav.html / footer.html to change the menu or footer once
   for the whole site. Add this before </body> on every page:

       <script src="site-nav.js"></script>

   NOTE: fetch() does not work when you open a page as a file://
   URL. Preview over a local server instead, e.g.:

       python3 -m http.server        (then visit http://localhost:8000)

   On your live host it just works.
   ============================================================ */
(function () {

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
        .then(function (html) {
          host.outerHTML = html;
        })
        .catch(function (err) {
          console.error('[site-nav] could not load "' + url + '":', err);
        });
    }));
  }

  function currentPage() {
    var name = location.pathname.split('/').pop();
    return (name || 'index.html').toLowerCase();
  }

  function enhance() {
    /* highlight the link for the page you're on */
    var here = currentPage();
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      var target = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
      if (target === here) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
    });

    /* keep your .nav.scrolled behaviour working, centrally */
    var nav = document.getElementById('nav');
    if (nav) {
      var onScroll = function () {
        nav.classList.toggle('scrolled', window.scrollY > 8);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
  }

  function start() {
    loadIncludes().then(enhance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
