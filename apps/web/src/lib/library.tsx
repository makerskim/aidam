import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fnv1a } from '@aidam/engine/src/share/hash';
import { api, payEnabled, useAccess, type CloudUser, type Provider } from './access';
import { readStored, writeStored } from './storage';

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

interface Library {
  /** 최근 순 */
  entries: LibraryEntry[];
  user: CloudUser | null;
  /** 서버 없이 쓰는 미리보기 계정인지 */
  isPreview: boolean;
  cloudReady: boolean;
  cloudConfigured: boolean;
  syncError: string | null;
  /** 분석한 이름을 기록(이미 있으면 시각만 갱신, 북마크 유지) */
  record: (e: Omit<LibraryEntry, 'id' | 'savedAt' | 'bookmarked'>, bookmark?: boolean) => void;
  isBookmarked: (hanja: string, query?: string) => boolean;
  toggleBookmark: (e: Omit<LibraryEntry, 'id' | 'savedAt' | 'bookmarked'>) => void;
  remove: (id: string) => void;
  clearLocal: () => void;
  /** 로그인 화면으로 간다. back: 로그인 뒤 돌아올 화면 */
  signIn: (provider?: Provider, back?: string) => Promise<void>;
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
  const access = useAccess();
  const user = access.user;
  const uid = user?.uid ?? null;
  // 미리보기(서버 없음)에서는 이 기기에, 서버가 있으면 계정 저장소에만 둔다
  const [entries, setEntries] = useState<LibraryEntry[]>(() => (payEnabled ? [] : loadLocal().sort(byRecent)));
  const [syncError, setSyncError] = useState<string | null>(null);
  const userRef = useRef<CloudUser | null>(user);
  userRef.current = user;

  useEffect(() => {
    if (!payEnabled) writeStored(KEY, entries);
  }, [entries]);

  // 로그인하면 계정의 기록을 불러온다
  useEffect(() => {
    if (!payEnabled) return;
    if (!uid) {
      setEntries([]);
      return;
    }
    let alive = true;
    api<{ entries: LibraryEntry[] }>('/library')
      .then((r) => {
        if (!alive) return;
        setEntries(r.entries.sort(byRecent));
        setSyncError(null);
      })
      .catch(() => alive && setSyncError('계정 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'));
    return () => {
      alive = false;
    };
  }, [uid]);

  const save = useCallback((e: LibraryEntry) => {
    if (payEnabled) api(`/library/${e.id}`, e, 'PUT').catch(() => setSyncError('계정에 저장하지 못했어요.'));
  }, []);

  const upsert = useCallback(
    (next: LibraryEntry) => {
      setEntries((prev) => [next, ...prev.filter((x) => x.id !== next.id)].sort(byRecent));
      save(next);
    },
    [save],
  );

  const record = useCallback<Library['record']>(
    (e, bookmark) => {
      // 로그인하지 않으면 저장하지 않는다
      if (!userRef.current) return;
      const id = entryId(e.query);
      let next: LibraryEntry | null = null;
      setEntries((prev) => {
        const old = prev.find((x) => x.id === id);
        next = { ...e, id, savedAt: Date.now(), bookmarked: bookmark ?? old?.bookmarked ?? false };
        return [next, ...prev.filter((x) => x.id !== id)].sort(byRecent);
      });
      // 화면 갱신과 따로, 한 번만 저장한다
      queueMicrotask(() => next && save(next));
    },
    [save],
  );

  const value = useMemo<Library>(
    () => ({
      entries,
      user,
      cloudReady: access.ready,
      cloudConfigured: payEnabled,
      syncError,
      record,
      isBookmarked: (hanja, query) => entries.some((x) => x.bookmarked && (query ? x.id === entryId(query) : x.hanja === hanja)),
      isPreview: access.isPreview,
      toggleBookmark: (e) => {
        if (!userRef.current) return;
        const id = entryId(e.query);
        const old = entries.find((x) => x.id === id);
        upsert({ ...e, id, savedAt: old?.savedAt ?? Date.now(), bookmarked: !old?.bookmarked });
      },
      remove: (id) => {
        setEntries((prev) => prev.filter((x) => x.id !== id));
        if (payEnabled) api(`/library/${id}`, undefined, 'DELETE').catch(() => setSyncError('계정에서 지우지 못했어요.'));
      },
      clearLocal: () => {
        setEntries([]);
        writeStored(KEY, []);
        writeStored('favorites', []);
      },
      signIn: async (provider = 'google', back) => {
        setSyncError(null);
        access.signIn(provider, back);
      },
      signOut: async () => {
        await access.signOut();
        if (payEnabled) setEntries([]);
      },
    }),
    [entries, user, access, syncError, record, upsert],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary(): Library {
  const v = useContext(Ctx);
  if (!v) throw new Error('LibraryProvider missing');
  return v;
}
