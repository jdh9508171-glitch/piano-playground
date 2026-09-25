// 마이크 소리에서 한 번에 한 음을 찾아내는 음높이 인식기 (YIN 알고리즘)
// 입력을 절반 속도로 줄여(약 22kHz) 구형 아이패드에서도 가볍게 돌아가게 했다.
'use strict';

function PitchDetector(sampleRate) {
  this.sensitivity = 0.5;   // 0(둔감) ~ 1(민감)
  this.speechFilter = true; // 말소리 거르기
  this.maxDrift = 0.07;     // 음높이 흔들림 허용치 (반음 단위)
  this.need = 3;            // 음높이가 몇 번 연속 같아야 인정하는지
  this.recordMode = false;  // 녹음(노래 만들기): 계속 나오는 음악도 받아 적도록 더 민감하게
  this.expected = null;     // 지금 쳐야 할 음들 {midi: true}. 이 음들은 조금 더 너그럽게 인정
  this.onNote = null;       // function(midi, isOn)
  this.level = 0;           // 0~1, 설정 화면의 소리 크기 막대
  this.configure(sampleRate);
}

PitchDetector.prototype.configure = function (sampleRate) {
  this.sr = sampleRate / 2;
  this.window = 1024;
  this.hop = 512;                       // 약 23ms마다 분석
  this.fps = this.sr / this.hop;
  this.buf = new Float32Array(8192);
  this.len = 0;
  this.tauMax = Math.min(this.window / 2 - 1, Math.floor(this.sr / 95));
  this.tauMin = Math.max(2, Math.floor(this.sr / 1400));
  this.diff = new Float32Array(this.tauMax + 1);
  this.cmnd = new Float32Array(this.tauMax + 1);
  this.current = null;
  this.candidate = null;
  this.stable = 0;
  this.onsetPending = false;
  this.framesSinceEmit = 100;
  this.lastEmitted = null;
  this.carry = null;
  this.onsetAge = 100;
  // 고역 통과 필터 계수 (200Hz, Q=0.7)
  var w0 = 2 * Math.PI * 200 / this.sr, al = Math.sin(w0) / (2 * 0.7), c = Math.cos(w0), a0 = 1 + al;
  this.hp = { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: -2 * c / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
  this.history = [];
  this.floor = -90;
  this.prevRms = 0;
};

PitchDetector.prototype.process = function (input) {
  var i = 0, n = input.length;
  if (this.carry !== null && n > 0) { this.push((this.carry + input[0]) / 2); this.carry = null; i = 1; }
  for (; i + 1 < n; i += 2) this.push((input[i] + input[i + 1]) / 2);
  if (i < n) this.carry = input[i];
};

// 녹음 저장: 끝난 뒤 전체를 천천히 다시 분석하기 위해 (약 22kHz로 줄인 소리)
PitchDetector.prototype.startCapture = function () { this.cap = []; this.capChunk = new Float32Array(8192); this.capPos = 0; };
PitchDetector.prototype.stopCapture = function () {
  if (!this.cap) return null;
  var total = this.cap.length * 8192 + this.capPos, out = new Float32Array(total), o = 0;
  this.cap.forEach(function (c) { out.set(c, o); o += c.length; });
  out.set(this.capChunk.subarray(0, this.capPos), o);
  this.cap = null;
  return out;
};

PitchDetector.prototype.push = function (v) {
  if (this.cap) {
    this.capChunk[this.capPos++] = v;
    if (this.capPos === 8192) { this.cap.push(this.capChunk); this.capChunk = new Float32Array(8192); this.capPos = 0; }
  }
  if (this.recordMode) {
    // 녹음 모드: 베이스·반주의 낮은 소리(약 200Hz 아래)를 깎아서 멜로디가 잘 들리게 (2차 고역 통과 필터)
    var f = this.hp;
    var y = f.b0 * v + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
    f.x2 = f.x1; f.x1 = v; f.y2 = f.y1; f.y1 = y;
    v = y;
  }
  this.buf[this.len++] = v;
  if (this.len >= this.window) {
    this.analyze(this.buf);
    this.buf.copyWithin(0, this.hop, this.len);
    this.len -= this.hop;
  }
};

function rmsOf(x, start, n) {
  var s = 0;
  for (var i = start; i < start + n; i++) s += x[i] * x[i];
  return Math.sqrt(s / n);
}

// 이웃 샘플 차이의 크기 = 고음 성분(건반 치는 순간의 '딱' 소리)
function highFreqOf(x, start, n) {
  var s = 0;
  for (var i = start; i < start + n - 1; i++) { var d = x[i + 1] - x[i]; s += d * d; }
  return Math.sqrt(s / (n - 1));
}

PitchDetector.prototype.emit = function (midi, on) {
  if (this.onNote) this.onNote(midi, on);
};

PitchDetector.prototype.analyze = function (x) {
  var W = this.window, H = this.hop, rec = this.recordMode, strict = this.speechFilter && !rec;
  var rms = rmsOf(x, 0, W);
  var db = 20 * Math.log(Math.max(rms, 1e-9)) / Math.LN10;
  this.level = Math.max(0, Math.min(1, (db + 70) / 60));

  // 주변 소음 크기를 천천히 따라가서, 그보다 충분히 큰 소리만 본다 (TV·선풍기 소리 무시)
  // (음이 울리는 중에는 올리지 않고, 아무리 올라가도 -45dB까지만)
  if (db < this.floor) this.floor = db;
  else if (this.current === null) this.floor = Math.min(this.floor + 1 / this.fps, db, -45);
  var threshold = Math.max(-30 - this.sensitivity * 30, this.floor + 10);   // -30dB ~ -60dB
  // 녹음 중에는 영상 소리처럼 계속 이어지는 음악을 '주변 소음'으로 오해하지 않도록 바닥 소음을 쓰지 않고 더 작은 소리까지 본다
  if (rec) threshold = -42 - this.sensitivity * 25;

  // 새로 들어온 구간이 바로 앞 구간보다 확 커지면 건반을 새로 친 것
  var oldR = rmsOf(x, W - 2 * H, H), newR = rmsOf(x, W - H, H);
  var oldHF = highFreqOf(x, W - 2 * H, H), newHF = highFreqOf(x, W - H, H);
  this.framesSinceEmit++;
  this.onsetAge++;
  // (조용하다가 소리가 나기 시작한 것도 건반을 친 것으로 본다)
  var attack = newR > oldR * 1.6 || newHF > oldHF * 1.8 || rms > this.prevRms * 2;
  var strength = Math.max(newR / (oldR + 1e-9), rms / (this.prevRms + 1e-9));
  this.prevRms = rms;
  if (attack && db > threshold && this.framesSinceEmit > this.fps * 0.06) {
    // 이전 음의 잔향이 섞여 있으니 음높이를 처음부터 다시 확인
    this.onsetPending = true;
    this.onsetStrength = strength;
    this.onsetAge = 0;
    this.candidate = null;
    this.stable = 0;
  }
  // 건반을 친 뒤 한참 지나도 음이 안 정해지면 (말소리 등) 없던 일로
  if (this.onsetPending && this.onsetAge > this.fps * 0.25) this.onsetPending = false;

  var p = db > threshold ? this.yin(x) : null;
  if (!p || p.confidence < (strict ? 0.85 : rec ? 0.6 : 0.75)) {
    if (db < threshold - 6 && this.current !== null) {
      this.emit(this.current, false);
      this.current = null;
    }
    this.candidate = null;
    this.stable = 0;
    return;
  }

  var exact = 69 + 12 * Math.log(p.freq / 440) / Math.LN2;
  var midi = Math.round(exact);
  if (midi < 36 || midi > 96) return;
  // 두 음이 겹칠 때 생기는 가짜 저음(바로 전 음보다 한 옥타브 이상 아래) 무시
  if (this.lastEmitted !== null && midi <= this.lastEmitted - 12 && this.framesSinceEmit < this.fps * 0.28) return;

  if (strict && Math.abs(exact - midi) > 0.3) {
    // 말소리 거르기: 피아노 소리는 건반 음에 딱 맞는다 (30센트 이내)
    this.candidate = null; this.stable = 0; return;
  }

  if (midi === this.candidate) { this.stable++; this.history.push(exact); }
  else { this.candidate = midi; this.stable = 1; this.history = [exact]; }
  if (this.history.length > this.need) this.history.shift();

  var isExpected = !!(this.expected && (this.expected[midi] || this.expected[midi + 12] || this.expected[midi - 12]));
  var ready;
  if (strict) {
    // 말소리는 음높이가 계속 미끄러지고, 피아노는 거의 그대로다: 최근 3번의 음높이 차이가 아주 작아야 함
    var hi = Math.max.apply(null, this.history), lo = Math.min.apply(null, this.history);
    ready = this.stable >= this.need && hi - lo < (isExpected ? 0.15 : this.maxDrift);
  } else {
    ready = this.stable >= 2;
  }
  // 말소리 거르기 중에는 '건반을 친 순간'이 있어야만 새 음으로 인정
  // (단, 지금 쳐야 할 음으로 바뀐 거라면 빠르게 이어 친 것으로 보고 바로 인정)
  var isNew = strict ? (this.onsetPending || (midi !== this.current && isExpected)) : (midi !== this.current || this.onsetPending);
  // 울리고 있는 같은 음을 '다시 친 것'으로 보려면 소리가 확실히(약 2배) 커져야 한다 (울림의 출렁임 무시)
  if (isNew && midi === this.current && (this.onsetStrength || 0) < 1.9) isNew = false;
  if (ready && isNew) {
    if (this.current !== null) this.emit(this.current, false);
    this.current = midi;
    this.onsetPending = false;
    this.framesSinceEmit = 0;
    this.lastEmitted = midi;
    this.emit(midi, true);
  }
};

PitchDetector.prototype.yin = function (x) {
  var w = this.window / 2, tauMin = this.tauMin, tauMax = this.tauMax;
  // 녹음 모드에서는 낮은 도(약 180Hz)보다 낮은 음은 반주로 보고 찾지 않음
  if (this.recordMode) tauMax = Math.min(tauMax, Math.floor(this.sr / 180));
  var diff = this.diff, cmnd = this.cmnd, tau, j;
  for (tau = 1; tau <= tauMax; tau++) {
    var s = 0;
    for (j = 0; j < w; j++) { var d = x[j] - x[j + tau]; s += d * d; }
    diff[tau] = s;
  }
  var running = 0;
  for (tau = 1; tau <= tauMax; tau++) {
    running += diff[tau];
    cmnd[tau] = running > 0 ? diff[tau] * tau / running : 1;
  }
  var found = -1;
  for (tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < 0.2) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      found = tau;
      break;
    }
  }
  if (found < 0) return null;

  // 한 옥타브 낮게 잘못 잡는 것 방지
  var half = Math.floor(found / 2);
  if (half >= tauMin) {
    var best = half;
    for (var t = Math.max(tauMin, half - 2); t <= Math.min(tauMax, half + 2); t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] < 0.35) found = best;
  }

  var better = found;
  if (found > 1 && found < tauMax) {
    var s0 = cmnd[found - 1], s1 = cmnd[found], s2 = cmnd[found + 1];
    var den = s0 + s2 - 2 * s1;
    if (Math.abs(den) > 1e-9) better += (s0 - s2) / (2 * den);
  }
  return { freq: this.sr / better, confidence: 1 - cmnd[found] };
};


