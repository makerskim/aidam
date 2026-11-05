import dataVersion from './data/data-version.json';

/** 알고리즘이 바뀌면 올린다. 결과 재현성 확인에 쓰인다. */
export const ENGINE_VERSION = '1.8.0';
/** 한자 데이터(hanja-raw.json)의 FNV-1a 해시 */
export const DATA_VERSION: string = dataVersion.hanja;
