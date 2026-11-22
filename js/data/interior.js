// 인테리어 추천 지식(규칙 기반) — 인터넷·AI 없이 폰 안에서 추천 문구를 만든다
export const ROOMS = [
  { key: 'living', ko: '거실', en: 'living room' },
  { key: 'bedroom', ko: '침실', en: 'bedroom' },
  { key: 'kitchen', ko: '주방', en: 'kitchen' },
  { key: 'dining', ko: '식당·다이닝', en: 'dining room' },
  { key: 'bathroom', ko: '욕실', en: 'bathroom' },
  { key: 'office', ko: '서재·작업실', en: 'home office' },
  { key: 'kids', ko: '아이 방', en: 'kids room' },
  { key: 'studio', ko: '원룸', en: 'studio apartment' },
  { key: 'entrance', ko: '현관', en: 'entryway' },
  { key: 'balcony', ko: '베란다·발코니', en: 'balcony' },
];

export const STYLES = {
  scandi: {
    ko: '북유럽', en: 'scandinavian interior', clip: 'a scandinavian style room with light wood and white walls',
    say: '밝은 원목 + 흰 벽 + 패브릭으로 깨끗하고 포근하게',
    colors: [['#f4f1ea', '오프화이트'], ['#d9c3a5', '밝은 원목'], ['#b8b8b2', '웜그레이'], ['#7d8f7a', '세이지 그린'], ['#2f2f2f', '포인트 블랙']],
    materials: ['밝은 원목(오크·애쉬)', '린넨·울 패브릭', '무광 화이트'],
    furniture: ['다리가 보이는 낮은 소파', '원목 사이드테이블', '울 러그'],
    light: ['전구색(2700~3000K) 플로어 스탠드', '패브릭 갓 펜던트'],
    props: ['초록 식물 1~2개', '니트 쿠션·블랭킷', '단순한 액자'],
    avoid: ['반짝이는 금속·광택 가구', '진한 원색을 여러 개 섞기'],
  },
  minimal: {
    ko: '미니멀', en: 'minimalist interior', clip: 'a minimalist room with very few objects and clean surfaces',
    say: '물건을 줄이고 색을 2~3가지로 정리해 넓어 보이게',
    colors: [['#ffffff', '화이트'], ['#e8e6e1', '라이트 그레이'], ['#c9c2b8', '그레이지'], ['#3a3a3a', '차콜']],
    materials: ['무광 도장', '매끈한 하이그로시 대신 무광', '숨은 수납'],
    furniture: ['수납이 몸통에 들어간 가구', '낮고 단순한 침대·소파'],
    light: ['천장 매입등·간접 라인조명', '전구색과 주광색 섞지 않기'],
    props: ['꼭 필요한 것만 밖에', '큰 그림 1점'],
    avoid: ['작은 소품 여러 개', '패턴 여러 종류'],
  },
  modern: {
    ko: '모던', en: 'modern interior', clip: 'a modern contemporary room with sleek furniture',
    say: '직선 가구 + 무채색 + 금속·유리 포인트로 세련되게',
    colors: [['#f2f2f2', '화이트'], ['#8c8c8c', '미디엄 그레이'], ['#1f1f1f', '블랙'], ['#b08d57', '브라스 포인트']],
    materials: ['메탈 프레임', '유리·대리석 상판', '가죽'],
    furniture: ['낮은 직선형 소파', '대리석 또는 세라믹 테이블'],
    light: ['디자인 펜던트 1개', '벽 간접조명'],
    props: ['추상화', '큰 화분 1개'],
    avoid: ['장식이 많은 클래식 가구'],
  },
  japandi: {
    ko: '재팬디', en: 'japandi interior', clip: 'a japandi room with low wooden furniture and neutral earthy tones',
    say: '낮은 원목 가구 + 흙빛 무채색 + 여백으로 차분하게',
    colors: [['#efe8dc', '라이스 베이지'], ['#c2a78a', '월넛 라이트'], ['#8a7f72', '토프'], ['#4b4a3f', '올리브 다크']],
    materials: ['짙은·밝은 원목 섞기', '라탄·대나무', '리넨'],
    furniture: ['좌식에 가까운 낮은 가구', '원목 평상형 침대'],
    light: ['한지·종이 조명', '낮은 위치의 스탠드'],
    props: ['도자기 화병', '가지 하나 꽂은 화병'],
    avoid: ['반짝이는 소재', '쨍한 색'],
  },
  natural: {
    ko: '내추럴·원목', en: 'natural wood cozy interior', clip: 'a cozy natural room with lots of wood and warm tones',
    say: '원목과 베이지로 따뜻하고 편안하게 (한국 아파트에 잘 맞음)',
    colors: [['#f5efe4', '아이보리'], ['#dcc7a8', '베이지'], ['#b08a5f', '원목'], ['#6b7d5c', '올리브']],
    materials: ['원목', '면·린넨', '라탄 바구니'],
    furniture: ['원목 식탁·책장', '패브릭 소파'],
    light: ['전구색 조명 여러 개(천장등만 쓰지 않기)'],
    props: ['식물', '라탄 바구니 수납', '면 커튼'],
    avoid: ['차가운 흰 형광등', '검정 가구 과다'],
  },
  industrial: {
    ko: '인더스트리얼', en: 'industrial loft interior', clip: 'an industrial loft room with concrete, metal and exposed bricks',
    say: '콘크리트·철재·가죽으로 카페 같은 거친 멋',
    colors: [['#8e8e8a', '콘크리트 그레이'], ['#3b3b3b', '스틸 블랙'], ['#8b5a3c', '브라운 가죽'], ['#b55d3a', '벽돌']],
    materials: ['철제 프레임', '고재(오래된 나무)', '가죽', '노출 콘크리트 느낌 벽지'],
    furniture: ['철제 다리 테이블', '가죽 소파'],
    light: ['에디슨 전구 펜던트', '철제 작업등 스탠드'],
    props: ['철제 선반', '큰 벽시계'],
    avoid: ['파스텔 색', '레이스·꽃무늬'],
  },
  midcentury: {
    ko: '미드센추리', en: 'mid century modern interior', clip: 'a mid-century modern room with teak furniture and retro colors',
    say: '티크 원목 + 머스터드·올리브 포인트로 레트로하게',
    colors: [['#efe6d2', '크림'], ['#a0673b', '티크'], ['#d39b2a', '머스터드'], ['#5c6b3a', '올리브'], ['#2e4a5a', '틸 블루']],
    materials: ['티크·월넛', '곡선 합판', '벨벳·울'],
    furniture: ['가는 다리 가구', '라운지 체어', '낮은 사이드보드'],
    light: ['버섯 모양 스탠드', '구형 펜던트'],
    props: ['기하학 패턴 러그', '포스터 액자'],
    avoid: ['장식 많은 앤틱'],
  },
  classic: {
    ko: '클래식·호텔식', en: 'luxury hotel style interior', clip: 'an elegant classic room like a luxury hotel',
    say: '대칭 배치 + 깊은 색 + 고급 소재로 호텔처럼',
    colors: [['#f3efe7', '크림 화이트'], ['#c9b79c', '샴페인 베이지'], ['#3e4a5c', '네이비'], ['#b08d57', '골드']],
    materials: ['몰딩', '벨벳·실크 느낌 패브릭', '대리석'],
    furniture: ['헤드보드가 큰 침대', '대칭 협탁 2개'],
    light: ['좌우 대칭 테이블 램프', '샹들리에 또는 간접조명'],
    props: ['두꺼운 암막 커튼', '호텔 침구(흰색)'],
    avoid: ['저렴한 플라스틱 소품'],
  },
  vintage: {
    ko: '빈티지·레트로', en: 'vintage retro interior', clip: 'a vintage retro room with old furniture and warm colors',
    say: '오래된 느낌 가구 + 따뜻한 색 + 패턴으로 개성 있게',
    colors: [['#f0e2c8', '바랜 크림'], ['#b5652f', '테라코타'], ['#6e7f4e', '모스 그린'], ['#7a4b3a', '체리 브라운']],
    materials: ['앤틱 원목', '자수·패턴 패브릭', '황동'],
    furniture: ['중고·빈티지 서랍장', '체크 패턴 의자'],
    light: ['갓이 있는 스탠드', '앰버 전구'],
    props: ['레코드·책', '빈티지 액자'],
    avoid: ['모든 걸 새것으로 맞추기'],
  },
  plants: {
    ko: '플랜테리어·보헤미안', en: 'bohemian interior with plants', clip: 'a bohemian room full of plants, rattan and patterned textiles',
    say: '식물 + 라탄 + 패턴 패브릭으로 자유롭고 생기 있게',
    colors: [['#f2e8d8', '샌드'], ['#c9a36b', '라탄'], ['#5f7f4f', '리프 그린'], ['#c0623e', '테라코타']],
    materials: ['라탄·대나무', '마크라메', '면 패턴 러그'],
    furniture: ['라탄 의자', '낮은 좌방석'],
    light: ['라탄 펜던트', '줄 조명'],
    props: ['크기가 다른 식물 여러 개', '벽걸이 직물'],
    avoid: ['햇빛 없는 곳에 생화 고집 — 조화·내음성 식물로'],
  },
};