// ───────── 녹음 전체 받아 적기 (녹음이 끝난 뒤, 시간 제약 없이 자세히) ─────────
// 방법: 소리를 주파수로 나눠(FFT) 보면서
//  ① 새로 커진 주파수 성분의 합(스펙트럼 변화)이 튀는 곳 = 건반을 친 순간
//  ② 그 순간 '새로 커진' 성분만 모아서 배음이 가장 잘 맞는 음 = 새로 친 음
//     (페달로 앞 음이 계속 울리고 반주가 깔려 있어도, 새로 친 음만 골라낼 수 있다)
function FFT(size) {
  this.n = size;
  this.rev = new Uint32Array(size);
  var bits = Math.round(Math.log(size) / Math.LN2), i;
  for (i = 0; i < size; i++) { var r = 0, x = i; for (var b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } this.rev[i] = r; }
  this.cos = new Float32Array(size / 2); this.sin = new Float32Array(size / 2);
  for (i = 0; i < size / 2; i++) { this.cos[i] = Math.cos(2 * Math.PI * i / size); this.sin[i] = -Math.sin(2 * Math.PI * i / size); }
  this.re = new Float32Array(size); this.im = new Float32Array(size);
  this.win = new Float32Array(size);
  for (i = 0; i < size; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1));
}
// x[off..off+n) 의 크기 스펙트럼(로그 압축)을 out[0..bins) 에
FFT.prototype.logMag = function (x, off, out, bins) {
  var n = this.n, re = this.re, im = this.im, i;
  for (i = 0; i < n; i++) { var j = this.rev[i]; re[j] = x[off + i] * this.win[i]; im[j] = 0; }
  for (var size = 2; size <= n; size <<= 1) {
    var halfSize = size >> 1, step = n / size;
    for (var st = 0; st < n; st += size) {
      for (var k = 0; k < halfSize; k++) {
        var a = st + k, b2 = a + halfSize, c = this.cos[k * step], s = this.sin[k * step];
        var tr = re[b2] * c - im[b2] * s, ti = re[b2] * s + im[b2] * c;
        re[b2] = re[a] - tr; im[b2] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  for (i = 0; i < bins; i++) out[i] = Math.log(1 + 1000 * Math.sqrt(re[i] * re[i] + im[i] * im[i]));
};
// 로그 압축 없이 실제 크기
FFT.prototype.mag = function (x, off, out, bins) {
  this.logMag(x, off, out, bins);
  for (var i = 0; i < bins; i++) out[i] = (Math.exp(out[i]) - 1) / 1000;
};

var WA = 1.0;
function transcribeRecording(x, sr, onProgress, sens) {
  // sens 0(덜 찾기) ~ 1(더 많이 찾기), 기본 0.5
  if (sens === undefined || sens === null) sens = 0.5;
  var N = 2048, H = 256, bins = Math.min(N / 2, Math.ceil(4500 * N / sr));
  var n = Math.max(0, Math.floor((x.length - N) / H));
  var fft = new FFT(N), prev = new Float32Array(bins), cur = new Float32Array(bins), i, k;
  var flux = new Float32Array(n), energy = new Float32Array(n), peak = 1e-9;
  var loBin = Math.floor(150 * N / sr);
  for (i = 0; i < n; i++) {
    fft.logMag(x, i * H, cur, bins);
    var f = 0, e = 0;
    for (k = loBin; k < bins; k++) { var d = cur[k] - prev[k]; if (d > 0) f += d; e += cur[k]; }
    flux[i] = i === 0 ? 0 : f; energy[i] = e / bins;
    if (energy[i] > peak) peak = energy[i];
    var t = prev; prev = cur; cur = t;
  }

  // ① 건반 친 순간: 주변 평균보다 확 튀는 스펙트럼 변화
  var onsets = [], lastOn = -100, refr = Math.round(0.09 * sr / H), win = Math.round(0.6 * sr / H);
  var gate = peak * (0.35 - 0.2 * sens);
  for (i = 2; i < n - 2; i++) {
    if (energy[i] < gate) continue;
    if (!(flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] >= flux[i - 2] && flux[i] >= flux[i + 2])) continue;
    var sum = 0, sq = 0, cnt = 0;
    for (k = Math.max(0, i - win); k < Math.min(n, i + win); k++) { sum += flux[k]; sq += flux[k] * flux[k]; cnt++; }
    var mean = sum / cnt, sd = Math.sqrt(Math.max(0, sq / cnt - mean * mean));
    if (flux[i] > mean + (1.8 - 1.2 * sens) * sd && flux[i] > mean * (1.9 - 0.6 * sens) && i - lastOn > refr) { onsets.push(i); lastOn = i; }
  }

  // ② 새로 친 음: 친 직후 - 치기 직전 스펙트럼에서 '커진 부분'의 배음 점수가 가장 높은 음
  var before = new Float32Array(bins), after = new Float32Array(bins), inc = new Float32Array(bins);
  function binVal(arr, freq) {
    var b = freq * N / sr;
    if (b >= bins - 1) return 0;
    var b0 = Math.floor(b);
    return Math.max(arr[b0], arr[b0 + 1], b0 > 0 ? arr[b0 - 1] * 0.5 : 0);
  }
  // 새로 커진 성분 점수 + 친 직후 소리 자체의 점수(같은 음을 다시 칠 때 대비)를 합쳐서 판단
  function salience(m) {
    var f0 = 440 * Math.pow(2, (m - 69) / 12), s = 0, a = 0;
    for (var h = 1; h <= 8; h++) { var w = 1 / Math.pow(h, 0.6); s += binVal(inc, f0 * h) * w; a += binVal(after, f0 * h) * w; }
    return s + WA * a;
  }
  var notes = [];
  onsets.forEach(function (o, idx) {
    fft.mag(x, Math.max(0, (o - 3) * H), before, bins);
    fft.mag(x, Math.min(x.length - N, (o + 3) * H), after, bins);
    for (k = 0; k < bins; k++) inc[k] = Math.max(0, after[k] - before[k]);
    var best = null, bestS = 0;
    for (var m = 48; m <= 96; m++) { var sc = salience(m); if (sc > bestS) { bestS = sc; best = m; } }
    if (best === null) return;
    // 한 옥타브 아래로 착각 방지: 한 옥타브 위 점수도 거의 같으면 위 음으로
    if (best + 12 <= 96 && salience(best + 12) > bestS * 0.8) best += 12;
    var t0 = (o * H + N / 2) / sr;
    notes.push({ midi: best, t: t0, dur: 0.3 });
    if (onProgress && idx % 20 === 0) onProgress(idx / onsets.length);
  });
  for (i = 0; i < notes.length; i++) {
    var nextT = i + 1 < notes.length ? notes[i + 1].t : notes[i].t + 1;
    notes[i].dur = Math.max(0.1, Math.min(1.5, nextT - notes[i].t));
  }
  return notes;
}
