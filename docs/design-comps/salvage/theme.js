// Theme toggle for the comps: flips light and dark, remembered per browser.
(function () {
  var r = document.documentElement;
  try { var s = localStorage.getItem('fdf-theme'); if (s) r.setAttribute('data-theme', s); } catch (e) {}
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!b) return;
    var t = r.getAttribute('data-theme');
    var dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    r.setAttribute('data-theme', next);
    try { localStorage.setItem('fdf-theme', next); } catch (e) {}
  });
})();