export const ROOM_TIPS = {
  living: ['소파 맞은편 벽(TV 벽)에 시선이 모이게 정리', '러그는 소파 앞다리가 올라갈 만큼 크게', '천장등 + 스탠드 1개 이상으로 조명 2단'],
  bedroom: ['침대 머리맡 벽에 포인트(색·헤드보드·액자) 하나만', '침구는 2~3색 안에서', '잠자기 전엔 전구색 간접조명만'],
  kitchen: ['상판 위 물건을 줄이는 게 가장 큰 효과', '상부장 아래 간접조명', '손잡이·수전 색을 하나로 통일'],
  dining: ['식탁 위 펜던트는 상판에서 70~80cm 위', '의자는 식탁보다 폭을 살짝 좁게', '식탁보·러너로 색 포인트'],
  bathroom: ['수건·매트 색을 2가지 안에서 통일', '물기에 강한 소재(타일·스테인리스)', '세면대 위는 비워 두기'],
  office: ['책상은 창을 옆에 두면 눈부심이 적어요', '모니터 뒤 간접조명', '케이블 정리함'],
  kids: ['아이 눈높이 낮은 수납', '모서리 둥근 가구', '바닥 매트·러그'],
  studio: ['구역을 러그·조명으로 나누기(잠·일·식사)', '키 낮은 가구로 시야 트기', '거울로 넓어 보이게'],
  entrance: ['신발장 위는 비워 두고 트레이 하나', '전신 거울', '센서등 전구색'],
  balcony: ['접이식 테이블·의자', '데크 타일', '내광성 식물'],
};

