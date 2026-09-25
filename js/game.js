// 리듬 게임 진행과 배우기 모드 진행 (화면과 분리된 로직)
'use strict';

function nowSec() { return performance.now() / 1000; }

// 마이크는 피아노 스피커 특성 때문에 한 옥타브 위/아래로 잡힐 때가 있어서, 같은 계이름이면 인정
function sameNote(expected, played, source) {
  if (expected === played) return true;
  return source === 'mic' && Math.abs(expected - played) === 12;
}

var LATENCY = { touch: 0.02, mic: 0.14 };   // 소리가 난 뒤 앱이 알아채기까지 걸리는 시간

// ───────────── 리듬 게임 ─────────────
function Game(song, speed, opts) {
  this.song = song;
  this.beat = 60 / song.bpm / speed;
  this.countIn = 4;
  this.guide = opts.guide;
  this.drums = opts.drums;
  this.perfectWindow = 0.10;
  this.goodWindow = 0.25;
  var last = song.notes[song.notes.length - 1];
  this.endTime = (last.beat + last.beats) * this.beat + 1.0;
  this.onJudge = null;    // function(text, cssClass)
  this.onFinish = null;
  this.reset();
}

// 준비 화면에서 빠르기를 바꿀 때
Game.prototype.setSpeed = function (speed) {
  this.beat = 60 / this.song.bpm / speed;
  var last = this.song.notes[this.song.notes.length - 1];
  this.endTime = (last.beat + last.beats) * this.beat + 1.0;
  this.reset();
};

Game.prototype.reset = function () {
  var spb = this.beat;
  this.notes = this.song.notes.map(function (n) {
    return { midi: n.midi, time: n.beat * spb, dur: n.beats * spb, state: 'pending', sounded: false, hitAt: null };
  });
  this.score = 0; this.combo = 0; this.maxCombo = 0;
  this.perfect = 0; this.good = 0; this.miss = 0;
  this.hints = {}; this.flashes = {}; this.flashUntil = {};
  this.nextBeat = -this.countIn;
  this.phase = 'ready';
  this.frozen = -this.countIn * spb;
};

Game.prototype.time = function () {
  return (this.phase === 'playing' || this.phase === 'preview') ? nowSec() - this.origin : this.frozen;
};

Game.prototype.start = function (preview) {
  this.reset();
  this.origin = nowSec() + this.countIn * this.beat;
  this.phase = preview ? 'preview' : 'playing';
};

Game.prototype.pause = function () {
  if (this.phase !== 'playing' && this.phase !== 'preview') return;
  this.frozen = this.time();
  this.resumeTo = this.phase;
  this.phase = 'paused';
  Sound.allOff();
};

Game.prototype.resume = function () {
  if (this.phase !== 'paused') return;
  this.origin = nowSec() - this.frozen;
  this.phase = this.resumeTo;
};

Game.prototype.stars = function () {
  var acc = (this.perfect + this.good * 0.7) / Math.max(this.notes.length, 1);
  return acc >= 0.9 ? 3 : acc >= 0.65 ? 2 : acc >= 0.3 ? 1 : 0;
};

Game.prototype.tick = function () {
  var now = nowSec(), self = this;
  Object.keys(this.flashUntil).forEach(function (m) {
    if (self.flashUntil[m] < now) { delete self.flashUntil[m]; delete self.flashes[m]; }
  });
  if (this.phase !== 'playing' && this.phase !== 'preview') return;
  var t = this.time(), preview = this.phase === 'preview';

  // 카운트다운 딸깍 + 드럼 박자
  while (this.nextBeat * this.beat <= t && t < this.endTime - 1) {
    var bar = this.song.beatsPerBar;
    var down = ((this.nextBeat % bar) + bar) % bar === 0;
    if (this.nextBeat < 0) Sound.click(this.nextBeat === -this.countIn);
    else if (this.drums) Sound.drum(down);
    this.nextBeat++;
  }

  var hints = {};
  var look = Math.max(this.beat, 0.45);
  for (var i = 0; i < this.notes.length; i++) {
    var n = this.notes[i];
    if (!n.sounded && n.time <= t) {
      n.sounded = true;
      if (preview || this.guide) Sound.noteOn(n.midi, preview ? 0.8 : 0.45, n.dur * 0.9);
    }
    if (!preview && n.state === 'pending' && t > n.time + this.goodWindow) {
      n.state = 'miss';
      this.miss++;
      this.combo = 0;
      if (this.onJudge) this.onJudge('앗!', 'miss');
    }
    if (preview) {
      if (n.time <= t && t < n.time + n.dur) hints[n.midi] = true;
    } else if (n.state === 'pending' && n.time - t < look && n.time - t > -this.goodWindow) {
      hints[n.midi] = true;
    }
  }
  this.hints = hints;

  if (t > this.endTime) {
    if (preview) { this.phase = 'ready'; this.reset(); }
    else {
      this.frozen = t;
      this.phase = 'finished';
      Sound.allOff();
      if (this.onFinish) this.onFinish();
    }
  }
};

