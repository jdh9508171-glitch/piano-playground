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

PitchDetector.prototype.push = function (v) {
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
  this.prevRms = rms;
  if (attack && db > threshold && this.framesSinceEmit > this.fps * 0.06) {
    // 이전 음의 잔향이 섞여 있으니 음높이를 처음부터 다시 확인
    this.onsetPending = true;
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