// 사용자 설명 → 스타일·검색어
export const STYLE_WORDS = [
  [/북유럽|스칸디|scandi/i, 'scandi'], [/미니멀|심플|깔끔/i, 'minimal'], [/모던|세련/i, 'modern'],
  [/재팬디|일본|무인양품|젠|zen/i, 'japandi'], [/내추럴|원목|우드|따뜻한|아늑/i, 'natural'],
  [/인더스트리얼|공장|카페|노출|콘크리트|철제/i, 'industrial'], [/미드센추리|미드 센추리|레트로 모던/i, 'midcentury'],
  [/클래식|호텔|고급|럭셔리|우아/i, 'classic'], [/빈티지|레트로|앤틱/i, 'vintage'], [/식물|플랜테리어|보헤미안|라탄/i, 'plants'],
];
export const EXTRA_WORDS = [
  [/소파|쇼파/, 'sofa'], [/침대/, 'bed'], [/책상/, 'desk'], [/식탁/, 'dining table'], [/조명|스탠드|램프/, 'lamp lighting'],
  [/커튼/, 'curtains'], [/러그|카펫/, 'rug'], [/식물|화분/, 'plants'], [/선반|책장/, 'shelves'], [/수납/, 'storage'],
  [/거울/, 'mirror'], [/화이트|흰/, 'white'], [/베이지/, 'beige'], [/그레이|회색/, 'grey'], [/블랙|검정/, 'black'],
  [/그린|초록/, 'green'], [/블루|파랑|네이비/, 'blue'], [/핑크|분홍/, 'pink'], [/아늑|포근/, 'cozy'], [/넓어|넓게/, 'spacious'],
  [/작은|좁은/, 'small'], [/밝게|밝은/, 'bright'], [/어둡|무드/, 'moody'], [/고양이|강아지|반려/, 'pet friendly'], [/아이|아기/, 'kids'],
];

/** '100만원', '50만 원', '1,000,000원' → 만원 단위 숫자 */
export function parseBudget(text) {
  const m = text.match(/([\d,.]+)\s*만\s*원?/) || text.match(/([\d,]{6,})\s*원/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return /만/.test(m[0]) ? n : Math.round(n / 10000);
}

export function budgetPlan(manwon) {
  if (manwon == null) return null;
  if (manwon < 30) return [`예산 ${manwon}만원: 조명(전구색 스탠드) → 쿠션·커버 → 식물 순서로. 큰 가구는 그대로 두고 "빛과 천"만 바꿔도 분위기가 크게 달라져요.`];
  if (manwon < 150) return [`예산 ${manwon}만원: 러그 → 커튼 → 조명 2개 → 소품. 바닥·창·빛(면적이 큰 것)부터 바꾸면 효과가 커요.`];
  if (manwon < 500) return [`예산 ${manwon}만원: 가장 눈에 띄는 가구 1개(소파·침대·식탁) 교체 + 러그·커튼·조명 세트.`];
  return [`예산 ${manwon}만원: 벽지·바닥 같은 바탕부터 정하고 가구는 그 위에. 시공은 견적을 2곳 이상 비교하세요.`];
}
