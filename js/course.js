// 단계 깨기: 10단계, 쉬운 곡부터 어려운 곡 순서
// 곡은 저작권이 끝난 클래식·동요·연습곡이라 그대로 넣는다.
// 곡 모양: melody(음이름 표기) 또는 notes([midi, 박, 길이]) 또는 builtin(기본 곡 id)
'use strict';

var COURSE = [
  {
    id: 's1', world: '새싹 숲', c1: '#dff9d8', c2: '#7ed6a5', deco: '🌸 🌼 🌿 🐞 🍃 🌷', name: '새싹', emoji: '🌱', book: '오른손 다섯 손가락',
    desc: '도~솔 다섯 음을 오른손으로 익혀요',
    goal: 0.8,
    songs: [
      { id: 'doremi', title: '도레미 놀이', bpm: 80, melody: 'C4 D4 E4:2 E4 D4 C4:2 C4 D4 E4 D4 C4:4' },
      { id: 'hotcross', title: '핫 크로스 번', bpm: 90, melody: 'E4 D4 C4:2 E4 D4 C4:2 C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 E4 D4 C4:2' },
      { builtin: 'airplane' },
      { id: 'stairs5', title: '도레미파솔 계단', bpm: 90, melody: 'C4 D4 E4 F4 G4:2 R:2 G4 F4 E4 D4 C4:2 R:2 C4 E4 D4 F4 E4 G4 F4 D4 C4:4' },
      { id: 'jumps', title: '뛰어넘기', bpm: 90, melody: 'C4 E4 G4:2 G4 E4 C4:2 C4 E4 D4 F4 E4:2 D4:2 C4 E4 G4 E4 D4 F4 E4 D4 C4:4' },
      { builtin: 'twinkle' },
      { builtin: 'butterfly' },
      { id: 'joyeasy', title: '환희의 송가 (쉬운)', bpm: 100, melody: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2' },
      { id: 'auclair', title: '달빛 아래서 (프랑스 동요)', bpm: 90, melody: 'C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4 C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4' },
      { builtin: 'jingle' }
    ]
  },
  { id: 's2', world: '바이엘 초원', c1: '#eafbc9', c2: '#8ed36b', deco: '🐑 🌾 ☁️ 🌻 🐝 🌾', name: '바이엘 상', emoji: '🌿', book: '바이엘 상', desc: '한 옥타브(도~높은 도)와 8분음표', goal: 0.8, songs: [] },
  { id: 's3', world: '클로버 언덕', c1: '#d8f7e6', c2: '#4cc38a', deco: '🍀 🐇 🌷 🍄 🐿️ 🌼', name: '바이엘 하', emoji: '🍀', book: '바이엘 하', desc: '점음표, 쉼표, 손 넘기기', goal: 0.8, songs: [] },
  { id: 's4', world: '체르니 숲', c1: '#d3f2cf', c2: '#3f9f5a', deco: '🌳 🦉 🍄 🌰 🦔 🌳', name: '체르니 100 (1)', emoji: '🌳', book: '체르니 100', desc: '빠른 음계와 반복음', goal: 0.7, songs: [] },
  { id: 's5', world: '깊은 숲', c1: '#bfe3d2', c2: '#2d6a4f', deco: '🌲 🦌 🌙 🦊 🌲 ✨', name: '체르니 100 (2)', emoji: '🌲', book: '체르니 100', desc: '넓은 음역과 가벼운 손가락', goal: 0.7, songs: [] },
  { id: 's6', world: '나비 정원', c1: '#ffe3f2', c2: '#b388eb', deco: '🦋 🌺 🌈 🌸 🦋 🌹', name: '부르크뮐러', emoji: '🦋', book: '부르크뮐러 25', desc: '느낌을 살려 치는 아름다운 소품', goal: 0.7, songs: [] },
  { id: 's7', world: '음악의 성', c1: '#e0ecff', c2: '#6a8dff', deco: '🏰 🎺 🎻 🥁 🎹 🎶', name: '소나티네', emoji: '🎼', book: '소나티네', desc: '쿨라우·클레멘티의 작은 소나타', goal: 0.7, songs: [] },
  { id: 's8', world: '불꽃 화산', c1: '#ffe2c4', c2: '#ff6b4a', deco: '🌋 🔥 🐉 🪨 🔥 ☄️', name: '체르니 30 (1)', emoji: '🔥', book: '체르니 30', desc: '빠른 손가락, 긴 음계', goal: 0.6, songs: [] },
  { id: 's9', world: '번개 산', c1: '#dfe5ff', c2: '#5b5bd6', deco: '⚡ ⛰️ 🦅 ☁️ ⚡ 🌩️', name: '체르니 30 (2)', emoji: '⚡', book: '체르니 30', desc: '더 빠르고 긴 곡', goal: 0.6, songs: [] },
  { id: 's10', world: '왕의 궁전', c1: '#fff6cf', c2: '#f5b700', deco: '👑 💎 ✨ 🏆 🎖️ 🌟', name: '명곡', emoji: '👑', book: '명곡', desc: '누구나 아는 클래식 명곡', goal: 0.7, songs: [] }
];

// course-data.js 에서 채우는 곡들 (단계 id → 곡 목록)
var COURSE_EXTRA = window.COURSE_EXTRA || {};

// 곡 정보를 게임·배우기에서 쓰는 모양으로
function courseSong(stage, ref) {
  if (ref.builtin) {
    var b = Music.BUILTIN.filter(function (s) { return s.id === ref.builtin; })[0];
    var copy = {}; for (var k in b) copy[k] = b[k];
    copy.id = stage.id + '-' + b.id;
    return copy;
  }
  var notes = ref.notes
    ? ref.notes.map(function (a) { return { midi: a[0], beat: a[1], beats: a[2] }; })
    : Music.parseMelody(ref.melody);
  return { id: stage.id + '-' + ref.id, title: ref.title, emoji: stage.emoji, level: 1, bpm: ref.bpm || 90,
           beatsPerBar: ref.beatsPerBar || 4, notes: notes, range: Music.rangeFor(notes), cat: stage.name };
}

function courseStages() {
  return COURSE.map(function (st) {
    var refs = st.songs.concat(COURSE_EXTRA[st.id] || []);
    return { id: st.id, name: st.name, world: st.world, c1: st.c1, c2: st.c2, deco: st.deco.split(' '),
             emoji: st.emoji, book: st.book, desc: st.desc, goal: st.goal,
             songs: refs.map(function (r) { return courseSong(st, r); }) };
  });
}
