import type { FirebaseOptions } from 'firebase/app';

/**
 * Firebase 웹 앱 설정값.
 * Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)의 firebaseConfig를 여기에 붙여 넣거나,
 * 배포 환경 변수(VITE_FIREBASE_API_KEY 등)로 넣는다. 비어 있으면 로그인 없이 기기 저장만 동작한다.
 * 웹 설정값은 공개되어도 되는 값이며, 데이터 보호는 firestore.rules(본인만 읽고 쓰기)로 한다.
 */
const fromFile: FirebaseOptions | null = {
  apiKey: 'AIzaSyCIgIESzxk9Ql12BzTKrZtUsbmmdlI3w2E',
  authDomain: 'aidam-9aba3.firebaseapp.com',
  projectId: 'aidam-9aba3',
  storageBucket: 'aidam-9aba3.firebasestorage.app',
  messagingSenderId: '858831694313',
  appId: '1:858831694313:web:ae42331a2956f4e4e14378',
};

const env = import.meta.env;
const fromEnv: FirebaseOptions | null = env.VITE_FIREBASE_API_KEY
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
  : null;

/** 미리보기 빌드(VITE_DISABLE_CLOUD=1)에서는 로그인을 끄고 '미리보기 계정'으로 동작한다 */
export const firebaseConfig: FirebaseOptions | null = env.VITE_DISABLE_CLOUD === '1' ? null : (fromFile ?? fromEnv);
