/* Hero lyric-translation animation.
   The one orchestrated moment: foreign lyrics fade into their English
   translation, line by line, looping through a few songs — like watching
   the extension work in real time. */
(function () {
  'use strict';

  var demo = document.getElementById('demo');
  if (!demo) return;

  var langEl = demo.querySelector('.demo__lang');
  var linesEl = demo.querySelector('.demo__lines');

  var verses = [
    {
      lang: 'French',
      lines: [
        { o: 'On dansait sous la pluie', t: 'We were dancing in the rain' },
        { o: 'Tes yeux comme une mélodie', t: 'Your eyes like a melody' },
        { o: "Jusqu'au lever du jour", t: 'Until the break of day' }
      ]
    },
    {
      lang: 'Japanese',
      lines: [
        { o: '君の声が聞こえる', t: 'I can hear your voice' },
        { o: '夜空に響く歌', t: 'A song echoing in the night sky' },
        { o: 'そっと目を閉じて', t: 'Softly, I close my eyes' }
      ]
    },
    {
      lang: 'Spanish',
      lines: [
        { o: 'Bailamos bajo la luna', t: 'We dance beneath the moon' },
        { o: 'Tu corazón con el mío', t: 'Your heart with mine' },
        { o: 'Hasta que salga el sol', t: 'Until the sun comes up' }
      ]
    }
  ];

  function render(verse) {
    langEl.textContent = verse.lang;
    linesEl.textContent = '';
    return verse.lines.map(function (l) {
      var line = document.createElement('div');
      line.className = 'line';

      var orig = document.createElement('span');
      orig.className = 'line__orig';
      orig.textContent = l.o;

      var trans = document.createElement('span');
      trans.className = 'line__trans';
      trans.textContent = l.t;

      line.appendChild(orig);
      line.appendChild(trans);
      linesEl.appendChild(line);
      return line;
    });
  }

  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce) {
    // No motion: present the first verse already translated, statically.
    var lines = render(verses[0]);
    lines.forEach(function (line) { line.classList.add('show', 'translated'); });
    return;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function loop() {
    var i = 0;
    /* eslint-disable no-constant-condition */
    while (true) {
      var lines = render(verses[i % verses.length]);

      // Fade each original line in, staggered.
      lines.forEach(function (line, idx) {
        setTimeout(function () { line.classList.add('show'); }, idx * 230);
      });
      await sleep(lines.length * 230 + 750);

      // Translate, line by line.
      lines.forEach(function (line, idx) {
        setTimeout(function () { line.classList.add('translated'); }, idx * 270);
      });
      await sleep(lines.length * 270 + 400);

      // Hold on the translation, then fade the verse out.
      await sleep(2300);
      lines.forEach(function (line) { line.classList.remove('show'); });
      await sleep(750);

      i++;
    }
  }

  loop();
})();
