// 화면 전환, 저장, 입력 연결
'use strict';

(function () {
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function starsText(n) { var s = ''; for (var i = 0; i < 3; i++) s += i < n ? '⭐' : '☆'; return s; }

  // ───────── 저장 (사파리 개인정보 보호 모드에서는 저장이 안 될 수 있음) ─────────
  var Store = {
    get: function (k, d) { try { var v = localStorage.getItem('piano.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('piano.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  var settings = Store.get('settings', null) || { mic: true, sens: 0.5, letters: false, drums: true, guide: true, speed: 0.8 };
  if (settings.speech === undefined) settings.speech = true;   // 말소리 거르기
  function saveSettings() { Store.set('settings', settings); }

  var EMOJIS = ['🐰', '🐻', '🐶', '🐱', '🦊', '🐼', '🐯', '🦄', '🐸', '🐧', '🦖', '🐹'];
  var players = Store.get('players', null) || [{ id: 'p1', name: '첫째', emoji: '🐰' }, { id: 'p2', name: '둘째', emoji: '🐻' }];
  var currentPlayer = Store.get('currentPlayer', 'p1');
  var stars = Store.get('stars', {});
  function player() { for (var i = 0; i < players.length; i++) if (players[i].id === currentPlayer) return players[i]; return players[0]; }
  function starOf(mode, songId, pid) { return stars[(pid || currentPlayer) + '.' + mode + '.' + songId] || 0; }
  function totalStars(pid) { var t = 0; Object.keys(stars).forEach(function (k) { if (k.indexOf(pid + '.') === 0) t += stars[k]; }); return t; }
  function record(mode, songId, n) {
    var k = currentPlayer + '.' + mode + '.' + songId;
    if (n <= (stars[k] || 0)) return false;
    stars[k] = n; Store.set('stars', stars); return true;
  }

  var imported = Store.get('imported', []);
  function allSongs() {
    return Music.BUILTIN.concat(imported.map(function (s) {
      var notes = s.notes.map(function (a) { return { midi: a[0], beat: a[1], beats: a[2] }; });
      return { id: s.id, title: s.title, emoji: s.emoji, level: 2, bpm: s.bpm, beatsPerBar: s.beatsPerBar,
               notes: notes, range: Music.rangeFor(notes), imported: true };
    }));
  }

  // ───────── 입력 모으기 (화면 건반 / 마이크) ─────────
  var pressed = {}, lastNote = null, noteHandler = null, micLog = [];
  function noteOn(midi, source, time) {
    pressed[midi] = true;
    lastNote = midi;
    if (source === 'mic') { micLog.push(midi); if (micLog.length > 10) micLog.shift(); }
    if (noteHandler) noteHandler(midi, source, time);
  }
  function noteOff(midi) { delete pressed[midi]; }
  function touchDown(m) { Sound.noteOn(m, 0.8); noteOn(m, 'touch', nowSec()); }
  function touchUp(m) { Sound.noteOff(m); noteOff(m); }
  function onMicNote(midi, on) {
    if (on) {
      if (Sound.recentlyPlayed(midi, 0.5)) return;   // 앱이 방금 낸 소리를 다시 들은 것
      noteOn(midi, 'mic', nowSec());
    } else noteOff(midi);
  }

  function startMicIfNeeded() {
    $('micWarn').textContent = '';
    if (!settings.mic) { Sound.stopMic(); return; }
    Sound.startMic(onMicNote, settings.sens, settings.speech).then(function (ok) {
      if (!ok) {
        $('micWarn').textContent = location.protocol === 'https:'
          ? '마이크를 켤 수 없어요. 사파리 주소창 왼쪽 "AA" › 웹 사이트 설정에서 마이크를 허용해 주세요.'
          : '마이크는 https 주소에서만 쓸 수 있어요. 지금은 화면 건반으로만 연주돼요.';
      }
      updateStatus();
    });
  }

  // ───────── 화면 전환 ─────────
  var current = 'start', frameFn = null;
  var keyboards = {};

  function go(id, arg) {
    if (leaveFn) { leaveFn(); leaveFn = null; }
    Array.prototype.forEach.call(document.querySelectorAll('.screen'), function (s) { s.classList.remove('active'); });
    $(id).classList.add('active');
    current = id;
    noteHandler = null;
    frameFn = null;
    Sound.setExpected(null);
    hideOverlay();
    if (screens[id]) screens[id](arg);
  }
  var leaveFn = null;

  function loop() {
    if (frameFn) frameFn();
    requestAnimationFrame(loop);
  }

  function makeKeyboard(canvasId) {
    var kb = new Keyboard($(canvasId), touchDown, touchUp);
    keyboards[canvasId] = kb;
    return kb;
  }

  // ───────── 결과/일시정지 창 ─────────
  function showOverlay(html, dark, buttons) {
    var p = $('overlayPanel');
    p.className = 'panel' + (dark ? ' dark' : '');
    p.innerHTML = html;
    var row = el('div');
    buttons.forEach(function (b) {
      var btn = el('button', 'pill ' + (dark ? 'big ' : '') + b.color, b.label);
      btn.addEventListener('click', b.fn);
      row.appendChild(btn);
    });
    p.appendChild(row);
    $('overlay').classList.remove('hidden');
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); }

  function showResult(title, n, lines, newRecord, buttons) {
    var head = n === 3 ? '🎉 최고예요! 🎉' : n === 2 ? '👏 잘했어요!' : n === 1 ? '😊 좋아요!' : '💪 다시 해볼까?';
    var html = '<h1>' + head + '</h1><div class="sub">' + esc(title) + '</div><div class="stars">' + starsText(n) + '</div>';
    if (newRecord) html += '<div class="record">🏅 새 기록!</div>';
    lines.forEach(function (l) { html += '<div class="line">' + l + '</div>'; });
    showOverlay(html, false, buttons);
  }

  // ───────── 각 화면 ─────────
  var screens = {};

  screens.home = function () {
    var box = $('players');
    box.innerHTML = '';
    players.forEach(function (p) {
      var b = el('button', 'player' + (p.id === currentPlayer ? ' on' : ''),
        '<span class="pe">' + p.emoji + '</span><span><b>' + esc(p.name) + '</b><small>⭐ ' + totalStars(p.id) + '개</small></span>');
      b.addEventListener('click', function () { currentPlayer = p.id; Store.set('currentPlayer', p.id); screens.home(); });
      box.appendChild(b);
    });
    updateStatus();
  };

  function updateStatus() {
    $('status').textContent = Sound.micActive() ? '🎤 마이크로 피아노 소리를 듣고 있어요'
      : '👆 화면 건반으로 연주해요' + (settings.mic ? ' (마이크 꺼짐)' : '');
  }

  var songMode = 'learn';
  screens.songs = function (mode) {
    if (mode) songMode = mode;
    $('songsTitle').textContent = songMode === 'learn' ? '📖 배울 곡 고르기' : '🎮 게임할 곡 고르기';
    $('songsWho').textContent = player().emoji + ' ' + player().name;
    $('speedRow').style.display = songMode === 'game' ? '' : 'none';
    Array.prototype.forEach.call(document.querySelectorAll('[data-speed]'), function (b) {
      b.classList.toggle('on', +b.getAttribute('data-speed') === settings.speed);
    });
    var grid = $('songGrid');
    grid.innerHTML = '';
    allSongs().forEach(function (s) {
      var card = el('button', 'song',
        '<div class="se">' + s.emoji + '</div><div class="st">' + esc(s.title) + '</div>' +
        '<div class="sl">' + new Array(s.level + 1).join('🔥') + '</div>' +
        '<div class="stars">' + starsText(starOf(songMode, s.id)) + '</div>');
      card.addEventListener('click', function () { go(songMode, s); });
      if (s.imported) {
        var del = el('span', 'del', '✕');
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          if (confirm('"' + s.title + '" 곡을 지울까요?')) {
            imported = imported.filter(function (x) { return x.id !== s.id; });
            Store.set('imported', imported);
            screens.songs();
          }
        });
        card.appendChild(del);
      }
      grid.appendChild(card);
    });
    var add = el('button', 'song add', '<div class="se">➕</div><b>MIDI 곡 추가</b><small>.mid 파일</small>');
    add.addEventListener('click', function () { $('midiFile').click(); });
    grid.appendChild(add);
  };

  $('midiFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var r = null;
      try { r = Music.parseMIDIFile(reader.result); } catch (e) { r = null; }
      if (!r || r.notes.length < 4) { alert('이 파일에서 멜로디를 찾지 못했어요. MIDI(.mid) 파일인지 확인해 주세요.'); return; }
      var icons = ['🎵', '🎶', '🎼', '🎤', '🌈', '🍀', '🌙', '🏰', '🐉', '🚂'];
      imported.push({
        id: 'import-' + Date.now(),
        title: file.name.replace(/\.[^.]+$/, ''),
        emoji: icons[imported.length % icons.length],
        bpm: Math.round(r.bpm), beatsPerBar: r.beatsPerBar,
        notes: r.notes.map(function (n) { return [n.midi, n.beat, n.beats]; })
      });
      Store.set('imported', imported);
      screens.songs();
    };
    reader.readAsArrayBuffer(file);
  });

  // 배우기
  screens.learn = function (song) {
    var lesson = new Lesson(song), kb = keyboards.learnKeys || makeKeyboard('learnKeys');
    var msg = '', msgColor = '#000', saved = false, newRec = false;
    kb.low = song.range.low; kb.high = song.range.high; kb.letters = settings.letters;
    $('learnTitle').textContent = song.emoji + ' ' + song.title;
    var cheers = ['잘했어요! 👏', '좋아요! ✨', '멋져요! 🌟', '정확해요! 🎯', '최고! 💯'];

    noteHandler = function (midi, source) {
      var r = lesson.handle(midi, source);
      var L = settings.letters;
      if (r === 'right') { msg = lesson.finished() ? '다 쳤어요! 🎉' : cheers[lesson.index % cheers.length]; msgColor = '#2a9d4b'; }
      if (r === 'wrong') {
        msg = '그건 ' + Music.particle(Music.fullName(midi, L), '이에요', '예요') + '. ' +
              Music.particle(Music.fullName(lesson.target(), L), '을', '를') + ' 찾아봐요!';
        msgColor = '#e03131';
      }
      if (lesson.finished() && !saved) {
        saved = true;
        newRec = record('learn', song.id, lesson.stars());
        setTimeout(finish, 500);
      }
    };
    function finish() {
      showResult(song.title, lesson.stars(),
        [lesson.mistakes === 0 ? '하나도 안 틀렸어요! 🌈' : '틀린 횟수 ' + lesson.mistakes + '번'], newRec,
        [{ label: '🔄 한 번 더', color: 'orange', fn: function () { hideOverlay(); lesson.restart(); saved = false; msg = ''; } },
         { label: '📋 목록', color: 'blue', fn: function () { go('songs'); } }]);
    }

    $('btnTarget').onclick = function () { var t = lesson.target(); if (t !== null) Sound.noteOn(t, 0.8, 0.8); };
    $('btnPart').onclick = function () { lesson.playDemo(true); };
    $('btnAll').onclick = function () { lesson.playDemo(false); };
    $('btnStop').onclick = function () { lesson.stopDemo(); };
    $('btnRestart').onclick = function () { lesson.restart(); msg = ''; saved = false; };
    $('learnBack').onclick = function () { go('songs'); };
    leaveFn = function () { lesson.stopDemo(); };

    var lastSig = '';
    frameFn = function () {
      var focus = lesson.demoIndex !== null ? lesson.demoIndex : lesson.index;
      var demo = lesson.demoIndex !== null;
      $('learnButtons').classList.toggle('hidden', demo);
      $('btnStop').classList.toggle('hidden', !demo);

      var hintMidi = demo ? lesson.notes[lesson.demoIndex].midi : lesson.target();
      kb.hints = {}; if (hintMidi !== null) kb.hints[hintMidi] = true;
      Sound.setExpected(demo ? null : kb.hints);
      kb.flashes = lesson.flashes; kb.pressed = pressed; kb.letters = settings.letters;
      kb.draw();

      var sig = focus + '|' + demo + '|' + msg + '|' + lesson.index + '|' + $('staff').clientWidth;
      if (sig === lastSig) return;
      lastSig = sig;
      var n = lesson.notes.length;
      $('learnBar').style.width = (100 * lesson.index / n) + '%';
      $('learnCount').textContent = lesson.index + ' / ' + n;
      var start = Math.max(0, Math.min(focus - 2, n - 10));
      var win = lesson.notes.slice(start, start + 10).map(function (x) { return x.midi; });
      drawStaff($('staff'), win, focus - start, settings.letters);
      if (demo) {
        $('guideMain').innerHTML = '<span style="color:#9b5cf6">👂 잘 들어보세요… ' + Music.fullName(hintMidi, settings.letters) + '</span>';
        $('guideMsg').textContent = '';
      } else if (hintMidi !== null) {
        var nm = Music.fullName(hintMidi, settings.letters);
        $('guideMain').innerHTML = '<span style="color:' + Music.color(hintMidi) + '">' + nm + '</span>' +
          Music.particle(nm, '을', '를').slice(nm.length) + ' 눌러요!';
        $('guideMsg').textContent = msg;
        $('guideMsg').style.color = msgColor;
      } else {
        $('guideMain').textContent = '🎉';
        $('guideMsg').textContent = msg;
      }
    };
  };

  // 리듬 게임
  screens.game = function (song) {
    var guide = settings.guide && !Sound.micActive();
    var game = new Game(song, settings.speed, { guide: guide, drums: settings.drums });
    var kb = keyboards.gameKeys || makeKeyboard('gameKeys');
    kb.low = song.range.low; kb.high = song.range.high;
    var judge = $('judge');
    $('gameTitle').textContent = song.emoji + ' ' + song.title;

    game.onJudge = function (text, cls) {
      judge.className = 'judge';
      void judge.offsetWidth;          // 애니메이션 다시 시작
      judge.textContent = text;
      judge.className = 'judge show ' + cls;
    };
    game.onFinish = function () {
      var n = game.stars(), rec = record('game', song.id, n);
      showResult(song.title, n,
        ['점수 ' + game.score + '점 · 최고 콤보 ' + game.maxCombo,
         '완벽 ' + game.perfect + ' · 좋아 ' + game.good + ' · 놓침 ' + game.miss], rec,
        [{ label: '🔄 다시', color: 'orange', fn: function () { hideOverlay(); game.reset(); } },
         { label: '📋 목록', color: 'blue', fn: function () { go('songs'); } }]);
    };
    noteHandler = function (midi, source, time) { game.handle(midi, source, time); };

    $('btnPreview').onclick = function () { game.start(true); };
    $('btnPlay').onclick = function () { game.start(false); };
    $('gameBack').onclick = function () { go('songs'); };
    $('pauseBtn').onclick = function () {
      game.pause();
      showOverlay('<h1>잠깐 쉬어요 ☕️</h1>', true, [
        { label: '▶️ 계속하기', color: 'green', fn: function () { hideOverlay(); game.resume(); } },
        { label: '🔄 처음부터', color: 'orange', fn: function () { hideOverlay(); game.reset(); } },
        { label: '📋 나가기', color: 'gray', fn: function () { go('songs'); } }
      ]);
    };
    leaveFn = function () { game.phase = 'ready'; Sound.allOff(); };

    $('readyEmoji').textContent = song.emoji;
    $('readyTitle').textContent = song.title;
    $('readyStars').textContent = starsText(starOf('game', song.id));
    $('readyHint').textContent = Sound.micActive() ? '🎤 피아노 소리를 듣고 있어요. 아이패드를 피아노 가까이 두세요!' : '';

    var lastPhase = '';
    frameFn = function () {
      game.tick();
      if (game.phase !== lastPhase) {
        lastPhase = game.phase;
        var inGame = game.phase === 'playing' || game.phase === 'paused' || game.phase === 'finished';
        $('ready').classList.toggle('hidden', game.phase !== 'ready');
        $('scoreBox').classList.toggle('hidden', !inGame);
        $('comboBox').classList.toggle('hidden', !inGame);
        $('pauseBtn').classList.toggle('hidden', !(game.phase === 'playing' || game.phase === 'preview'));
        if (game.phase === 'ready') $('readyStars').textContent = starsText(starOf('game', song.id));
      }
      $('score').textContent = game.score;
      $('combo').textContent = game.combo;
      game.draw($('fall'), settings.letters);
      kb.hints = game.hints; kb.flashes = game.flashes; kb.pressed = pressed; kb.letters = settings.letters;
      Sound.setExpected(game.phase === 'playing' ? game.hints : null);
      kb.draw();
    };
  };

  // 자유 연주
  var octave = 4;
  screens.free = function () {
    var kb = keyboards.freeKeys || makeKeyboard('freeKeys'), history = [], dirty = true;
    function setOct() { kb.low = (octave + 1) * 12; kb.high = (octave + 3) * 12; $('octLabel').textContent = '옥타브 ' + octave; }
    setOct();
    $('octDown').onclick = function () { octave = Math.max(2, octave - 1); setOct(); };
    $('octUp').onclick = function () { octave = Math.min(6, octave + 1); setOct(); };
    var box = $('freeNote');
    box.className = 'free-note';
    box.textContent = '아무 건반이나 쳐 보세요 🎹';
    box.style.color = '';
    noteHandler = function (midi) {
      history.push(midi);
      if (history.length > 12) history.shift();
      box.className = 'free-note big';
      box.textContent = Music.fullName(midi, settings.letters);
      box.style.color = Music.color(midi);
      dirty = true;
    };
    var lastW = 0;
    frameFn = function () {
      kb.hints = {}; kb.flashes = {}; kb.pressed = pressed; kb.letters = settings.letters;
      kb.draw();
      if (dirty || $('freeStaff').clientWidth !== lastW) {
        dirty = false; lastW = $('freeStaff').clientWidth;
        drawStaff($('freeStaff'), history, history.length ? history.length - 1 : null, settings.letters);
      }
    };
  };

  // 설정
  screens.settings = function () {
    $('setMic').checked = settings.mic;
    $('setSpeech').checked = settings.speech;
    $('setSens').value = settings.sens;
    $('setDrums').checked = settings.drums;
    $('setGuide').checked = settings.guide;
    Array.prototype.forEach.call(document.querySelectorAll('[data-letters]'), function (b) {
      b.classList.toggle('on', (b.getAttribute('data-letters') === '1') === settings.letters);
    });
    var pe = $('playerEdit');
    pe.innerHTML = '';
    players.forEach(function (p) {
      var row = el('div', 'prow');
      var emo = el('button', '', p.emoji);
      emo.addEventListener('click', function () {
        p.emoji = EMOJIS[(EMOJIS.indexOf(p.emoji) + 1) % EMOJIS.length];
        emo.textContent = p.emoji;
        Store.set('players', players);
      });
      var input = el('input');
      input.value = p.name;
      input.maxLength = 8;
      input.addEventListener('input', function () { p.name = input.value || p.id; Store.set('players', players); });
      row.appendChild(emo); row.appendChild(input);
      pe.appendChild(row);
    });
    pe.appendChild(el('p', 'hint', '동물을 누르면 바뀌어요.'));
    noteHandler = function () {};
    frameFn = function () {
      $('micMeter').style.width = Math.round(Sound.micLevel() * 100) + '%';
      var n = lastNote;
      $('micNote').textContent = n === null ? '-' : Music.fullName(n, settings.letters);
      $('micNote').style.color = n === null ? '' : Music.color(n);
      $('micLog').textContent = micLog.length ? micLog.map(function (m) { return Music.fullName(m, settings.letters); }).join(', ') : '(아직 없음)';
    };
  };

  $('setMic').addEventListener('change', function () { settings.mic = this.checked; saveSettings(); startMicIfNeeded(); });
  $('setSens').addEventListener('input', function () { settings.sens = +this.value; saveSettings(); Sound.setSensitivity(settings.sens); });
  $('setSpeech').addEventListener('change', function () { settings.speech = this.checked; saveSettings(); Sound.setSpeechFilter(settings.speech); });
  $('setDrums').addEventListener('change', function () { settings.drums = this.checked; saveSettings(); });
  $('setGuide').addEventListener('change', function () { settings.guide = this.checked; saveSettings(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-letters]'), function (b) {
    b.addEventListener('click', function () { settings.letters = b.getAttribute('data-letters') === '1'; saveSettings(); screens.settings(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-speed]'), function (b) {
    b.addEventListener('click', function () { settings.speed = +b.getAttribute('data-speed'); saveSettings(); screens.songs(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
    b.addEventListener('click', function () { go(b.getAttribute('data-go')); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () { go('songs', b.getAttribute('data-mode')); });
  });

  $('startBtn').addEventListener('click', function () {
    Sound.unlock();
    startMicIfNeeded();
    go('home');
  });

  // 화면을 누를 때마다 소리가 멈춰 있으면 다시 켠다 (사파리가 백그라운드에서 멈춤)
  document.addEventListener('touchstart', function () { if (Sound.isUnlocked()) Sound.unlock(); }, true);
  // 두 번 탭 확대 막기
  var lastTouch = 0;
  document.addEventListener('touchend', function (e) {
    var t = Date.now();
    if (t - lastTouch < 350 && e.target.tagName !== 'INPUT') e.preventDefault();
    lastTouch = t;
  }, { passive: false });
  window.addEventListener('resize', function () { Object.keys(keyboards).forEach(function (k) { keyboards[k].sig = ''; }); });

  requestAnimationFrame(loop);
})();
