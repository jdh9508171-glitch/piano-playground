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
  function parseMIDIFile(buffer) {
    var b = new Uint8Array(buffer), pos = 0;
    function u32() { var v = (b[pos] << 24 | b[pos + 1] << 16 | b[pos + 2] << 8 | b[pos + 3]) >>> 0; pos += 4; return v; }
    function u16() { var v = b[pos] << 8 | b[pos + 1]; pos += 2; return v; }
    function tag() { var s = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]); pos += 4; return s; }

    if (b.length < 14 || tag() !== 'MThd') return null;
    var hlen = u32(); u16(); var trackCount = u16(); var division = u16();
    if (division & 0x8000 || division === 0) return null;
    pos = 8 + hlen;

    var tempo = 500000, tempoSet = false, numerator = 4, raw = [];
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
          if (type === 0x51 && l === 3 && !tempoSet) { tempo = b[pos] << 16 | b[pos + 1] << 8 | b[pos + 2]; tempoSet = true; }
          else if (type === 0x58 && l >= 1) numerator = b[pos];
          pos += l; status = 0;
        } else if (status === 0xF0 || status === 0xF7) {
          pos += varLen(); status = 0;
        } else if (status >= 0x80) {
          var kind = status & 0xF0, ch = status & 0x0F;
          var need = (kind === 0xC0 || kind === 0xD0) ? 1 : 2;
          var d1 = b[pos], d2 = need > 1 ? b[pos + 1] : 0;
          pos += need;
          if (ch === 9) continue; // 드럼 채널
          if (kind === 0x90 && d2 > 0) {
            if (open[d1] !== undefined) raw[open[d1]].end = tick;
            raw.push({ track: track, midi: d1, start: tick, end: tick + division });
            open[d1] = raw.length - 1;
          } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
            if (open[d1] !== undefined) { raw[open[d1]].end = tick; delete open[d1]; }
          }
        } else {
          pos++; // 알 수 없는 바이트 건너뛰기
        }
      }
      pos = end;
    }
    if (!raw.length) return null;

    // 음표가 많고 음이 높은 트랙을 멜로디로
    var tracks = {};
    raw.forEach(function (n) { (tracks[n.track] = tracks[n.track] || []).push(n); });
    var best = null, bestScore = -1;
    Object.keys(tracks).forEach(function (k) {
      var ns = tracks[k], avg = ns.reduce(function (s, n) { return s + n.midi; }, 0) / ns.length;
      var sc = ns.length * (avg / 60);
      if (sc > bestScore) { bestScore = sc; best = ns; }
    });

    var byStart = {};
    best.forEach(function (n) { if (!byStart[n.start] || byStart[n.start].midi < n.midi) byStart[n.start] = n; });
    var melody = Object.keys(byStart).map(function (k) { return byStart[k]; })
      .sort(function (a, c) { return a.start - c.start; });
    for (var i = 0; i < melody.length - 1; i++) {
      if (melody[i].end > melody[i + 1].start) melody[i].end = melody[i + 1].start;
    }

    // 아이들이 치기 쉽게 가운데 도 근처로 옥타브 이동
    var sorted = melody.map(function (n) { return n.midi; }).sort(function (a, c) { return a - c; });
    var shift = Math.round((67 - sorted[Math.floor(sorted.length / 2)]) / 12) * 12;
    var barTicks = division * numerator;
    var offset = Math.floor(melody[0].start / barTicks) * barTicks;
    var notes = melody.map(function (n) {
      return { midi: n.midi + shift, beat: (n.start - offset) / division,
               beats: Math.max((n.end - n.start) / division, 0.25) };
    });
    return { bpm: 60000000 / tempo, beatsPerBar: Math.max(2, Math.min(numerator, 6)), notes: notes };
  }

  return {
    name: name, isBlack: isBlack, color: color, diatonicStep: diatonicStep, particle: particle,
    parseMelody: parseMelody, rangeFor: rangeFor, BUILTIN: BUILTIN, parseMIDIFile: parseMIDIFile
  };
})();
