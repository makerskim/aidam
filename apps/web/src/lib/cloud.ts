/**
 * Google 로그인과 계정 저장소(Firebase Auth + Firestore). 설정이 있을 때만, 필요한 순간에 불러온다.
 * 저장 위치: users/{uid}/names/{id} — firestore.rules로 본인만 읽고 쓸 수 있다.
 */
import { firebaseConfig } from '../firebase-config';

export interface CloudUser {
  uid: string;
  name: string | null;
  email: string | null;
  photo: string | null;
}

export interface LibraryEntry {
  id: string;
  hangul: string;
  hanja: string;
  total: number;
  grade: string;
  /** 리포트를 다시 여는 입력 상태 */
  query: string;
  savedAt: number;
  bookmarked: boolean;
}

export const cloudConfigured = firebaseConfig !== null;

type AuthMod = typeof import('firebase/auth');
type FsMod = typeof import('firebase/firestore');

let core: Promise<{ auth: import('firebase/auth').Auth; a: AuthMod; app: import('firebase/app').FirebaseApp }> | null = null;
let store: Promise<{ db: import('firebase/firestore').Firestore; f: FsMod }> | null = null;

function loadAuth() {
  if (!firebaseConfig) return Promise.reject(new Error('CLOUD_NOT_CONFIGURED'));
  core ??= Promise.all([import('firebase/app'), import('firebase/auth')]).then(([appMod, a]) => {
    const app = appMod.getApps()[0] ?? appMod.initializeApp(firebaseConfig as import('firebase/app').FirebaseOptions);
    return { app, a, auth: a.getAuth(app) };
  });
  return core;
}

function loadStore() {
  store ??= Promise.all([loadAuth(), import('firebase/firestore')]).then(([{ app }, f]) => ({ f, db: f.getFirestore(app) }));
  return store;
}

const toUser = (u: import('firebase/auth').User | null): CloudUser | null =>
  u ? { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL } : null;

/** 로그인 상태 구독. 설정이 없으면 바로 null을 알린다 */
export async function watchUser(cb: (u: CloudUser | null) => void): Promise<() => void> {
  if (!cloudConfigured) {
    cb(null);
    return () => undefined;
  }
  const { a, auth } = await loadAuth();
  return a.onAuthStateChanged(auth, (u) => cb(toUser(u)));
}

export async function signInWithGoogle(): Promise<void> {
  const { a, auth } = await loadAuth();
  const provider = new a.GoogleAuthProvider();
  try {
    await a.signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await a.signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export async function signOutCloud(): Promise<void> {
  const { a, auth } = await loadAuth();
  await a.signOut(auth);
}

const col = (f: FsMod, db: import('firebase/firestore').Firestore, uid: string) => f.collection(db, 'users', uid, 'names');

export async function fetchEntries(uid: string): Promise<LibraryEntry[]> {
  const { f, db } = await loadStore();
  const snap = await f.getDocs(col(f, db, uid));
  return snap.docs.map((d) => d.data() as LibraryEntry);
}

export async function putEntry(uid: string, e: LibraryEntry): Promise<void> {
  const { f, db } = await loadStore();
  await f.setDoc(f.doc(col(f, db, uid), e.id), e);
}

export async function removeEntry(uid: string, id: string): Promise<void> {
  const { f, db } = await loadStore();
  await f.deleteDoc(f.doc(col(f, db, uid), id));
}

/** 서버(결제·AI)에 보낼 로그인 토큰. 로그인하지 않았으면 null */
export async function getIdToken(): Promise<string | null> {
  if (!cloudConfigured) return null;
  const { auth } = await loadAuth();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}
