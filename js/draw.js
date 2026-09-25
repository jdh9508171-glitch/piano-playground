// 건반과 오선 그리기 (canvas)
'use strict';

function setupCanvas(canvas, maxRatio) {
  var ratio = Math.min(window.devicePixelRatio || 1, maxRatio || 2);
  var w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  var ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx: ctx, w: w, h: h };
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexAlpha(hex, a) {
  var n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
}

// 건반 위치 계산 (떨어지는 음표와 건반이 같은 계산을 쓴다)
function KeyboardLayout(low, high, width) {
  this.low = low; this.high = high; this.width = width;
  this.white = []; this.black = [];
  for (var m = low; m <= high; m++) (Music.isBlack(m) ? this.black : this.white).push(m);
  this.ww = width / this.white.length;
  this.bw = this.ww * 0.6;
}
KeyboardLayout.prototype.frame = function (m) {
  if (Music.isBlack(m)) {
    var i = this.white.indexOf(m - 1);
    return { x: (i + 1) * this.ww - this.bw / 2, w: this.bw };
  }
  return { x: this.white.indexOf(m) * this.ww, w: this.ww };
};
KeyboardLayout.prototype.hit = function (x, y, h) {
  if (y < h * 0.6) {
    for (var i = 0; i < this.black.length; i++) {
      var f = this.frame(this.black[i]);
      if (x >= f.x && x <= f.x + f.w) return this.black[i];
    }
  }
  var idx = Math.floor(x / this.ww);
  return this.white[Math.max(0, Math.min(this.white.length - 1, idx))];
};

// 터치 건반. onPress/onRelease(midi) 콜백, state = {hints:{}, flashes:{}, pressed:{}}
function Keyboard(canvas, onPress, onRelease) {
  this.canvas = canvas;
  this.low = 60; this.high = 72;
  this.letters = false;
  this.hints = {}; this.flashes = {}; this.pressed = {};
  this.touches = {};
  this.sig = '';
  var self = this;

  function pos(t) {
    var r = canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top, h: r.height, w: r.width };
  }
  function keyAt(t) {
    var p = pos(t);
    return new KeyboardLayout(self.low, self.high, p.w).hit(p.x, p.y, p.h);
  }
  function down(id, t) {
    var m = keyAt(t);
    self.touches[id] = m;
    onPress(m);
  }
  function move(id, t) {
    if (self.touches[id] === undefined) return;
    var m = keyAt(t);
    if (m !== self.touches[id]) { onRelease(self.touches[id]); self.touches[id] = m; onPress(m); }
  }
  function up(id) {
    if (self.touches[id] === undefined) return;
    onRelease(self.touches[id]);
    delete self.touches[id];
  }
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) down(e.changedTouches[i].identifier, e.changedTouches[i]);
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) move(e.changedTouches[i].identifier, e.changedTouches[i]);
  }, { passive: false });
  var end = function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) up(e.changedTouches[i].identifier);
  };
  canvas.addEventListener('touchend', end, { passive: false });
  canvas.addEventListener('touchcancel', end, { passive: false });
  // 컴퓨터에서 시험할 때용 마우스
  var mouseDown = false;
  canvas.addEventListener('mousedown', function (e) { mouseDown = true; down('mouse', e); });
  canvas.addEventListener('mousemove', function (e) { if (mouseDown) move('mouse', e); });
  window.addEventListener('mouseup', function () { if (mouseDown) { mouseDown = false; up('mouse'); } });
}

Keyboard.prototype.releaseAll = function () {
  this.touches = {};
};