Game.prototype.handle = function (midi, source, time) {
  if (this.phase !== 'playing') return;
  var t = time - this.origin - LATENCY[source];
  var best = -1, bestD = 1e9;
  for (var i = 0; i < this.notes.length; i++) {
    var n = this.notes[i];
    if (n.state !== 'pending' || !sameNote(n.midi, midi, source)) continue;
    var d = Math.abs(n.time - t);
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best < 0 || bestD > this.goodWindow) { this.flash(midi, '#ff4d4d'); return; }
  var perfect = bestD <= this.perfectWindow, note = this.notes[best];
  midi = note.midi;
  note.state = perfect ? 'perfect' : 'good';
  note.hitAt = this.time();
  this.combo++;
  this.maxCombo = Math.max(this.maxCombo, this.combo);
  if (perfect) this.perfect++; else this.good++;
  this.score += (perfect ? 100 : 60) + Math.min(this.combo, 50) * 2;
  if (this.onJudge) {
    if (perfect) this.onJudge(this.combo >= 5 ? '완벽해요! ' + this.combo + '콤보' : '완벽해요!', 'perfect');
    else this.onJudge('좋아요!', 'good');
  }
  this.flash(midi, '#3fd16b');
};

Game.prototype.flash = function (midi, color) {
  this.flashes[midi] = color;
  this.flashUntil[midi] = nowSec() + 0.25;
};

// 떨어지는 음표 그리기
Game.prototype.draw = function (canvas, letters) {
  var c = setupCanvas(canvas, 1.5), ctx = c.ctx, W = c.w, H = c.h;
  var t = this.time(), r = this.song.range;
  var L = new KeyboardLayout(r.low, r.high, W);
  var hitY = H - 6, pps = H / 2.4;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (var i = 1; i < L.white.length; i++) ctx.fillRect(i * L.ww, 0, 1, H);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, hitY - 3, W, 6);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (this.phase === 'ready') return;   // 준비 화면에서는 음표를 숨김
  for (var k = 0; k < this.notes.length; k++) {
    var n = this.notes[k], f = L.frame(n.midi), col = Music.color(n.midi);
    if (n.hitAt !== null) {
      var age = t - n.hitAt;
      if (age < 0.35) {
        var rad = 20 + age * 160;
        ctx.fillStyle = hexAlpha(col, 0.6 * (1 - age / 0.35));
        ctx.beginPath(); ctx.arc(f.x + f.w / 2, hitY, rad, 0, Math.PI * 2); ctx.fill();
      }
      continue;
    }
    var bottom = hitY - (n.time - t) * pps;
    var h = Math.max(n.dur * pps - 4, 26);
    if (bottom < 0 || bottom - h > H) continue;
    roundRect(ctx, f.x + 3, bottom - h, f.w - 6, h, 8);
    if (n.state === 'miss') {
      ctx.fillStyle = 'rgba(128,128,128,0.35)';
      ctx.fill();
    } else {
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '800 ' + Math.min(f.w * 0.4, 20) + 'px -apple-system, "Apple SD Gothic Neo", sans-serif';
      ctx.fillText(Music.name(n.midi, letters), f.x + f.w / 2, bottom - 14);
      var word = letters ? '' : Music.octaveWord(n.midi);
      if (word && h > 44) {
        ctx.font = '700 ' + Math.min(f.w * 0.24, 12) + 'px -apple-system, "Apple SD Gothic Neo", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(word, f.x + f.w / 2, bottom - 32);
      }
    }
  }

  if (t < 0 && (this.phase === 'playing' || this.phase === 'preview')) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '900 140px -apple-system, sans-serif';
    ctx.fillText(String(Math.ceil(-t / this.beat)), W / 2, H / 2);
  }
};

// ───────────── 배우기 ─────────────
function Lesson(song) {
  this.song = song;
  this.notes = song.notes;
  this.index = 0;
  this.mistakes = 0;
  this.demoIndex = null;
  this.demoGen = 0;
  this.flashes = {};
  this.speed = 1;
}

Lesson.prototype.finished = function () { return this.index >= this.notes.length; };
Lesson.prototype.target = function () { return this.finished() ? null : this.notes[this.index].midi; };

Lesson.prototype.stars = function () {
  var n = Math.max(this.notes.length, 1);
  if (this.mistakes <= Math.max(1, Math.floor(n / 20))) return 3;
  if (this.mistakes <= Math.floor(n / 5)) return 2;
  return 1;
};

