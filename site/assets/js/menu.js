(function () {
  var openBtn = document.getElementById('hamburger-open');
  var closeBtn = document.getElementById('hamburger-close');
  var menu = document.getElementById('mobile-menu');
  var overlay = document.getElementById('mobile-menu-overlay');

  if (!openBtn || !closeBtn || !menu || !overlay) return;

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) close();
  });

  function open() {
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    openBtn.focus();
  }
})();
