import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fnv1a } from '@aidam/engine/src/share/hash';
import { cloudConfigured, fetchEntries, putEntry, removeEntry, signInWithGoogle, signOutCloud, watchUser, type CloudUser, type LibraryEntry } from './cloud';
import { readStored, writeStored } from './storage';

interface Library {
  /** 최근 순 */
  entries: LibraryEntry[];
  user: CloudUser | null;
  cloudReady: boolean;
  cloudConfigured: boolean;
  syncError: string | null;
  /** 분석한 이름을 기록(이미 있으면 시각만 갱신, 북마크 유지) */
  record: (e: Omit<LibraryEntry, 'id' | 'savedAt' | 'bookmarked'>, bookmark?: boolean) => void;
  isBookmarked: (hanja: string, query?: string) => boolean;
  toggleBookmark: (e: Omit<LibraryEntry, 'id' | 'savedAt' | 'bookmarked'>) => void;
  remove: (id: string) => void;
  clearLocal: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Library | null>(null);
const KEY = 'library';
export const entryId = (query: string) => fnv1a(query);

function loadLocal(): LibraryEntry[] {
  const list = readStored<LibraryEntry[]>(KEY, []);
  // 예전 '찜' 목록을 북마크로 옮긴다
  const old = readStored<{ hangul: string; hanja: string; total: number; grade: string; query: string }[]>('favorites', []);
  for (const f of old) {
    const id = entryId(f.query);
    if (!list.some((x) => x.id === id)) list.push({ ...f, id, savedAt: 0, bookmarked: true });
  }
  return list;
}

const byRecent = (a: LibraryEntry, b: LibraryEntry) => b.savedAt - a.savedAt;

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<LibraryEntry[]>(() => loadLocal().sort(byRecent));
  const [user, setUser] = useState<CloudUser | null>(null);
  const [cloudReady, setCloudReady] = useState(!cloudConfigured);
  const [syncError, setSyncError] = useState<string | null>(null);
  const userRef = useRef<CloudUser | null>(null);

  // 로그아웃 상태의 기록만 기기에 둔다 (계정 기록은 계정 저장소에만)
  useEffect(() => {
    if (!userRef.current) writeStored(KEY, entries);
  }, [entries]);

  // 로그인 상태: 첫 화면을 그린 뒤 불러온다
  useEffect(() => {
    if (!cloudConfigured) return;
    let unsub: (() => void) | undefined;
    const start = () =>
      watchUser(async (u) => {
        userRef.current = u;
        setUser(u);
        setCloudReady(true);
        if (!u) return;
        try {
          const remote = await fetchEntries(u.uid);
          // 기기에만 있던 기록을 계정으로 옮긴다
          const local = loadLocal();
          const merged = new Map(remote.map((e) => [e.id, e]));
          const uploads: Promise<void>[] = [];
          for (const e of local) {
            const r = merged.get(e.id);
            if (!r) {
              merged.set(e.id, e);
              uploads.push(putEntry(u.uid, e));
            } else if (e.bookmarked && !r.bookmarked) {
              const m = { ...r, bookmarked: true };
              merged.set(e.id, m);
              uploads.push(putEntry(u.uid, m));
            }
          }
          setEntries([...merged.values()].sort(byRecent));
          await Promise.all(uploads);
          writeStored(KEY, []);
          writeStored('favorites', []);
          setSyncError(null);
        } catch {
          setSyncError('계정 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        }
      }).then((fn) => (unsub = fn));
    const id = window.setTimeout(start, 300);
    return () => {
      window.clearTimeout(id);
      unsub?.();
    };
  }, []);

  const upsert = useCallback((next: LibraryEntry) => {
    setEntries((prev) => [next, ...prev.filter((x) => x.id !== next.id)].sort(byRecent));
    const u = userRef.current;
    if (u) putEntry(u.uid, next).catch(() => setSyncError('계정에 저장하지 못했어요. 기기에는 저장됐어요.'));
  }, []);

  const record = useCallback<Library['record']>(
    (e, bookmark) => {
      const id = entryId(e.query);
      setEntries((prev) => {
        const old = prev.find((x) => x.id === id);
        const next: LibraryEntry = { ...e, id, savedAt: Date.now(), bookmarked: bookmark ?? old?.bookmarked ?? false };
        const u = userRef.current;
        if (u) putEntry(u.uid, next).catch(() => setSyncError('계정에 저장하지 못했어요. 기기에는 저장됐어요.'));
        return [next, ...prev.filter((x) => x.id !== id)].sort(byRecent);
      });
    },
    [],
  );

  const value = useMemo<Library>(
    () => ({
      entries,
      user,
      cloudReady,
      cloudConfigured,
      syncError,
      record,
      isBookmarked: (hanja, query) => entries.some((x) => x.bookmarked && (query ? x.id === entryId(query) : x.hanja === hanja)),
      toggleBookmark: (e) => {
        const id = entryId(e.query);
        const old = entries.find((x) => x.id === id);
        upsert({ ...e, id, savedAt: old?.savedAt ?? Date.now(), bookmarked: !old?.bookmarked });
      },
      remove: (id) => {
        setEntries((prev) => prev.filter((x) => x.id !== id));
        const u = userRef.current;
        if (u) removeEntry(u.uid, id).catch(() => setSyncError('계정에서 지우지 못했어요.'));
      },
      clearLocal: () => {
        setEntries([]);
        writeStored(KEY, []);
        writeStored('favorites', []);
      },
      signIn: async () => {
        setSyncError(null);
        try {
          await signInWithGoogle();
        } catch (e) {
          const code = (e as { code?: string; message?: string }).code ?? (e as Error).message;
          if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
            setSyncError(code === 'CLOUD_NOT_CONFIGURED' ? '로그인 설정이 아직 연결되지 않았어요.' : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.');
          }
        }
      },
      signOut: async () => {
        await signOutCloud();
        setEntries(loadLocal().sort(byRecent));
      },
    }),
    [entries, user, cloudReady, syncError, record, upsert],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary(): Library {
  const v = useContext(Ctx);
  if (!v) throw new Error('LibraryProvider missing');
  return v;
}
