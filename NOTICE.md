# 데이터 출처와 라이선스 (NOTICE)

아이담은 아래 공개 데이터를 사용합니다. 원본 사본은 `data-sources/`에 있고, `tools/build-data/`가 엔진용 JSON을 만듭니다.

| 데이터 | 출처 | 라이선스 |
|---|---|---|
| 인명용·교육용 한자, 한자 음, 부수·획수 (`data-sources/unihan-ko.tsv`) | Unicode Unihan Database (`kKoreanName`, `kKoreanEducationHanja`, `kHangul`, `kRSUnicode`, `kTotalStrokes`), npm `@mandel59/mojidata@1.9.3` 포함본에서 추출 | Unicode License v3 — Copyright © 1991-2025 Unicode, Inc. |
| 한자 훈음 (`data-sources/libhangul-hanja-1char.txt`) | libhangul `data/hanja/hanja.txt` (한 글자 항목 발췌) | BSD-3-Clause — Copyright (c) 2005,2006 Choe Hwanjin |
| 절기·태양 위치 계산 | npm `astronomy-engine` | MIT — Copyright (c) 2019-2023 Don Cross |
| 음력↔양력 변환 | npm `korean-lunar-calendar` (한국천문연구원 데이터 기반) | MIT |
| 서울 표준시 이력 (`packages/engine/src/data/seoul-tz.json`) | IANA tz database (Asia/Seoul), Node.js ICU로 추출 | Public domain |

알려진 한계: 2024년 대법원 인명용 한자 추가분은 Unihan에 아직 반영되지 않아 포함되지 않습니다.

글꼴: 고운바탕(Gowun Batang) — SIL Open Font License 1.1, npm `@fontsource/gowun-batang`으로 자체 호스팅.
