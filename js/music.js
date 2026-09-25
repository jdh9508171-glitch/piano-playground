// 음이름, 색, 곡 데이터, MIDI 파일 읽기
// iOS 12 사파리 호환을 위해 ?. ?? 같은 최신 문법은 쓰지 않는다.
'use strict';

var Music = (function () {
  var SOLFEGE = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
  var LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var DEGREE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  // 도=빨강, 레=주황, 미=노랑, 파=초록, 솔=하늘, 라=파랑, 시=보라
  var COLORS = ['#F24D4D', '#FF9433', '#F2C71A', '#4DC766', '#33B3E6', '#4D73F2', '#A666F2'];

  function name(midi, letters) { return (letters ? LETTERS : SOLFEGE)[midi % 12]; }
  // 가운데 도(C4)가 있는 옥타브 = '가운데', 그 아래 '낮은', 위 '높은'
  function octaveWord(midi) {
    var o = Math.floor(midi / 12) - 1;
    return o <= 2 ? '아주 낮은' : o === 3 ? '낮은' : o === 4 ? '' : o === 5 ? '높은' : '아주 높은';
  }
  // "높은 도", "솔", "낮은 라" (알파벳이면 "C5")
  function fullName(midi, letters) {
    if (letters) return name(midi, true) + (Math.floor(midi / 12) - 1);
    var w = octaveWord(midi);
    return (w ? w + ' ' : '') + name(midi);
  }
  function isBlack(midi) { return [1, 3, 6, 8, 10].indexOf(midi % 12) >= 0; }
  function color(midi) { return COLORS[DEGREE[midi % 12]]; }
  function diatonicStep(midi) { return (Math.floor(midi / 12) - 1) * 7 + DEGREE[midi % 12]; }

  // 받침에 따라 조사 고르기: 도"를"/솔"을"
  function particle(word, withBatchim, without) {
    var c = word.charCodeAt(word.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return word + without;
    return word + ((c - 0xAC00) % 28 !== 0 ? withBatchim : without);
  }

  function midiNumber(str) {
    var base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[str[0]];
    if (base === undefined) return null;
    var rest = str.slice(1);
    if (rest[0] === '#') { base += 1; rest = rest.slice(1); }
    else if (rest[0] === 'b') { base -= 1; rest = rest.slice(1); }
    var octave = parseInt(rest, 10);
    if (isNaN(octave)) return null;
    return (octave + 1) * 12 + base;
  }

  // "C4 D4:2 R:1 F#4:0.5" → [{midi, beat, beats}]  (콜론 뒤는 박자 수, 기본 1박, R은 쉼표)
  function parseMelody(text) {
    var beat = 0, notes = [];
    text.split(/[\s|]+/).forEach(function (tok) {
      if (!tok) return;
      var parts = tok.split(':');
      var len = parts.length > 1 ? parseFloat(parts[1]) : 1;
      if (parts[0] !== 'R') {
        var m = midiNumber(parts[0]);
        if (m !== null) notes.push({ midi: m, beat: beat, beats: len });
      }
      beat += len;
    });
    return notes;
  }

  // 주어진 음을 모두 담는 건반 범위 (도에서 시작해 도로 끝남)
  function rangeFor(notes) {
    var lo = 127, hi = 0;
    notes.forEach(function (n) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); });
    var low = Math.floor(lo / 12) * 12;
    var high = hi % 12 === 0 ? hi : (Math.floor(hi / 12) + 1) * 12;
    if (high - low < 12) high = low + 12;
    return { low: low, high: high };
  }

  function song(id, title, emoji, level, bpm, beatsPerBar, melody) {
    var notes = parseMelody(melody);
    return { id: id, title: title, emoji: emoji, level: level, bpm: bpm, beatsPerBar: beatsPerBar,
             notes: notes, range: rangeFor(notes) };
  }

  // 저작권이 끝난 동요·클래식 멜로디
  var BUILTIN = [
    song('scale', '도레미 계단', '🪜', 1, 80, 4,
      'C4 D4 E4 F4 G4 A4 B4 C5:2 R:2 C5 B4 A4 G4 F4 E4 D4 C4:2'),
    song('airplane', '떴다 떴다 비행기', '✈️', 1, 100, 4,
      'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 ' +
      'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 E4 D4 C4:4'),
    song('twinkle', '반짝반짝 작은 별', '⭐️', 1, 100, 4,
      'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 ' +
      'G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 ' +
      'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2'),
    song('butterfly', '나비야', '🦋', 2, 110, 4,
      'G4 E4 E4:2 F4 D4 D4:2 C4 D4 E4 F4 G4 G4 G4:2 ' +
      'G4 E4 E4:2 F4 D4 D4:2 C4 E4 G4 G4 E4 E4 E4:2 ' +
      'D4 D4 D4 D4 D4 E4 F4:2 E4 E4 E4 E4 E4 F4 G4:2 ' +
      'G4 E4 E4:2 F4 D4 D4:2 C4 E4 G4 G4 C4:4'),
    song('joy', '환희의 송가', '🎉', 2, 110, 4,
      'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 ' +
      'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2 ' +
      'D4 D4 E4 C4 D4 E4:0.5 F4:0.5 E4 C4 D4 E4:0.5 F4:0.5 E4 D4 C4 D4 G3:2 ' +
      'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2'),
    song('jingle', '징글벨', '🔔', 2, 120, 4,
      'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 ' +
      'F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 E4 D4 D4 E4 D4:2 G4:2 ' +
      'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 ' +
      'F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 G4 G4 F4 D4 C4:4'),
    song('birthday', '생일 축하합니다', '🎂', 3, 100, 3,
      'G4:0.75 G4:0.25 A4 G4 C5 B4:2 G4:0.75 G4:0.25 A4 G4 D5 C5:2 ' +
      'G4:0.75 G4:0.25 G5 E5 C5 B4 A4:2 F5:0.75 F5:0.25 E5 C5 D5 C5:3'),
    song('elise', '엘리제를 위하여', '🌹', 3, 70, 3,
      'E5:0.25 D#5:0.25 E5:0.25 D#5:0.25 E5:0.25 B4:0.25 D5:0.25 C5:0.25 A4:0.5 R:0.25 ' +
      'C4:0.25 E4:0.25 A4:0.25 B4:0.5 R:0.25 E4:0.25 G#4:0.25 B4:0.25 C5:0.5 R:0.25 ' +
      'E4:0.25 E5:0.25 D#5:0.25 E5:0.25 D#5:0.25 E5:0.25 B4:0.25 D5:0.25 C5:0.25 A4:0.5 R:0.25 ' +
      'C4:0.25 E4:0.25 A4:0.25 B4:0.5 R:0.25 E4:0.25 C5:0.25 B4:0.25 A4:1.5')
  ];

  // 표준 MIDI 파일에서 멜로디 한 줄 뽑기 (동시에 나는 음은 가장 높은 음만)
  // options.easyKey: 검은 건반이 가장 적은 조로 옮기기 (기본 켬)
  function parseMIDIFile(buffer, options) {
    options = options || {};
    var b = new Uint8Array(buffer), pos = 0;
    function u32() { var v = (b[pos] << 24 | b[pos + 1] << 16 | b[pos + 2] << 8 | b[pos + 3]) >>> 0; pos += 4; return v; }
    function u16() { var v = b[pos] << 8 | b[pos + 1]; pos += 2; return v; }
    function tag() { var s = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]); pos += 4; return s; }

    if (b.length < 14 || tag() !== 'MThd') return null;
    var hlen = u32(); u16(); var trackCount = u16(); var division = u16();
    if (division & 0x8000 || division === 0) return null;
    pos = 8 + hlen;

    var tempos = [], sigs = [], raw = [];
    for (var track = 0; track < trackCount && pos + 8 <= b.length; track++) {
      var t = tag(), len = u32(), end = Math.min(pos + len, b.length);
      if (t !== 'MTrk') { pos = end; continue; }
      var tick = 0, status = 0, open = {};
      var varLen = function () {
        var v = 0;
        while (pos < end) { var c = b[pos++]; v = (v << 7) | (c & 0x7F); if (!(c & 0x80)) break; }
        return v;
      };
      while (pos < end) {
        tick += varLen();
        if (pos >= end) break;
        if (b[pos] & 0x80) status = b[pos++];
        if (status === 0xFF) {
          var type = b[pos++], l = varLen();
          if (type === 0x51 && l === 3) tempos.push({ tick: tick, us: b[pos] << 16 | b[pos + 1] << 8 | b[pos + 2] });
          else if (type === 0x58 && l >= 2) sigs.push({ tick: tick, num: b[pos], den: Math.pow(2, b[pos + 1]) });
          pos += l; status = 0;
        } else if (status === 0xF0 || status === 0xF7) {
          pos += varLen(); status = 0;
        } else if (status >= 0x80) {
          var kind = status & 0xF0, ch = status & 0x0F;
          var need = (kind === 0xC0 || kind === 0xD0) ? 1 : 2;
          var d1 = b[pos], d2 = need > 1 ? b[pos + 1] : 0;
          pos += need;
          if (ch === 9) continue; // 드럼 채널
          var key = ch * 128 + d1;
          if (kind === 0x90 && d2 > 0) {
            if (open[key] !== undefined) raw[open[key]].end = tick;
            raw.push({ track: track * 16 + ch, midi: d1, start: tick, end: tick + division });
            open[key] = raw.length - 1;
          } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
            if (open[key] !== undefined) { raw[open[key]].end = tick; delete open[key]; }
          }
        } else {
          pos++; // 알 수 없는 바이트 건너뛰기
        }
      }
      pos = end;
    }
    if (!raw.length) return null;

    // 템포가 중간에 바뀌어도 정확하도록 틱을 초 단위로 바꾼다
    tempos.sort(function (a, c) { return a.tick - c.tick; });
    function seconds(tk) {
      var sec = 0, last = 0, us = 500000;
      for (var i = 0; i < tempos.length && tempos[i].tick <= tk; i++) {
        sec += (tempos[i].tick - last) / division * us / 1e6;
        last = tempos[i].tick; us = tempos[i].us;
      }
      return sec + (tk - last) / division * us / 1e6;
    }
    function tempoAt(tk) {
      var us = 500000;
      for (var i = 0; i < tempos.length && tempos[i].tick <= tk; i++) us = tempos[i].us;
      return 60000000 / us;
    }

    // 멜로디 트랙 고르기: 한 번에 한 음씩 나오는(화음이 적은) 트랙, 음이 높은 트랙일수록 멜로디일 가능성이 높다
    var tracks = {};
    raw.forEach(function (n) { (tracks[n.track] = tracks[n.track] || []).push(n); });
    var best = null, bestScore = -1;
    Object.keys(tracks).forEach(function (k) {
      var ns = tracks[k];
      var starts = {}; ns.forEach(function (n) { starts[n.start] = true; });
      var distinct = Object.keys(starts).length;
      var avg = ns.reduce(function (s, n) { return s + n.midi; }, 0) / ns.length;
      var sc = distinct * (distinct / ns.length) * Math.pow(avg / 60, 2);
      if (sc > bestScore) { bestScore = sc; best = ns; }
    });

    // 윗줄 멜로디: 동시에 시작하면 가장 높은 음, 더 높은 음이 울리는 중에 시작한 낮은 음(반주)은 버린다
    best.sort(function (a, c) { return a.start - c.start || c.midi - a.midi; });
    var melody = [];
    best.forEach(function (n) {
      var last = melody[melody.length - 1];
      if (last && last.start === n.start) return;
      if (last && n.start < last.end - division / 16 && last.midi > n.midi) return;
      melody.push({ midi: n.midi, start: n.start, end: n.end });
    });
    for (var i = 0; i < melody.length - 1; i++) {
      if (melody[i].end > melody[i + 1].start) melody[i].end = melody[i + 1].start;
    }

    // 조 옮기기: 검은 건반이 가장 적은 조를 고른다 (같으면 원래 조에 가까운 쪽)
    var shift = 0;
    if (options.easyKey !== false) {
      var bestBlack = 1e9;
      [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, 6].forEach(function (sh) {
        var black = 0;
        melody.forEach(function (n) { if (isBlack(n.midi + sh)) black++; });
        if (black < bestBlack) { bestBlack = black; shift = sh; }
      });
    }
    // 아이들이 치기 쉽게 가운데 도 근처로 옥타브 이동
    var sorted = melody.map(function (n) { return n.midi + shift; }).sort(function (a, c) { return a - c; });
    shift += Math.round((67 - sorted[Math.floor(sorted.length / 2)]) / 12) * 12;

    // 첫 음이 나올 때의 템포·박자를 기준으로, 실제 시간(초)을 박자로 바꾼다
    var first = melody[0].start, bpm = tempoAt(first), sig = { num: 4, den: 4 };
    sigs.forEach(function (sg) { if (sg.tick <= first) sig = sg; });
    var t0 = seconds(first);
    var notes = melody.map(function (n) {
      var s = seconds(n.start), e = seconds(n.end);
      return { midi: n.midi + shift, beat: (s - t0) * bpm / 60, beats: Math.max((e - s) * bpm / 60, 0.25) };
    });
    // 음역이 너무 넓으면 (2옥타브 초과) 건반이 작아지니, 대부분의 음이 들어가는 2옥타브 안으로 접는다
    var lows = [];
    for (var L = 36; L <= 72; L += 12) lows.push(L);
    var bestL = 60, bestIn = -1;
    lows.forEach(function (L) {
      var inside = notes.filter(function (n) { return n.midi >= L && n.midi <= L + 24; }).length;
      if (inside > bestIn) { bestIn = inside; bestL = L; }
    });
    notes.forEach(function (n) {
      while (n.midi < bestL) n.midi += 12;
      while (n.midi > bestL + 24) n.midi -= 12;
    });

    var beatsPerBar = Math.round(sig.num * 4 / sig.den);
    return { bpm: bpm, beatsPerBar: Math.max(2, Math.min(beatsPerBar, 6)), notes: notes, transpose: shift };
  }

  return {
    name: name, fullName: fullName, octaveWord: octaveWord, isBlack: isBlack, color: color, diatonicStep: diatonicStep, particle: particle,
    parseMelody: parseMelody, rangeFor: rangeFor, BUILTIN: BUILTIN, parseMIDIFile: parseMIDIFile
  };
})();
