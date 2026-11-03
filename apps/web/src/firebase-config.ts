import type { FirebaseOptions } from 'firebase/app';

/**
 * Firebase 웹 앱 설정값.
 * Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)의 firebaseConfig를 여기에 붙여 넣거나,
 * 배포 환경 변수(VITE_FIREBASE_API_KEY 등)로 넣는다. 비어 있으면 로그인 없이 기기 저장만 동작한다.
 * 웹 설정값은 공개되어도 되는 값이며, 데이터 보호는 firestore.rules(본인만 읽고 쓰기)로 한다.
 */
const fromFile: FirebaseOptions | null = null;

const env = import.meta.env;
const fromEnv: FirebaseOptions | null = env.VITE_FIREBASE_API_KEY
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
  : null;

export const firebaseConfig: FirebaseOptions | null = fromFile ?? fromEnv;
