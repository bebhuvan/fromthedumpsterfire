// Runs before first paint so a chosen theme never flashes the other one. Storage can be blocked
// (private windows, strict settings); then the page simply follows the system.
try {
  var t = localStorage.getItem('fdf-theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
