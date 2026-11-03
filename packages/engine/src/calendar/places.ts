export interface Place {
  id: string;
  name: string;
  lon: number;
}

/** 출생지 경도(도, 동경). 진태양시 보정에 쓴다. */
export const PLACES: readonly Place[] = [
  { id: 'seoul', name: '서울', lon: 126.98 },
  { id: 'busan', name: '부산', lon: 129.08 },
  { id: 'daegu', name: '대구', lon: 128.6 },
  { id: 'incheon', name: '인천', lon: 126.7 },
  { id: 'gwangju', name: '광주', lon: 126.85 },
  { id: 'daejeon', name: '대전', lon: 127.38 },
  { id: 'ulsan', name: '울산', lon: 129.31 },
  { id: 'sejong', name: '세종', lon: 127.29 },
  { id: 'suwon', name: '수원·경기 남부', lon: 127.03 },
  { id: 'uijeongbu', name: '의정부·경기 북부', lon: 127.03 },
  { id: 'chuncheon', name: '춘천', lon: 127.73 },
  { id: 'gangneung', name: '강릉', lon: 128.88 },
  { id: 'cheongju', name: '청주', lon: 127.49 },
  { id: 'cheonan', name: '천안', lon: 127.15 },
  { id: 'jeonju', name: '전주', lon: 127.15 },
  { id: 'mokpo', name: '목포', lon: 126.39 },
  { id: 'yeosu', name: '여수', lon: 127.66 },
  { id: 'andong', name: '안동', lon: 128.73 },
  { id: 'pohang', name: '포항', lon: 129.37 },
  { id: 'changwon', name: '창원', lon: 128.68 },
  { id: 'jinju', name: '진주', lon: 128.11 },
  { id: 'jeju', name: '제주', lon: 126.53 },
  { id: 'seogwipo', name: '서귀포', lon: 126.56 },
];

export const findPlace = (id: string): Place | undefined => PLACES.find((p) => p.id === id);