// 맞으면 'right', 틀리면 'wrong', 무시하면 null
Lesson.prototype.handle = function (midi, source) {
  if (this.demoIndex !== null || this.finished()) return null;
  var self = this;
  var ok = sameNote(this.target(), midi, source);
  // 마이크로 곡 범위 밖의 음이 잡히면 말소리나 잡음일 가능성이 높으니 틀린 것으로 치지 않음
  if (!ok && source === 'mic' && (midi < this.song.range.low || midi > this.song.range.high)) return null;
  if (ok) midi = this.target();
  if (ok) this.index++; else this.mistakes++;
  this.flashes[midi] = ok ? '#3fd16b' : '#ff4d4d';
  setTimeout(function () { delete self.flashes[midi]; }, 300);
  return ok ? 'right' : 'wrong';
};

Lesson.prototype.restart = function () {
  this.stopDemo();
  this.index = 0;
  this.mistakes = 0;
};

// 곡 전체 또는 지금 위치부터 8음 들려주기
Lesson.prototype.playDemo = function (fromCurrent, onDone) {
  this.stopDemo();
  var self = this, gen = this.demoGen, spb = 60 / this.song.bpm / this.speed;
  var start = fromCurrent ? this.index : 0;
  var end = fromCurrent ? Math.min(this.notes.length, start + 8) : this.notes.length;
  if (start >= end) return;
  var base = this.notes[start].beat;
  this.demoIndex = start;
  for (var i = start; i < end; i++) {
    (function (i) {
      var n = self.notes[i];
      setTimeout(function () {
        if (self.demoGen !== gen) return;
        Sound.noteOn(n.midi, 0.8, n.beats * spb * 0.9);
        self.demoIndex = i;
      }, (0.3 + (n.beat - base) * spb) * 1000);
    })(i);
  }
  var last = this.notes[end - 1];
  setTimeout(function () {
    if (self.demoGen !== gen) return;
    self.demoIndex = null;
    if (onDone) onDone();
  }, (0.3 + (last.beat + last.beats - base) * spb) * 1000);
};

Lesson.prototype.stopDemo = function () {
  this.demoGen++;
  this.demoIndex = null;
  Sound.allOff();
};

// ───────── 계이름 퀴즈 / 건반 찾기 / 소리 듣고 찾기 ─────────
// type: 'read'(악보 보고 치기) 'find'(이름 보고 치기) 'ear'(듣고 찾기)
var QUIZ_LEVELS = [
  { name: '1단계', desc: '도~솔', notes: [60, 62, 64, 65, 67], low: 60, high: 72 },
  { name: '2단계', desc: '도~높은 도', notes: [60, 62, 64, 65, 67, 69, 71, 72], low: 60, high: 72 },
  { name: '3단계', desc: '낮은 솔~높은 솔', notes: [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79], low: 48, high: 84 },
  { name: '4단계', desc: '검은 건반까지', notes: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72], low: 60, high: 72 }
];

function Quiz(type, level) {
  this.type = type;
  this.level = level;
  this.info = QUIZ_LEVELS[level];
  this.total = 10;
  this.flashes = {};
  this.restart();
}

Quiz.prototype.restart = function () {
  this.index = 0;
  this.firstTry = 0;
  this.wrongNow = 0;
  this.started = nowSec();
  this.target = null;
  this.waiting = false;
  this.next();
};

Quiz.prototype.next = function () {
  var pool = this.info.notes, t;
  do { t = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && t === this.target);
  this.target = t;
  this.wrongNow = 0;
  this.waiting = false;
  if (this.type === 'ear') this.play();
};

Quiz.prototype.play = function () { Sound.noteOn(this.target, 0.9, 1.0); };
Quiz.prototype.finished = function () { return this.index >= this.total; };

Quiz.prototype.stars = function () {
  return this.firstTry >= 9 ? 3 : this.firstTry >= 7 ? 2 : this.firstTry >= 4 ? 1 : 0;
};

// 'right' | 'wrong' | 'almost'(옥타브만 다름) | null
Quiz.prototype.handle = function (midi, source) {
  if (this.waiting || this.finished()) return null;
  var self = this, t = this.target;
  var ok = midi === t;
  // 한 옥타브 안에서만 내는 문제는 마이크가 옥타브를 헷갈려도 인정
  if (!ok && source === 'mic' && Math.abs(midi - t) === 12 && this.level !== 2) ok = true;
  if (!ok && Math.abs(midi - t) === 12) {
    this.flashes[midi] = '#ffb020';
    setTimeout(function () { delete self.flashes[midi]; }, 300);
    return 'almost';
  }
  this.flashes[ok ? t : midi] = ok ? '#3fd16b' : '#ff4d4d';
  setTimeout(function () { delete self.flashes[ok ? t : midi]; }, 400);
  if (!ok) { this.wrongNow++; return 'wrong'; }
  if (this.wrongNow === 0) this.firstTry++;
  this.index++;
  this.waiting = true;
  if (!this.finished()) setTimeout(function () { self.next(); }, 700);
  return 'right';
};
