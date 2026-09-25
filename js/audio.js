// 소리 내기(피아노·드럼)와 마이크 입력
'use strict';

var Sound = (function () {
  var ctx = null, master = null, mellowWave = null, brightWave = null, noiseBuf = null;
  var voices = {};            // midi → [voice]
  var lastPlayed = {};        // midi → 시각(초). 마이크가 앱 자신의 소리를 다시 듣지 않게
  var mic = { stream: null, source: null, proc: null, sink: null, detector: null };

  function now() { return performance.now() / 1000; }

  function makeWave(amps) {
    var real = new Float32Array(amps.length + 1), imag = new Float32Array(amps.length + 1);
    for (var i = 0; i < amps.length; i++) imag[i + 1] = amps[i];
    return ctx.createPeriodicWave(real, imag);
  }

  // 사용자가 화면을 처음 누를 때 호출해야 소리가 난다 (iOS 규칙)
  function unlock() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      var comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      mellowWave = makeWave([1, 0.3, 0.1, 0.04]);
      var br = [];
      for (var h = 1; h <= 12; h++) br.push(1 / Math.pow(h, 1.2));
      brightWave = makeWave(br);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    // 무음 한 번 재생 (iOS 잠금 해제용)
    var s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
  }

  function freq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function noteOn(midi, velocity, duration) {
    if (!ctx) return;
    velocity = velocity || 0.8;
    lastPlayed[midi] = now();
    var t = ctx.currentTime;
    var decay = Math.min(Math.max(3 * Math.pow(2, -(midi - 48) / 18), 0.5), 4);
    var out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(velocity * 0.5, t + 0.005);
    out.gain.setTargetAtTime(0, t + 0.005, decay / 2.5);
    out.connect(master);

    var o1 = ctx.createOscillator();
    o1.setPeriodicWave(mellowWave);
    o1.frequency.value = freq(midi);
    o1.connect(out);

    var o2 = ctx.createOscillator();
    o2.setPeriodicWave(brightWave);
    o2.frequency.value = freq(midi);
    var bg = ctx.createGain();
    bg.gain.setValueAtTime(0.8, t);
    bg.gain.setTargetAtTime(0, t, 0.12);
    o2.connect(bg);
    bg.connect(out);

    o1.start(t); o2.start(t);
    var v = { out: out, oscs: [o1, o2], released: false };
    var stopAt = t + decay * 3;
    o1.stop(stopAt); o2.stop(stopAt);
    (voices[midi] = voices[midi] || []).push(v);
    o1.onended = function () {
      var arr = voices[midi] || [];
      var i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1);
    };
    if (duration) release(v, t + duration);
  }

  function release(v, at) {
    if (v.released) return;
    v.released = true;
    at = Math.max(at, ctx.currentTime);
    v.out.gain.cancelScheduledValues(at);
    v.out.gain.setTargetAtTime(0, at, 0.05);
    v.oscs.forEach(function (o) { try { o.stop(at + 0.4); } catch (e) {} });
  }

  function noteOff(midi) {
    if (!ctx) return;
    (voices[midi] || []).forEach(function (v) { release(v, ctx.currentTime); });
  }

  function allOff() {
    if (!ctx) return;
    Object.keys(voices).forEach(function (m) { noteOff(+m); });
  }

  // 카운트다운 딸깍
  function click(accent) {
    if (!ctx) return;
    var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(accent ? 0.5 : 0.3, t);
    g.gain.setTargetAtTime(0, t, 0.02);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.15);
  }

  // 드럼: 음정이 뚜렷하지 않아 마이크 인식을 방해하지 않는다
  function drum(kick) {
    if (!ctx) return;
    var t = ctx.currentTime, g = ctx.createGain();
    g.connect(master);
    if (kick) {
      var o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.setTargetAtTime(0, t, 0.08);
      o.connect(g); o.start(t); o.stop(t + 0.4);
    } else {
      var n = ctx.createBufferSource(), hp = ctx.createBiquadFilter();
      n.buffer = noiseBuf;
      hp.type = 'highpass'; hp.frequency.value = 6000;
      g.gain.setValueAtTime(0.25, t);
      g.gain.setTargetAtTime(0, t, 0.025);
      n.connect(hp); hp.connect(g); n.start(t); n.stop(t + 0.15);
    }
  }

  function recentlyPlayed(midi, within) {
    return lastPlayed[midi] !== undefined && now() - lastPlayed[midi] < within;
  }

  // 마이크 켜기. 성공하면 true를 돌려주는 Promise
  function startMic(onNote, sensitivity) {
    if (!ctx) unlock();
    if (mic.stream) { mic.detector.onNote = onNote; return Promise.resolve(true); }
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return Promise.resolve(false);
    return md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(function (stream) {
        mic.stream = stream;
        mic.source = ctx.createMediaStreamSource(stream);
        mic.proc = ctx.createScriptProcessor(1024, 1, 1);
        mic.sink = ctx.createGain();
        mic.sink.gain.value = 0;
        mic.detector = new PitchDetector(ctx.sampleRate);
        mic.detector.sensitivity = sensitivity;
        mic.detector.onNote = onNote;
        mic.proc.onaudioprocess = function (e) { mic.detector.process(e.inputBuffer.getChannelData(0)); };
        mic.source.connect(mic.proc);
        mic.proc.connect(mic.sink);
        mic.sink.connect(ctx.destination);   // 사파리는 출력에 연결해야 처리 함수가 불린다
        if (ctx.state === 'suspended') ctx.resume();
        return true;
      })
      .catch(function () { return false; });
  }

  function stopMic() {
    if (!mic.stream) return;
    mic.stream.getTracks().forEach(function (t) { t.stop(); });
    mic.source.disconnect(); mic.proc.disconnect(); mic.sink.disconnect();
    mic.proc.onaudioprocess = null;
    mic.stream = null;
  }

  function micActive() { return !!mic.stream; }
  function micLevel() { return mic.detector && mic.stream ? mic.detector.level : 0; }
  function setSensitivity(v) { if (mic.detector) mic.detector.sensitivity = v; }

  return {
    unlock: unlock, noteOn: noteOn, noteOff: noteOff, allOff: allOff, click: click, drum: drum,
    recentlyPlayed: recentlyPlayed, startMic: startMic, stopMic: stopMic, micActive: micActive,
    micLevel: micLevel, setSensitivity: setSensitivity,
    isUnlocked: function () { return !!ctx; }
  };
})();
