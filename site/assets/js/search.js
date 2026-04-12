(function () {
  var btn = document.getElementById('search-toggle-btn');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var posts = null;

  if (!btn || !input || !results) return;

  btn.addEventListener('click', function () {
    var isOpen = input.classList.toggle('is-open');
    if (isOpen) {
      input.focus();
      if (!posts) loadPosts();
    } else {
      close();
    }
  });

  input.addEventListener('input', function () {
    var query = input.value.toLowerCase().trim();
    if (!query || !posts) {
      results.classList.remove('is-open');
      return;
    }
    var matches = posts.filter(function (p) {
      return p.title.toLowerCase().indexOf(query) !== -1 ||
             p.excerpt.toLowerCase().indexOf(query) !== -1;
    });
    if (matches.length === 0) {
      results.classList.remove('is-open');
      return;
    }
    results.innerHTML = matches.slice(0, 8).map(function (p) {
      return '<a class="search-results__item" href="' + p.url + '">' +
             p.title + '<small>' + p.date + '</small></a>';
    }).join('');
    results.classList.add('is-open');
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-toggle')) close();
  });

  function close() {
    input.classList.remove('is-open');
    input.value = '';
    results.classList.remove('is-open');
    results.innerHTML = '';
  }

  function loadPosts() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/assets/search.json');
    xhr.onload = function () {
      if (xhr.status === 200) {
        posts = JSON.parse(xhr.responseText);
      }
    };
    xhr.send();
  }
})();
