/* Live GitHub stats, styled by the site (not GitHub's iframe buttons).
   Public endpoints, no auth. If the request fails or we're offline, the
   "—" placeholders simply remain — the page still works. */
(function () {
  'use strict';

  var REPO = 'Slyfti/translatify';

  var compact = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1
  });

  function set(stat, value) {
    if (typeof value !== 'number' || isNaN(value)) return;
    var el = document.querySelector('[data-stat="' + stat + '"]');
    if (el) el.textContent = compact.format(value);
  }

  function get(url) {
    return fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject(res.status);
      });
  }

  get('https://api.github.com/repos/' + REPO).then(function (repo) {
    set('stars', repo.stargazers_count);
    set('issues', repo.open_issues_count);
  }).catch(function () { /* keep placeholders */ });
})();
