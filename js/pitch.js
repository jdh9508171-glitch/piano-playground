// 마이크 소리에서 한 번에 한 음을 찾아내는 음높이 인식기 (YIN 알고리즘)
// 입력을 절반 속도로 줄여(약 22kHz) 구형 아이패드에서도 가볍게 돌아가게 했다.
'use strict';

function PitchDetector(sampleRate) {
  this.sensitivity = 0.5;   // 0(둔감) ~ 1(민감)
  this.onNote = null;       // function(midi, isOn)
  this.level = 0;           // 0~1, 설정 화면의 소리 크기 막대
  this.configure(sampleRate);
}

PitchDetector.prototype.configure = function (sampleRate) {
  this.sr = sampleRate / 2;
  this.window = 1024;
  this.hop = 512;
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
};

PitchDetector.prototype.process = function (input) {
  var i = 0, n = input.length;
  if (this.carry !== null && n > 0) { this.push((this.carry + input[0]) / 2); this.carry = null; i = 1; }
  for (; i + 1 < n; i += 2) this.push((input[i] + input[i + 1]) / 2);
  if (i < n) this.carry = input[i];
};

PitchDetector.prototype.push = function (v) {
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
  var W = this.window, H = this.hop;
  var rms = rmsOf(x, 0, W);
  var db = 20 * Math.log(Math.max(rms, 1e-9)) / Math.LN10;
  this.level = Math.max(0, Math.min(1, (db + 70) / 60));
  var threshold = -30 - this.sensitivity * 30;   // -30dB ~ -60dB

  // 새로 들어온 구간이 바로 앞 구간보다 확 커지면 건반을 새로 친 것
  var oldR = rmsOf(x, W - 2 * H, H), newR = rmsOf(x, W - H, H);
  var oldHF = highFreqOf(x, W - 2 * H, H), newHF = highFreqOf(x, W - H, H);
  this.framesSinceEmit++;
  var attack = newR > oldR * 1.6 || newHF > oldHF * 1.8;
  if (attack && db > threshold && this.framesSinceEmit > 3) {
    // 이전 음의 잔향이 섞여 있으니 음높이를 처음부터 다시 확인
    this.onsetPending = true;
    this.candidate = null;
    this.stable = 0;
  }

  var p = db > threshold ? this.yin(x) : null;
  if (!p || p.confidence < 0.75) {
    if (db < threshold - 6 && this.current !== null) {
      this.emit(this.current, false);
      this.current = null;
    }
    this.candidate = null;
    this.stable = 0;
    return;
  }

  var midi = Math.round(69 + 12 * Math.log(p.freq / 440) / Math.LN2);
  if (midi < 36 || midi > 96) return;
  // 두 음이 겹칠 때 생기는 가짜 저음(바로 전 음보다 한 옥타브 이상 아래) 무시
  if (this.lastEmitted !== null && midi <= this.lastEmitted - 12 && this.framesSinceEmit < 12) return;

  if (midi === this.candidate) this.stable++;
  else { this.candidate = midi; this.stable = 1; }

  if (this.stable >= 2 && (midi !== this.current || this.onsetPending)) {
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
