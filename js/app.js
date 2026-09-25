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

  // ───────── 점수 (기록만, 보상 없음) ─────────
  var points = Store.get('points', {});          // { 플레이어: { 'YYYY-MM-DD': 점수 } }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addPoints(n) {
    if (!n) return;
    var p = points[currentPlayer] = points[currentPlayer] || {}, k = dayKey();
    p[k] = (p[k] || 0) + n;
    Store.set('points', points);
  }
  function pointsOn(pid, d) { return ((points[pid] || {})[dayKey(d)]) || 0; }
  function pointsSince(pid, days) {
    var t = 0, d = new Date();
    for (var i = 0; i < days; i++) { t += pointsOn(pid, d); d.setDate(d.getDate() - 1); }
    return t;
  }
  function pointsTotal(pid) { var t = 0, p = points[pid] || {}; Object.keys(p).forEach(function (k) { t += p[k]; }); return t; }
  function streak(pid) {   // 오늘(또는 어제)부터 거꾸로 연속으로 연습한 날 수
    var d = new Date(), n = 0;
    if (!pointsOn(pid, d)) d.setDate(d.getDate() - 1);
    while (pointsOn(pid, d) > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // ───────── 단계 깨기 진행 ─────────
  var STAGES = courseStages();
  var courseProg = Store.get('course', {});        // { 플레이어: { 곡id: {heard, learn, slow, normal} } }
  function progOf(songId, pid) { var p = courseProg[pid || currentPlayer] = courseProg[pid || currentPlayer] || {}; return p[songId] = p[songId] || {}; }
  function saveProg() { Store.set('course', courseProg); }
  function passed(songId, pid) { var g = ((courseProg[pid || currentPlayer] || {})[songId]) || {}; return !!(g.learn && g.slow >= 2 && g.normal >= 2); }
  function stageDone(i, pid) { var st = STAGES[i]; return st.songs.length > 0 && st.songs.every(function (s) { return passed(s.id, pid); }); }
  function startStage(pid) { var pl = players.filter(function (x) { return x.id === (pid || currentPlayer); })[0]; return pl && pl.start ? pl.start : 0; }
  function stageOpen(i) { return i <= startStage() || (i > 0 && stageDone(i - 1)); }
  function songOpen(stageI, songI) {
    if (!stageOpen(stageI)) return false;
    return songI === 0 || passed(STAGES[stageI].songs[songI - 1].id);
  }
  // 게임·배우기가 끝났을 때 단계 진행 기록 (처음 통과하면 점수)
  function courseResult(ctx, kind, stars) {
    if (!ctx) return;
    var g = progOf(ctx.song.id), was = passed(ctx.song.id), stageWas = stageDone(ctx.stage);
    if (kind === 'learn') g.learn = true;
    if (kind === 'slow') g.slow = Math.max(g.slow || 0, stars);
    if (kind === 'normal') g.normal = Math.max(g.normal || 0, stars);
    saveProg();
    if (!was && passed(ctx.song.id)) addPoints(20);
    if (!stageWas && stageDone(ctx.stage)) addPoints(50);
  }

  // 곡마다 빠르기를 따로 기억 (가족 곡은 기본 0.6배가 원곡 느낌)
  var speeds = Store.get('speeds', {});
  function speedOf(song) { return speeds[song.id] || (song.id.indexOf('family-') === 0 ? 0.6 : 0.8); }
  function setSpeedOf(song, v) { speeds[song.id] = v; Store.set('speeds', speeds); }
  function speedText(v) { return (Math.round(v * 100) / 100) + '배'; }

  var imported = Store.get('imported', []);
  function toSong(s, isImported) {
    var notes = s.notes.map(function (a) { return { midi: a[0], beat: a[1], beats: a[2] }; });
    var cat = s.cat || (s.id.indexOf('rec-') === 0 ? '내가 만든 곡' : 'MIDI로 넣은 곡');
    return { id: s.id, title: s.title, emoji: s.emoji, level: s.level || 2, bpm: s.bpm, beatsPerBar: s.beatsPerBar,
             notes: notes, range: Music.rangeFor(notes), imported: isImported, cat: cat };
  }
  function allSongs() {
    return Music.BUILTIN
      .concat(familySongs.map(function (s) { return toSong(s, false); }))
      .concat(imported.map(function (s) { return toSong(s, true); }));
  }

  // ───────── 가족 곡 모음: 비공개 링크에서 자동으로 불러온다 ─────────
  // 특별 링크(?pack=사용자/번호)로 한 번 열면 이 기기에 기억해 두고, 이후엔 앱을 열 때마다 최신 곡을 받아온다.
  var familySongs = [];
  (function () {
    var m = /[?&]pack=([\w-]+\/[0-9a-f]+)/.exec(location.search);
    if (m) {
      Store.set('pack', m[1]);
      if (history.replaceState) history.replaceState(null, '', location.pathname);   // 주소창에서 링크 숨김
    }
  })();
  // 비밀번호로 잠근 가족 곡 (songs/family.enc = openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -md sha256)
  function decryptFamily(buffer, password) {
    var data = new Uint8Array(buffer);
    var salt = data.slice(8, 16), body = data.slice(16);
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.reject(new Error('no crypto'));
    return subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits'])
      .then(function (base) {
        return subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' }, base, 384);
      })
      .then(function (bits) {
        var b = new Uint8Array(bits);
        return subtle.importKey('raw', b.slice(0, 32), { name: 'AES-CBC' }, false, ['decrypt'])
          .then(function (key) { return subtle.decrypt({ name: 'AES-CBC', iv: b.slice(32, 48) }, key, body); });
      })
      .then(function (plain) { return JSON.parse(new TextDecoder().decode(plain)); });
  }

  function useFamily(d) {
    familySongs = d.songs;
    if (current === 'songs') screens.songs();
    if (current === 'home') screens.home();
  }

  function loadFamilySongs(password) {
    password = password || Store.get('familyPassword', null);
    var pack = Store.get('pack', null);
    if (!password && !pack) return Promise.resolve(false);
    var cached = Store.get('packCache', null);
    if (cached && cached.songs && !familySongs.length) familySongs = cached.songs;
    if (password) {
      return fetch('songs/family.enc?t=' + Date.now())
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (buf) { return decryptFamily(buf, password); })
        .then(function (d) {
          Store.set('familyPassword', password);
          Store.set('packCache', d);
          useFamily(d);
          return true;
        })
        .catch(function (e) { return e && e.name === 'OperationError' ? 'wrong' : !!familySongs.length; });
    }
    return fetch('https://gist.githubusercontent.com/' + pack + '/raw/family-songs.json?t=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        if (!d || !d.songs) return false;
        Store.set('packCache', d);
        useFamily(d);
        return true;
      })
      .catch(function () { return false; /* 인터넷이 안 되면 저장해 둔 곡을 그대로 쓴다 */ });
  }

  // 처음 들어올 때 비밀번호 확인 (맞으면 기억해서 다음부터는 묻지 않음)
  function submitPassword() {
    var pw = $('pwInput').value.trim();
    if (!pw) return;
    Sound.unlock();
    startMicIfNeeded();          // 버튼을 누른 순간에 마이크를 켜야 아이패드에서 잘 켜진다
    $('pwMsg').textContent = '확인 중…';
    loadFamilySongs(pw).then(function (r) {
      if (r === true) { $('pwInput').blur(); go('home'); }
      else if (r === 'wrong') { $('pwMsg').textContent = '비밀번호가 틀렸어요 😢'; $('pwInput').value = ''; }
      else $('pwMsg').textContent = '인터넷 연결을 확인해 주세요';
    });
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
  // 아이패드에서 소리 엔진이 새로 만들어지면 화면을 누를 때 다시 켜지도록 (touchstart에서 unlock)

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
    var pid = currentPlayer, st = streak(pid);
    $('todayLine').innerHTML = '⭐ 오늘 ' + pointsOn(pid) + '점' + (st > 1 ? ' · 🔥 ' + st + '일 연속' : '') +
      ' <button id="recordBtn">📅 기록</button>';
    $('recordBtn').onclick = showRecords;
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

  // 기록 보기: 최근 7일, 이번 주, 전체
  function showRecords() {
    var html = '<h1>📅 ' + esc(player().name) + '의 기록</h1><div class="rec-days">';
    var names = ['일', '월', '화', '수', '목', '금', '토'], d = new Date();
    d.setDate(d.getDate() - 6);
    for (var i = 0; i < 7; i++) {
      var n = pointsOn(currentPlayer, d);
      html += '<div class="rday' + (n ? ' on' : '') + '"><small>' + names[d.getDay()] + '</small><b>' + (n ? '⭐' : '·') + '</b><small>' + (n || '') + '</small></div>';
      d.setDate(d.getDate() + 1);
    }
    html += '</div><div class="line">최근 7일 ' + pointsSince(currentPlayer, 7) + '점 · 전체 ' + pointsTotal(currentPlayer) + '점</div>';
    var cleared = 0, now = 0;
    STAGES.forEach(function (st, i) { if (stageDone(i)) cleared++; if (stageOpen(i)) now = i; });
    html += '<div class="line">🗺️ 지금 ' + (now + 1) + '단계 ' + STAGES[now].emoji + ' ' + STAGES[now].name + '</div>';
    players.forEach(function (p) {
      if (p.id !== currentPlayer) html += '<div class="line sub">' + p.emoji + ' ' + esc(p.name) + ': 오늘 ' + pointsOn(p.id) + '점 · 전체 ' + pointsTotal(p.id) + '점</div>';
    });
    showOverlay(html, false, [{ label: '닫기', color: 'blue', fn: hideOverlay }]);
  }

  function updateStatus() {
    $('status').textContent = (Sound.micActive() ? '🎤 마이크로 피아노 소리를 듣고 있어요'
      : '👆 화면 건반으로 연주해요' + (settings.mic ? ' (마이크 꺼짐)' : '')) +
      (familySongs.length ? '  ·  👨‍👩‍👧 가족 곡 ' + familySongs.length + '개' : '');
  }

  var songMode = 'learn', songCat = Store.get('songCat', '전체');
  screens.songs = function (mode) {
    if (mode) songMode = mode;
    $('songsTitle').textContent = songMode === 'learn' ? '📖 배울 곡 고르기' : '🎮 게임할 곡 고르기';
    $('songsWho').textContent = player().emoji + ' ' + player().name;
    // 카테고리 탭
    var ORDER = ['동요', '지브리', '애니·J팝', '디즈니·영화', '가요', '팝', '게임', '클래식', '캐럴', '내가 만든 곡', 'MIDI로 넣은 곡'];
    var ICON = { '동요': '🧸', '지브리': '🌳', '애니·J팝': '🍥', '디즈니·영화': '🏰', '가요': '🎤', '팝': '🎸', '게임': '🎮',
                 '클래식': '🎻', '캐럴': '🎄', '내가 만든 곡': '🎙️', 'MIDI로 넣은 곡': '📁' };
    var songsAll = allSongs(), cats = {};
    songsAll.forEach(function (s) { cats[s.cat] = (cats[s.cat] || 0) + 1; });
    if (songCat !== '전체' && !cats[songCat]) songCat = '전체';
    var tabs = $('catTabs');
    tabs.innerHTML = '';
    ['전체'].concat(ORDER.filter(function (c) { return cats[c]; })).forEach(function (c) {
      var b = el('button', c === songCat ? 'on' : '', (c === '전체' ? '🌈' : ICON[c]) + ' ' + c + ' <small>' + (c === '전체' ? songsAll.length : cats[c]) + '</small>');
      b.addEventListener('click', function () { songCat = c; Store.set('songCat', c); screens.songs(); });
      tabs.appendChild(b);
    });
    var grid = $('songGrid');
    grid.innerHTML = '';
    songsAll.filter(function (s) { return songCat === '전체' || s.cat === songCat; }).forEach(function (s) {
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
  screens.learn = function (arg) {
    var song = arg && arg.song ? arg.song : arg, course = arg && arg.course ? arg.course : null;
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
        addPoints(10 + lesson.stars() * 2);
        courseResult(course, 'learn', lesson.stars());
        setTimeout(finish, 500);
      }
    };
    function finish() {
      showResult(song.title, lesson.stars(),
        [lesson.mistakes === 0 ? '하나도 안 틀렸어요! 🌈' : '틀린 횟수 ' + lesson.mistakes + '번'], newRec,
        [{ label: '🔄 한 번 더', color: 'orange', fn: function () { hideOverlay(); lesson.restart(); saved = false; msg = ''; } },
         course ? { label: '🗺️ 단계로', color: 'green', fn: function () { go('stage'); } }
                : { label: '📋 목록', color: 'blue', fn: function () { go('songs'); } }]);
    }

    $('btnTarget').onclick = function () { var t = lesson.target(); if (t !== null) Sound.noteOn(t, 0.8, 0.8); };
    $('btnPart').onclick = function () { lesson.playDemo(true); };
    $('btnAll').onclick = function () { lesson.playDemo(false); };
    $('btnStop').onclick = function () { lesson.stopDemo(); };
    $('btnRestart').onclick = function () { lesson.restart(); msg = ''; saved = false; };
    $('learnBack').onclick = function () { go(course ? 'stage' : 'songs'); };
    lesson.speed = speedOf(song);
    $('learnSpeed').value = lesson.speed;
    $('learnSpeedLabel').textContent = speedText(lesson.speed);
    $('learnSpeed').oninput = function () {
      lesson.speed = +this.value; setSpeedOf(song, lesson.speed);
      $('learnSpeedLabel').textContent = speedText(lesson.speed);
    };
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
  screens.game = function (arg) {
    var song = arg && arg.song ? arg.song : arg, course = arg && arg.course ? arg.course : null;
    var guide = settings.guide && !Sound.micActive();
    var sp = course ? arg.speed : speedOf(song);
    var game = new Game(song, sp, { guide: guide, drums: settings.drums });
    $('gameSpeed').value = sp;
    $('gameSpeed').disabled = !!course;       // 단계 깨기에서는 빠르기가 정해져 있음
    $('gameSpeedLabel').textContent = speedText(sp) + (course ? (arg.kind === 'slow' ? ' 🐢' : ' 🐇') : '');
    $('gameSpeed').oninput = function () {
      var v = +this.value;
      setSpeedOf(song, v);
      $('gameSpeedLabel').textContent = speedText(v);
      if (game.phase === 'ready') game.setSpeed(v);
    };
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
      addPoints(5 + n * 5);
      courseResult(course, arg.kind, n);
      showResult(song.title, n,
        ['점수 ' + game.score + '점 · 최고 콤보 ' + game.maxCombo,
         '완벽 ' + game.perfect + ' · 좋아 ' + game.good + ' · 놓침 ' + game.miss], rec,
        [{ label: '🔄 다시', color: 'orange', fn: function () { hideOverlay(); game.reset(); } },
         course ? { label: '🗺️ 단계로', color: 'green', fn: function () { go('stage'); } }
                : { label: '📋 목록', color: 'blue', fn: function () { go('songs'); } }]);
    };
    noteHandler = function (midi, source, time) { game.handle(midi, source, time); };

    $('btnPreview').onclick = function () { game.start(true); };
    $('btnPlay').onclick = function () { game.start(false); };
    $('gameBack').onclick = function () { go(course ? 'stage' : 'songs'); };
    $('pauseBtn').onclick = function () {
      game.pause();
      showOverlay('<h1>잠깐 쉬어요 ☕️</h1>', true, [
        { label: '▶️ 계속하기', color: 'green', fn: function () { hideOverlay(); game.resume(); } },
        { label: '🔄 처음부터', color: 'orange', fn: function () { hideOverlay(); game.reset(); } },
        { label: '📋 나가기', color: 'gray', fn: function () { go(course ? 'stage' : 'songs'); } }
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


  // ───────── 단계 깨기 ─────────
  screens.course = function () {
    $('courseWho').textContent = player().emoji + ' ' + player().name;
    var map = $('courseMap');
    map.innerHTML = '';
    var nowI = -1;
    STAGES.forEach(function (st, i) { if (stageOpen(i) && !stageDone(i) && nowI < 0) nowI = i; });
    STAGES.forEach(function (st, i) {
      var open = stageOpen(i), done = stageDone(i);
      var cnt = st.songs.filter(function (s) { return passed(s.id); }).length;
      var t = el('button', 'stage-tile' + (open ? '' : ' locked') + (done ? ' done' : '') + (i === nowI ? ' now' : ''),
        '<span class="se">' + (open ? st.emoji : '🔒') + '</span><b>' + (i + 1) + '단계 · ' + st.name + '</b><small>' + st.desc + '</small>' +
        '<span class="cnt">' + (st.songs.length ? cnt + '/' + st.songs.length : '준비 중') + '</span>' +
        '<div class="bar"><div style="width:' + (st.songs.length ? 100 * cnt / st.songs.length : 0) + '%"></div></div>');
      t.addEventListener('click', function () {
        if (!open) { alert('앞 단계를 모두 깨면 열려요! 🔒'); return; }
        if (!st.songs.length) { alert('이 단계 곡은 곧 들어와요 🎵'); return; }
        go('stage', i);
      });
      map.appendChild(t);
    });
  };

  var stageIndex = 0, demoGen = 0;
  screens.stage = function (i) {
    if (i !== undefined) stageIndex = i;
    var st = STAGES[stageIndex];
    $('stageTitle').textContent = st.emoji + ' ' + (stageIndex + 1) + '단계 · ' + st.name;
    $('stageDesc').textContent = st.desc + ' · 곡마다 🎧 듣기 → 📖 따라 치기 → 🐢 느린 게임 → 🐇 보통 게임(별 2개 이상)이면 통과!';
    $('stageCount').textContent = st.songs.filter(function (s) { return passed(s.id); }).length + ' / ' + st.songs.length;
    var box = $('stageSongs');
    box.innerHTML = '';
    st.songs.forEach(function (song, k) {
      var open = songOpen(stageIndex, k), g = progOf(song.id), ok = passed(song.id);
      var row = el('div', 'song-row' + (open ? '' : ' locked') + (ok ? ' passed' : ''),
        '<div class="num">' + (ok ? '✓' : k + 1) + '</div><div class="ttl">' + esc(song.title) + '<small>' + song.notes.length + '음</small></div>');
      var steps = el('div', 'steps2');
      function btn(label, done, fn) {
        var b = el('button', done ? 'ok' : '', label);
        b.disabled = !open;
        b.addEventListener('click', fn);
        steps.appendChild(b);
      }
      var ctx = { song: song, stage: stageIndex };
      btn('🎧 듣기' + (g.heard ? ' ✓' : ''), g.heard, function () { playSongDemo(song); g.heard = true; saveProg(); screens.stage(); });
      btn('📖 따라 치기' + (g.learn ? ' ✓' : ''), g.learn, function () { go('learn', { song: song, course: ctx }); });
      btn('🐢 ' + starsText(g.slow || 0), (g.slow || 0) >= 2, function () { go('game', { song: song, course: ctx, speed: Math.round(st.goal * 0.6 * 20) / 20, kind: 'slow' }); });
      btn('🐇 ' + starsText(g.normal || 0), (g.normal || 0) >= 2, function () { go('game', { song: song, course: ctx, speed: st.goal, kind: 'normal' }); });
      row.appendChild(steps);
      box.appendChild(row);
    });
    leaveFn = function () { demoGen++; Sound.allOff(); };
  };

  function playSongDemo(song) {
    demoGen++; Sound.allOff();
    var gen = demoGen, spb = 60 / song.bpm, first = song.notes[0].beat;
    song.notes.forEach(function (n) {
      setTimeout(function () { if (gen === demoGen) Sound.noteOn(n.midi, 0.8, n.beats * spb * 0.9); }, ((n.beat - first) * spb + 0.2) * 1000);
    });
  }

  // ───────── 배우기 메뉴 ─────────
  var quizLevel = Store.get('quizLevel', 0);
  screens.learnMenu = function () {
    $('learnWho').textContent = player().emoji + ' ' + player().name;
    var row = $('levelRow');
    row.innerHTML = '';
    QUIZ_LEVELS.forEach(function (lv, i) {
      var b = el('button', i === quizLevel ? 'on' : '', lv.name + '<small>' + lv.desc + '</small>');
      b.addEventListener('click', function () { quizLevel = i; Store.set('quizLevel', i); screens.learnMenu(); });
      row.appendChild(b);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-quiz]'), function (b) {
      var type = b.getAttribute('data-quiz');
      var st = b.querySelector('.qstars') || b.appendChild(el('span', 'qstars'));
      st.textContent = starsText(starOf('quiz', type + quizLevel));
    });
  };
  Array.prototype.forEach.call(document.querySelectorAll('[data-quiz]'), function (b) {
    b.addEventListener('click', function () { go('quiz', b.getAttribute('data-quiz')); });
  });

  // ───────── 퀴즈 ─────────
  screens.quiz = function (type) {
    var quiz = new Quiz(type, quizLevel, allSongs()), kb = keyboards.quizKeys || makeKeyboard('quizKeys');
    var T = QUIZ_TYPES[type], msg = '', msgColor = '#000', done = false, picked = {};
    kb.low = quiz.info.low; kb.high = quiz.info.high;
    $('quizTitle').textContent = T.title + (type === 'guess' ? '' : ' · ' + quiz.info.name);
    var canReplay = type === 'ear' || type === 'updown' || type === 'guess' || type === 'memory';
    $('quizReplay').classList.toggle('hidden', !canReplay);
    $('quizReplay').onclick = function () { if (!quiz.demo) quiz.play(); };
    $('quizStaff').style.display = type === 'read' || type === 'choice' ? '' : 'none';
    $('quizKeys').style.display = T.keys ? '' : 'none';
    if (type === 'ear') msg = '잘 듣고 그 음을 찾아 쳐 보세요!';
    if (type === 'memory') msg = '노랗게 빛나는 순서를 잘 보고 들어요!';
    var cheers = ['딩동댕! 🎉', '맞았어요! 👏', '정답! ⭐', '최고! 💯', '대단해요! 🌟'];

    function afterAnswer(r, midi) {
      var L = settings.letters;
      if (r === 'right') { msg = cheers[quiz.index % cheers.length]; msgColor = '#2a9d4b'; picked = {}; }
      if (r === 'good') { msg = '좋아요, 계속! (' + quiz.pos + ' / ' + quiz.seq.length + ')'; msgColor = '#2a9d4b'; }
      if (r === 'almost') { msg = '음은 맞았어요! 높이를 다시 봐요 (' + Music.fullName(midi, L) + ')'; msgColor = '#e08a00'; }
      if (r === 'wrong') {
        msg = type === 'memory' ? '아쉬워요! 초록색이 정답이었어요'
          : type === 'ear' ? '다시 들어볼까요? 🔊'
          : midi === undefined ? '다시 골라 봐요!'
          : '그건 ' + Music.particle(Music.fullName(midi, L), '이에요', '예요') + '. 다시!';
        msgColor = '#e03131';
      }
      if (type === 'memory' && r === 'right') msg = '성공! ' + quiz.seq.length + '개 기억했어요 🧠 다음은 하나 더!';
      checkEnd();
    }

    function checkEnd() {
      if (!quiz.finished() || done) return;
      done = true;
      var n = quiz.stars(), rec = record('quiz', type + (type === 'guess' ? '' : quizLevel), n);
      addPoints(3 + n * 3);
      var secs = Math.round(nowSec() - quiz.started);
      var lines = type === 'memory' ? ['한 번에 기억한 음 ' + quiz.score() + '개']
        : type === 'speed' ? ['30초 동안 ' + quiz.score() + '개 찾았어요!']
        : ['한 번에 맞힌 문제 ' + quiz.firstTry + ' / ' + quiz.total, '걸린 시간 ' + secs + '초'];
      setTimeout(function () {
        showResult(T.title, n, lines, rec,
          [{ label: '🔄 한 번 더', color: 'orange', fn: function () { hideOverlay(); quiz.restart(); done = false; msg = ''; picked = {}; } },
           { label: '📋 메뉴', color: 'blue', fn: function () { go('learnMenu'); } }]);
      }, type === 'memory' ? 1200 : 600);
    }

    noteHandler = function (midi, source) {
      var r = quiz.handle(midi, source);
      if (r) afterAnswer(r, midi);
    };

    function renderChoices() {
      var box = $('quizChoices');
      box.innerHTML = '';
      if (T.keys) return;
      quiz.choices.forEach(function (c, i) {
        var label = c.midi !== undefined ? Music.name(c.midi, settings.letters) : c.label;
        var b = el('button', (type === 'guess' ? 'wide ' : '') + (picked[i] ? 'bad' : ''), esc(label));
        if (c.midi !== undefined) b.style.color = Music.color(c.midi);
        b.addEventListener('click', function () {
          var r = quiz.choose(i);
          if (r === 'wrong') picked[i] = true;
          if (r) { afterAnswer(r); lastSig = ''; }
        });
        box.appendChild(b);
      });
    }

    var lastSig = '', lastChoices = null;
    frameFn = function () {
      var t = quiz.target, L = settings.letters;
      if (T.keys) {
        kb.hints = {}; if (quiz.wrongNow >= 3 && !quiz.waiting && type !== 'memory') kb.hints[t] = true;
        kb.flashes = quiz.flashes; kb.pressed = pressed; kb.letters = L;
        kb.draw();
      }
      if (type === 'speed') {
        $('quizCount').textContent = '⏱ ' + Math.ceil(quiz.timeLeft()) + '초 · ' + quiz.index + '개';
        checkEnd();
      }
      if (quiz.choices !== lastChoices || lastSig === '') { lastChoices = quiz.choices; renderChoices(); }
      var sig = [t, quiz.index, msg, quiz.wrongNow >= 3, quiz.demo, $('quizStaff').clientWidth].join('|');
      if (sig === lastSig) return;
      lastSig = sig;
      if (type === 'memory') {
        $('quizBar').style.width = Math.min(100, quiz.seq.length * 10) + '%';
        $('quizCount').textContent = '🧠 ' + quiz.seq.length + '개';
      } else if (type !== 'speed') {
        $('quizBar').style.width = (100 * quiz.index / quiz.total) + '%';
        $('quizCount').textContent = Math.min(quiz.index + 1, quiz.total) + ' / ' + quiz.total;
      } else {
        $('quizBar').style.width = (100 * quiz.timeLeft() / quiz.timeLimit) + '%';
      }
      var P = $('quizPrompt'), colored = function (m) { return '<span style="color:' + Music.color(m) + '">' + Music.fullName(m, L) + '</span>'; };
      if (type === 'read' || type === 'choice') {
        drawStaff($('quizStaff'), [t], 0, L, quiz.wrongNow < 3);
        P.innerHTML = quiz.wrongNow >= 3 ? colored(t) : (type === 'read' ? '이 음을 피아노로 쳐 보세요! 🤔' : '이 음의 이름은? 🤔');
      } else if (type === 'find' || type === 'speed') {
        var nm = Music.fullName(t, L);
        P.innerHTML = colored(t) + Music.particle(nm, '을', '를').slice(nm.length) + ' 쳐요!';
      } else if (type === 'ear') {
        P.innerHTML = quiz.wrongNow >= 3 ? '정답은 ' + colored(t) : '🎵 어떤 음일까요?';
      } else if (type === 'updown') {
        P.innerHTML = '🎵 두 번째 소리는?';
      } else if (type === 'guess') {
        P.innerHTML = '🎵 무슨 곡일까요?';
      } else if (type === 'memory') {
        P.innerHTML = quiz.demo ? '👀 잘 보고 들어요…' : '🎹 이제 따라 쳐요!';
      }
      $('quizMsg').textContent = msg;
      $('quizMsg').style.color = msgColor;
    };
    leaveFn = function () { quiz.gen++; Sound.allOff(); };
  };

  // ───────── 노래 만들기: ① 녹음만 → ② 계이름으로 바꾸기 → ③ 저장·연주 ─────────
  screens.record = function () {
    var rec = [], recording = false, startedAt = 0, savedNotes = null, lastCap = null, playGen = 0, savedSong = null;
    var kb = keyboards.recKeys || makeKeyboard('recKeys');
    kb.low = 60; kb.high = 84;
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    function step(n) {
      [1, 2, 3].forEach(function (i) {
        $('recStep' + i).classList.toggle('hidden', i !== n);
        $('st' + i).classList.toggle('on', i === n);
      });
      $('recKeys').style.display = n === 1 ? '' : 'none';
      Object.keys(keyboards).forEach(function (k) { keyboards[k].sig = ''; });
    }

    // 유튜브: 영상을 앱 안에 띄우고, 녹음 버튼을 누르면 같이 재생
    var ytId = null, ytTitle = '';
    $('ytBox').classList.add('hidden');
    $('ytFrame').src = 'about:blank';
    function ytCommand(func) {
      if (!ytId) return;
      try { $('ytFrame').contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: [] }), '*'); } catch (e) {}
    }
    $('ytLoad').onclick = function () {
      var m = /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/.exec($('ytUrl').value.trim());
      if (!m) { alert('유튜브 링크를 확인해 주세요.\n(유튜브 앱에서 공유 → 링크 복사 후 붙여넣기)'); return; }
      ytId = m[1];
      $('ytFrame').src = 'https://www.youtube.com/embed/' + ytId + '?playsinline=1&enablejsapi=1&rel=0&modestbranding=1';
      $('ytBox').classList.remove('hidden');
      $('ytUrl').blur();
      fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + ytId))
        .then(function (r) { return r.json(); }).then(function (d) { ytTitle = (d.title || '').slice(0, 20); }).catch(function () {});
    };
    // 아이패드는 자기 스피커 소리를 마이크에서 지워 버려서, 같은 기기에서 튼 영상은 못 듣는다
    $('ytRow').style.display = isIOS ? 'none' : '';
    $('recTip').innerHTML = isIOS
      ? '🔴을 누르고 피아노를 치거나, <b>휴대폰·TV로</b> 연주 영상을 틀어 아이패드 가까이 두세요.<br>지금은 소리를 <b>그대로 녹음만</b> 해요. 계이름은 다음 단계에서 바꿔요.'
      : '🔴을 누르고 피아노를 치거나 연주 영상을 틀어 주세요. 소리를 <b>그대로 녹음만</b> 해요.';

    function setBtn() {
      $('recBtn').classList.toggle('on', recording);
      $('recBtn').innerHTML = recording ? '⏹<br><b>녹음 끝</b>' : '🔴<br><b>녹음 시작</b>';
    }
    function stopPlayback() { playGen++; Sound.stopRaw(); Sound.allOff(); }

    // ① 녹음
    function reset1() {
      stopPlayback();
      rec = []; lastCap = null; savedNotes = null;
      $('recTime').textContent = '0:00';
      $('recCount').textContent = Sound.micActive() ? '' : '⚠️ 마이크가 꺼져 있어요 (녹음을 누르면 켜요)';
      $('recAfter').classList.add('hidden');
      setBtn(); step(1);
    }
    $('recBtn').onclick = function () {
      if (recording) { stopRecording(); return; }
      if (!Sound.micActive()) { settings.mic = true; saveSettings(); startMicIfNeeded(); }
      stopPlayback();
      rec = []; lastCap = null;
      $('recAfter').classList.add('hidden');
      Sound.setRecordMode(true);
      Sound.startCapture();
      recording = true; startedAt = nowSec(); setBtn();
      $('recCount').textContent = '🔴 소리를 그대로 녹음하는 중…';
      ytCommand('playVideo');
    };
    function stopRecording() {
      recording = false; setBtn();
      ytCommand('pauseVideo');
      Sound.setRecordMode(false);
      lastCap = Sound.stopCapture();
      var secs = Math.round(nowSec() - startedAt);
      $('recCount').textContent = '✅ ' + secs + '초 녹음했어요. 들어보고 계이름으로 바꿔요!';
      $('recRaw').style.display = lastCap && lastCap.samples.length > lastCap.sr ? '' : 'none';
      $('recAfter').classList.remove('hidden');
    }
    $('recRaw').onclick = $('recRaw2').onclick = function () { stopPlayback(); if (lastCap) Sound.playRaw(lastCap.samples, lastCap.sr); };
    $('recAgain').onclick = reset1;
    $('recBack').onclick = reset1;

    // ② 계이름으로 바꾸기
    var sens = Store.get('recSens', 0.5);
    $('recSens').value = sens;
    $('recSens').oninput = function () { sens = +this.value; Store.set('recSens', sens); };
    function convert() {
      stopPlayback();
      var touches = rec.filter(function (n) { return n.source === 'touch'; });
      var useAudio = lastCap && lastCap.samples.length > lastCap.sr && touches.length < 4;
      $('recSensRow').style.display = useAudio ? '' : 'none';
      step(2);
      $('recResult').textContent = '🔍 녹음을 자세히 분석하는 중… 잠깐만요';
      setTimeout(function () {
        var list;
        if (useAudio) {
          var notes = [];
          try { notes = transcribeRecording(lastCap.samples, lastCap.sr, null, sens); } catch (e) { notes = []; }
          list = notes.map(function (n) { return { midi: n.midi, t: n.t }; });
        } else {
          list = touches;
        }
        if (list.length < 4) {
          savedNotes = null;
          $('recResult').textContent = '😢 음을 거의 못 찾았어요. "더 많이 찾기" 쪽으로 옮기고 다시 바꾸거나, 다시 녹음해 주세요';
          drawStaff($('recStaff'), [], null, settings.letters);
          return;
        }
        savedNotes = cleanRecording(list);
        $('recResult').textContent = '🎵 음 ' + savedNotes.length + '개를 찾았어요! 원래 녹음과 비교해서 들어보세요';
        drawStaff($('recStaff'), savedNotes.slice(0, 14).map(function (n) { return n[0]; }), null, settings.letters);
        if (!$('recName').value) $('recName').value = ytTitle || '내가 만든 노래 ' + (imported.filter(function (x) { return x.id.indexOf('rec-') === 0; }).length + 1);
      }, 60);
    }
    $('recConvert').onclick = convert;
    $('recReanalyze').onclick = convert;
    $('recPlay').onclick = function () {
      if (!savedNotes) return;
      stopPlayback();
      var gen = playGen;
      savedNotes.forEach(function (n) {
        setTimeout(function () { if (gen === playGen) Sound.noteOn(n[0], 0.8, n[2] * 0.9); }, n[1] * 1000);
      });
    };

    // ③ 저장 → 바로 게임·배우기
    $('recKeep').onclick = function () {
      if (!savedNotes) return;
      stopPlayback();
      var entry = { id: 'rec-' + Date.now(), title: $('recName').value.trim() || '내가 만든 노래', emoji: '🎙️',
                    bpm: 60, beatsPerBar: 4, notes: savedNotes };
      imported.push(entry);
      Store.set('imported', imported);
      savedSong = toSong(entry, true);
      $('recName').value = '';
      step(3);
    };
    $('recToGame').onclick = function () { if (savedSong) go('game', savedSong); };
    $('recToLearn').onclick = function () { if (savedSong) go('learn', savedSong); };
    $('recNew').onclick = reset1;

    leaveFn = function () {
      stopPlayback();
      if (recording) { recording = false; Sound.stopCapture(); }
      ytCommand('pauseVideo'); Sound.setRecordMode(false);
    };

    // 화면 건반으로 직접 쳐서 만들 때 (녹음 중에만 기록)
    noteHandler = function (midi, source, time) {
      if (!recording) return;
      rec.push({ midi: midi, t: time - startedAt - (source === 'mic' ? LATENCY.mic : 0), source: source });
    };
    frameFn = function () {
      $('recMeter').style.width = Math.round(Sound.micLevel() * 100) + '%';
      $('recNow').textContent = !Sound.micActive() ? '🎤 마이크 꺼짐' : '🎤 마이크 켜짐';
      if (recording) {
        var sec = Math.floor(nowSec() - startedAt);
        $('recTime').textContent = Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2);
        if (sec >= 180) stopRecording();   // 최대 3분
      }
      if ($('recKeys').style.display !== 'none') {
        kb.hints = {}; kb.flashes = {}; kb.pressed = pressed; kb.letters = settings.letters;
        kb.draw();
      }
    };
    reset1();
  };

  // 녹음한 음들을 곡으로 정리: 너무 붙어 있는 같은 음 합치기, 시작을 0으로, 길이는 다음 음까지
  function cleanRecording(rec) {
    var list = [];
    rec.forEach(function (n) {
      var last = list[list.length - 1];
      if (last && last.midi === n.midi && n.t - last.t < 0.08) return;
      list.push({ midi: n.midi, t: Math.max(0, n.t) });
    });
    var t0 = list[0].t;
    return list.map(function (n, i) {
      var start = Math.round((n.t - t0) * 20) / 20;
      var next = i + 1 < list.length ? list[i + 1].t - t0 : start + 1;
      return [n.midi, start, Math.max(0.15, Math.min(1.5, Math.round((next - start) * 20) / 20))];
    });
  }

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
      var sel = el('select', 'start-sel');
      STAGES.forEach(function (st, i) {
        var o = el('option', '', (i + 1) + '단계 ' + st.emoji + ' ' + st.name + '부터');
        o.value = i; if ((p.start || 0) === i) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', function () { p.start = +sel.value; Store.set('players', players); });
      row.appendChild(emo); row.appendChild(input); row.appendChild(sel);
      pe.appendChild(row);
    });
    pe.appendChild(el('p', 'hint', '동물을 누르면 바뀌어요.'));
    noteHandler = function () {};
    frameFn = function () {
      $('micStatus').textContent = Sound.micStatus();
      $('micMeter').style.width = Math.round(Sound.micLevel() * 100) + '%';
      var n = lastNote;
      $('micNote').textContent = n === null ? '-' : Music.fullName(n, settings.letters);
      $('micNote').style.color = n === null ? '' : Music.color(n);
      $('micLog').textContent = micLog.length ? micLog.map(function (m) { return Music.fullName(m, settings.letters); }).join(', ') : '(아직 없음)';
    };
  };

  $('micRestart').addEventListener('click', function () {
    settings.mic = true; saveSettings(); $('setMic').checked = true;
    Sound.stopMic(); Sound.unlock(); startMicIfNeeded();
  });
  $('setMic').addEventListener('change', function () { settings.mic = this.checked; saveSettings(); startMicIfNeeded(); });
  $('setSens').addEventListener('input', function () { settings.sens = +this.value; saveSettings(); Sound.setSensitivity(settings.sens); });
  $('setSpeech').addEventListener('change', function () { settings.speech = this.checked; saveSettings(); Sound.setSpeechFilter(settings.speech); });
  $('setDrums').addEventListener('change', function () { settings.drums = this.checked; saveSettings(); });
  $('setGuide').addEventListener('change', function () { settings.guide = this.checked; saveSettings(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-letters]'), function (b) {
    b.addEventListener('click', function () { settings.letters = b.getAttribute('data-letters') === '1'; saveSettings(); screens.settings(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
    b.addEventListener('click', function () { go(b.getAttribute('data-go')); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () { go('songs', b.getAttribute('data-mode')); });
  });

  $('pwBtn').addEventListener('click', submitPassword);
  $('pwInput').addEventListener('keydown', function (e) { if (e.keyCode === 13) submitPassword(); });
  var unlocked = !!Store.get('familyPassword', null);
  $(unlocked ? 'startBox' : 'pwBox').classList.remove('hidden');
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

  loadFamilySongs();
  requestAnimationFrame(loop);
})();
