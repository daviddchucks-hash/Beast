(function () {
  'use strict';

  document.querySelectorAll('[data-year]').forEach(function (element) {
    element.textContent = String(new Date().getFullYear());
  });

  var toggle = document.querySelector('.mobile-toggle');
  var menu = document.querySelector('.mobile-panel');
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menu.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      });
    });
  }

  var downloadButton = document.querySelector('.download-button');
  var downloadMessage = document.querySelector('.download-message');
  if (downloadButton && downloadMessage) {
    downloadButton.addEventListener('click', function () {
      downloadMessage.hidden = false;
      downloadButton.classList.add('is-clicked');
      downloadButton.setAttribute('aria-describedby', 'download-message');
    });
    downloadMessage.id = 'download-message';
  }
})();