// 미션 깨기: 10월드 × 10스테이지. 100곡 모두 다른 곡이고, 기본곡·가족곡과도 겹치지 않는다.
// 월드 3~10 곡은 빠르기·도약·검은건반·음역을 점수로 매겨 쉬운 순서대로 나눴다.
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
      { id: 'echo', title: '메아리 놀이', bpm: 90, melody: 'C4 D4 E4:2 C4 D4 E4:2 E4 F4 G4:2 E4 F4 G4:2 G4 F4 E4 D4 G4 F4 E4 D4 C4:4' },
      { id: 'stairs5', title: '도레미파솔 계단', bpm: 90, melody: 'C4 D4 E4 F4 G4:2 R:2 G4 F4 E4 D4 C4:2 R:2 C4 E4 D4 F4 E4 G4 F4 D4 C4:4' },
      { id: 'waltz5', title: '왈츠 스텝', bpm: 100, beatsPerBar: 3, melody: 'C4 E4 G4 G4:3 D4 F4 G4 G4:3 E4 G4 E4 D4 F4 D4 C4 E4 D4 C4:3 C4 E4 G4 G4:3 D4 F4 G4 G4:3 G4 F4 E4 D4 E4 D4 C4:3' },
      { id: 'jumps', title: '뛰어넘기', bpm: 90, melody: 'C4 E4 G4:2 G4 E4 C4:2 C4 E4 D4 F4 E4:2 D4:2 C4 E4 G4 E4 D4 F4 E4 D4 C4:4' },
      { id: 'auclair', title: '달빛 아래서 (프랑스 동요)', bpm: 90, melody: 'C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4 C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4' },
      { id: 'saints', title: '성자들의 행진', bpm: 110, melody: 'C4 E4 F4 G4:4 R C4 E4 F4 G4:4 R C4 E4 F4 G4:2 E4:2 C4:2 E4:2 D4:4 R:2 E4 E4 D4:2 C4:3 C4 E4 G4:2 G4 F4:4 R E4 F4 G4:2 E4:2 C4:2 D4:2 C4:4' },
      { id: 'kumbaya', title: '쿰바야', bpm: 80, melody: 'C4 E4 G4:1.5 G4:0.5 G4:2 A4 A4 G4:4 C4 E4 G4:1.5 G4:0.5 G4:2 F4 E4 D4:4 C4 E4 G4:1.5 G4:0.5 G4:2 A4 A4 G4:4 F4 E4 D4 D4 C4:4' },
      { id: 'oldman', title: '디스 올드 맨 (This Old Man)', bpm: 100, melody: 'G4 E4 G4:2 G4 E4 G4:2 A4 G4 F4 E4 D4 E4 F4:2 E4 F4 G4 C4 C4 C4:0.5 C4:0.5 C4 D4 E4 F4 G4:2 G4 D4 D4 F4 E4 D4 C4:2' }
    ]
  },
  { id: 's2', world: '바이엘 초원', c1: '#eafbc9', c2: '#8ed36b', deco: '🐑 🌾 ☁️ 🌻 🐝 🌾', name: '바이엘 상', emoji: '🌿', book: '바이엘 상 수준', desc: '바이엘 연습곡과 한 옥타브 노래', goal: 0.8, songs: [
      { id: 'beyer12', title: '바이엘 12번', bpm: 90, melody: 'C4 D4 E4 F4 G4 F4 E4 D4 C4 D4 E4 F4 G4 F4 E4 D4 C4 D4 E4 F4 G4 F4 E4 D4 E4 C4 E4 D4 C4:4' },
      { id: 'beyer14', title: '바이엘 14번', bpm: 90, melody: 'C4 D4 E4 F4 G4 F4 E4 D4 C4:4 G4:4 C4 D4 E4 F4 G4 F4 E4 D4 C4:4 G4:4 C4 D4 E4 F4 G4 F4 E4 D4 C4 G4 C4 G4 C4:4' },
      { id: 'london', title: '런던 다리', bpm: 100, melody: 'G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:3' },
      { id: 'jacques', title: '프레르 자크 (돌림노래)', bpm: 100, melody: 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2' },
      { id: 'beyer15', title: '바이엘 15번', bpm: 90, melody: 'C4 D4 E4 F4 G4 F4 E4 D4 C4 D4 E4 F4 E4:2 D4:2 C4 D4 E4 F4 G4 F4 E4 D4 C4 D4 E4 F4 E4 D4 C4:2 D4 E4 F4 E4 D4:4 E4 F4 G4 F4 E4:3 D4 C4 D4 E4 F4 G4 F4 E4 D4 C4 D4 E4 F4 E4 D4 C4:2' },
      { id: 'rowboat', title: '저어라 저어라 (Row Your Boat)', bpm: 100, beatsPerBar: 3, melody: 'C4:1.5 C4:1.5 C4 D4:0.5 E4:1.5 E4 D4:0.5 E4 F4:0.5 G4:3 C5:0.5 C5:0.5 C5:0.5 G4:0.5 G4:0.5 G4:0.5 E4:0.5 E4:0.5 E4:0.5 C4:0.5 C4:0.5 C4:0.5 G4 F4:0.5 E4 D4:0.5 C4:3' },
      { id: 'yankee', title: '양키 두들', bpm: 110, melody: 'C4 C4 D4 E4 C4 E4 D4 G3 C4 C4 D4 E4 C4:2 B3:2 C4 C4 D4 E4 F4 E4 D4 C4 B3 G3 A3 B3 C4:2 C4:2' },
      { id: 'macdonald', title: '올드 맥도날드', bpm: 110, melody: 'C5 C5 C5 G4 A4 A4 G4:2 E5 E5 D5 D5 C5:3 G4 C5 C5 C5 G4 A4 A4 G4:2 E5 E5 D5 D5 C5:4' },
      { id: 'susanna', title: '오 수재너', bpm: 100, melody: 'C4:0.5 D4:0.5 E4 G4 G4:1.5 A4:0.5 G4 E4 C4:1.5 D4:0.5 E4 E4 D4 C4 D4:3 C4:0.5 D4:0.5 E4 G4 G4:1.5 A4:0.5 G4 E4 C4:1.5 D4:0.5 E4 E4 D4 D4 C4:4' },
      { id: 'grace', title: '어메이징 그레이스', bpm: 80, beatsPerBar: 3, melody: 'C4 F4:2 A4:0.5 F4:0.5 A4:2 G4 F4:2 D4 C4:2 C4 F4:2 A4:0.5 F4:0.5 A4:2 G4 C5:5 A4 C5:1.5 A4:0.5 C5:0.5 A4:0.5 F4:2 C4 D4:1.5 F4:0.5 F4:0.5 D4:0.5 C4:2 C4 F4:2 A4:0.5 F4:0.5 A4:2 G4 F4:5' }
    ] },
  { id: 's3', world: '클로버 언덕', c1: '#d8f7e6', c2: '#4cc38a', deco: '🍀 🐇 🌷 🍄 🐿️ 🌼', name: '바이엘 하', emoji: '🍀', book: '바이엘 하 수준', desc: '슈만·디아벨리·차이콥스키의 느리고 쉬운 노래', goal: 0.8, songs: [] },
  { id: 's4', world: '체르니 숲', c1: '#d3f2cf', c2: '#3f9f5a', deco: '🌳 🦉 🍄 🌰 🦔 🌳', name: '체르니 100 (1)', emoji: '🌳', book: '체르니 100 수준', desc: '트로이메라이, 비창 2악장 같은 느린 명곡과 미뉴에트', goal: 0.7, songs: [] },
  { id: 's5', world: '깊은 숲', c1: '#bfe3d2', c2: '#2d6a4f', deco: '🌲 🦌 🌙 🦊 🌲 ✨', name: '체르니 100 (2)', emoji: '🌲', book: '체르니 100 수준', desc: '녹턴, 쇼팽 전주곡, 인형 병정의 행진, 체르니 연습곡', goal: 0.7, songs: [] },
  { id: 's6', world: '나비 정원', c1: '#ffe3f2', c2: '#b388eb', deco: '🦋 🌺 🌈 🌸 🦋 🌹', name: '체르니 100 (3)', emoji: '🦋', book: '체르니 100 ~ 부르크뮐러', desc: '손가락이 빨라져요: 체르니, 슈만, 부르크뮐러', goal: 0.7, songs: [] },
  { id: 's7', world: '음악의 성', c1: '#e0ecff', c2: '#6a8dff', deco: '🏰 🎺 🎻 🥁 🎹 🎶', name: '체르니 30 (1)', emoji: '🎼', book: '체르니 30 입문', desc: '바흐 인벤션 1번, 쿨라우 소나티네, 부르크뮐러 위안', goal: 0.7, songs: [] },
  { id: 's8', world: '불꽃 화산', c1: '#ffe2c4', c2: '#ff6b4a', deco: '🌋 🔥 🐉 🪨 🔥 ☄️', name: '체르니 30 (2)', emoji: '🔥', book: '체르니 30 수준', desc: '아라베스크, 바흐 인벤션 4·14번, 쿨라우 소나티네', goal: 0.6, songs: [] },
  { id: 's9', world: '번개 산', c1: '#dfe5ff', c2: '#5b5bd6', deco: '⚡ ⛰️ 🦅 ☁️ ⚡ 🌩️', name: '체르니 30 (3)', emoji: '⚡', book: '체르니 30 수준', desc: '모차르트 K.545 1악장, 바흐 인벤션 8·13번, 클레멘티', goal: 0.6, songs: [] },
  { id: 's10', world: '왕의 궁전', c1: '#fff6cf', c2: '#f5b700', deco: '👑 💎 ✨ 🏆 🎖️ 🌟', name: '최종 보스', emoji: '👑', book: '체르니 30 이상', desc: '가장 어려운 곡: 클레멘티 소나티네, 체르니, 부르크뮐러', goal: 0.6, songs: [] }
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