Keyboard.prototype.draw = function (force) {
  var sig = [this.low, this.high, this.letters, JSON.stringify(this.hints), JSON.stringify(this.flashes),
             Object.keys(this.pressed).join(), this.canvas.clientWidth, this.canvas.clientHeight].join('|');
  if (!force && sig === this.sig) return;
  this.sig = sig;
  var c = setupCanvas(this.canvas, 2), ctx = c.ctx, W = c.w, H = c.h;
  var L = new KeyboardLayout(this.low, this.high, W), self = this;
  ctx.fillStyle = '#1d1426';
  ctx.fillRect(0, 0, W, H);

  function fillFor(m, black) {
    if (self.flashes[m]) return self.flashes[m];
    if (self.pressed[m]) return Music.color(m);
    if (self.hints[m]) return hexAlpha(Music.color(m), black ? 0.85 : 0.45);
    return black ? '#221a2c' : '#ffffff';
  }

  L.white.forEach(function (m) {
    var f = L.frame(m), down = self.pressed[m];
    roundRect(ctx, f.x + 1.5, down ? 2 : 0, f.w - 3, H - 4, 8);
    ctx.fillStyle = fillFor(m, false);
    ctx.fill();
    if (self.hints[m]) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = Music.color(m);
      ctx.stroke();
    }
    var fs = Math.min(20, L.ww * 0.38);
    ctx.font = '800 ' + fs + 'px -apple-system, "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    var lit = self.pressed[m] || self.flashes[m];
    ctx.fillStyle = lit ? '#ffffff' : Music.color(m);
    ctx.fillText(Music.name(m, self.letters), f.x + f.w / 2, H - 14);
    // 낮은/높은 표시 (알파벳이면 옥타브 숫자)
    var small = self.letters ? String(Math.floor(m / 12) - 1) : Music.octaveWord(m);
    if (small) {
      ctx.font = '700 ' + Math.min(13, L.ww * 0.26) + 'px -apple-system, "Apple SD Gothic Neo", sans-serif';
      ctx.fillStyle = lit ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.4)';
      ctx.fillText(small, f.x + f.w / 2, H - 14 - fs - 2);
    }
    // 가운데 도 표시: 실제 피아노에서 같은 자리를 찾을 수 있게
    if (m === 60) {
      ctx.fillStyle = lit ? '#ffffff' : '#ff9533';
      ctx.font = '800 ' + Math.min(13, L.ww * 0.26) + 'px -apple-system, "Apple SD Gothic Neo", sans-serif';
      ctx.fillText('가운데', f.x + f.w / 2, H - 14 - fs - 2);
      ctx.beginPath(); ctx.arc(f.x + f.w / 2, H - 14 - fs - 22, 5, 0, Math.PI * 2); ctx.fill();
    }
  });
  L.black.forEach(function (m) {
    var f = L.frame(m);
    roundRect(ctx, f.x, -6, f.w, H * 0.6 + 6, 5);
    ctx.fillStyle = fillFor(m, true);
    ctx.fill();
    if (self.hints[m]) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  });
};

// 높은음자리표 오선에 음표를 그린다. current 위치의 음을 색으로 강조
function drawStaff(canvas, midis, current, letters) {
  var c = setupCanvas(canvas, 2), ctx = c.ctx, W = c.w, H = c.h;
  ctx.clearRect(0, 0, W, H);
  var gap = Math.min(14, H / 11);
  var bottom = H / 2 + 2 * gap - 12;   // 미(E4) 줄
  var left = 20;

  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 1.5;
  for (var i = 0; i < 5; i++) {
    var y = bottom - i * gap;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(W - 20, y); ctx.stroke();
  }
  ctx.fillStyle = '#000';
  ctx.font = (gap * 6.2) + 'px "Apple Symbols", "Bravura", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('𝄞', left + gap * 1.8, bottom - gap * 1.7);

  if (!midis.length) return;
  var startX = left + gap * 5;
  var spacing = Math.min((W - startX - 30) / midis.length, gap * 7);
  var e4 = Music.diatonicStep(64);

  midis.forEach(function (m, i) {
    var step = Music.diatonicStep(m) - e4;
    var x = startX + spacing * (i + 0.5);
    var y = bottom - step * gap / 2;
    var isCur = i === current, isPast = current !== null && current !== undefined && i < current;
    var col = isCur ? Music.color(m) : isPast ? 'rgba(128,128,128,0.4)' : '#000';

    if (isCur) {
      roundRect(ctx, x - spacing * 0.45, 4, spacing * 0.9, H - 8, 10);
      ctx.fillStyle = hexAlpha(Music.color(m), 0.15);
      ctx.fill();
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    var s;
    if (step <= -2) for (s = -2; s >= step; s -= 2) line(bottom - s * gap / 2);
    if (step >= 10) for (s = 10; s <= step; s += 2) line(bottom - s * gap / 2);
    function line(ly) { ctx.beginPath(); ctx.moveTo(x - gap * 1.1, ly); ctx.lineTo(x + gap * 1.1, ly); ctx.stroke(); }

    ctx.fillStyle = col;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.35); ctx.scale(1, 0.72);
    ctx.beginPath(); ctx.arc(0, 0, gap * 0.68, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (Music.isBlack(m)) {
      ctx.font = 'bold ' + (gap * 1.4) + 'px sans-serif';
      ctx.fillText('♯', x - gap * 1.5, y);
    }
    ctx.font = '800 ' + (isCur ? 20 : 15) + 'px -apple-system, "Apple SD Gothic Neo", sans-serif';
    ctx.fillStyle = isPast ? 'rgba(128,128,128,0.5)' : Music.color(m);
    var word = letters ? '' : Music.octaveWord(m);
    ctx.fillText(Music.name(m, letters), x, word ? H - 20 : H - 14);
    if (word) {
      ctx.font = '700 11px -apple-system, "Apple SD Gothic Neo", sans-serif';
      ctx.fillText(word, x, H - 6);
    }
  });
}
