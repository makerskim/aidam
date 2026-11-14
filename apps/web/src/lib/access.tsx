/**
 * 결제(분석 1건 = 1회)와 관리자 확인.
 * - 서버 주소(VITE_API_BASE, 예: /api)가 없으면 결제 없이 모두 열린다(미리보기·옛 배포).
 * - 있으면: 그 분석의 열쇠를 결제했거나, 관리자 번호로 관리자 모드를 켰을 때만 전부 열린다.
 *   그 밖에는 '맛보기'(추천 3개, 총평)만 보인다. 관리자 계정도 번호를 넣기 전에는 똑같이 잠겨 있다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cloudConfigured, getIdToken } from './cloud';
import { useLibrary } from './library';
import { covers } from './ticket';

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';
export const payEnabled = API_BASE !== '';
/** 맛보기로 보여 주는 추천 이름 수 */
export const FREE_NAMES = 3;

export interface Plan {
  /** 분석 1회 가격(원) */
  amount: number;
  orderName: string;
}

/** 서버가 주는 계정 상태(서명 포함) */
export interface Me {
  uid?: string;
  iat?: number;
  /** 서버 서명(위조 방지) */
  sig?: string | null;
  /** 관리자 계정인지 */
  admin: boolean;
  /** 관리자 모드가 끝나는 시각(없으면 0) */
  adminUntil: number;
  /** 결제한 분석 열쇠 */
  keys: string[];
  ai: { left: number; limit: number };
  plan: Plan;
  /** 관리자 번호를 받는 길: 문자 / 휴대폰 알림 / 설정 없음 */
  codeChannel?: 'sms' | 'push' | null;
}

interface Access {
  /** 결제 기능이 켜져 있는지(서버 주소가 있을 때) */
  enabled: boolean;
  /** 서버 확인 중 */
  loading: boolean;
  /** 이 분석(열쇠)을 전부 볼 수 있는지 */
  can: (ticket: string) => boolean;
  /** 관리자 계정인지 */
  admin: boolean;
  /** 관리자 번호를 넣어 결제 없이 쓰는 중인지 */
  adminOn: boolean;
  adminUntil: number;
  codeChannel: 'sms' | 'push' | null;
  plan: Plan | null;
  payReady: boolean;
  aiReady: boolean;
  ai: { left: number; limit: number } | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** 결제·관리자 번호 확인 뒤 서버가 준 새 상태를 바로 반영한다 */
  apply: (me: Me, replace?: boolean) => Promise<void>;
  setAiLeft: (left: number) => void;
}

const Ctx = createContext<Access | null>(null);

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** 서버 호출: 로그인 토큰을 붙인다 */
export async function api<T>(path: string, body?: unknown, token?: string | null): Promise<T> {
  // 로그인 설정이 없는 미리보기 빌드는 시험용 토큰을 쓴다(실제 서버는 받지 않는다)
  const tok = token === undefined ? (cloudConfigured ? await getIdToken() : 'preview-token') : token;
  const headers: Record<string, string> = {};
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('NETWORK', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(data.error ?? 'ERROR', data.message ?? '잠시 문제가 생겼어요.', res.status);
  return data as T;
}

/** 서버 서명을 확인할 공개 키(빌드할 때 넣는다). 없으면 확인을 건너뛴다(미리보기·시험용) */
const PUB_JWK = (import.meta.env.VITE_ENTITLE_PUB as string | undefined) ?? '';
let pubKey: Promise<CryptoKey> | null = null;

/**
 * 서버가 서명한 상태인지 확인한다. 확인되지 않으면 아무것도 열리지 않은 상태로 돌려준다.
 * 브라우저에서 서버 답을 가짜로 바꿔도 서명이 맞지 않아 잠금이 풀리지 않는다.
 */
async function verified(me: Me, uid: string): Promise<{ me: Me; ok: boolean }> {
  const keys = Array.isArray(me.keys) ? me.keys.filter((k) => typeof k === 'string') : [];
  const clean: Me = { ...me, keys, adminUntil: Number(me.adminUntil) || 0, admin: me.admin === true };
  if (!PUB_JWK) return { me: clean, ok: true };
  const locked: Me = { ...clean, admin: false, adminUntil: 0, keys: [] };
  try {
    if (!me.sig || !me.iat || me.uid !== uid) return { me: locked, ok: false };
    pubKey ??= crypto.subtle.importKey('jwk', JSON.parse(PUB_JWK) as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = Uint8Array.from(atob(me.sig.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    // 서버(apps/worker/src/sign.ts accessMessage)와 똑같이 만든다
    const msg = `aidam-access-2|${me.uid}|${clean.admin ? 1 : 0}|${clean.adminUntil}|${me.iat}|${keys.join(',')}`;
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await pubKey, sig, new TextEncoder().encode(msg));
    return ok ? { me: clean, ok: true } : { me: locked, ok: false };
  } catch {
    return { me: locked, ok: false };
  }
}

/**
 * 마지막으로 확인된 상태를 이 기기에 둔다.
 * 서버 저장소가 방금 결제한 열쇠를 잠깐 늦게 돌려줘도(최대 1분), 이미 받은 서명된 열쇠는 계속 인정한다.
 */
const cacheKey = (uid: string) => `aidam:me:${uid}`;
function readCache(uid: string): Me | null {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}
function writeCache(uid: string, me: Me) {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(me));
  } catch {
    /* 저장이 막힌 환경 */
  }
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const lib = useLibrary();
  const [conf, setConf] = useState<{ plan: Plan; payReady: boolean; aiReady: boolean } | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(payEnabled);
  const [error, setError] = useState<string | null>(null);
  const uid = lib.user?.uid ?? null;

  useEffect(() => {
    if (!payEnabled) return;
    api<{ plan: Plan; payReady: boolean; aiReady: boolean }>('/config', undefined, null)
      .then(setConf)
      .catch(() => undefined);
  }, []);

  /** 서버가 준 상태를 확인해 반영한다. replace가 아니면 이 기기에 둔 확인된 열쇠와 합친다 */
  const apply = useCallback(
    async (raw: Me, replace = false) => {
      if (!uid) return;
      const fresh = await verified(raw, uid);
      let next = fresh.me;
      if (fresh.ok && !replace) {
        const old = readCache(uid);
        const prev = old ? await verified(old, uid) : null;
        if (prev?.ok) {
          // 열쇠는 늘어나기만 하므로 합친다. 서명된 것만 합쳐지므로 가짜는 끼어들 수 없다
          next = { ...next, keys: [...new Set([...next.keys, ...prev.me.keys])], adminUntil: next.admin ? Math.max(next.adminUntil, prev.me.adminUntil) : 0 };
        }
      }
      // 서버 답이 이 기기에 둔 것보다 적으면(잠깐 늦은 답) 둔 것을 그대로 지킨다
      const stale = next.keys.length > fresh.me.keys.length;
      if (fresh.ok && (replace || !stale)) writeCache(uid, raw);
      setMe(next);
    },
    [uid],
  );

  const refresh = useCallback(async () => {
    if (!payEnabled) return;
    if (!uid) {
      setMe(null);
      setLoading(!lib.cloudReady);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 미리보기 계정(로그인 설정 없는 빌드)은 시험용 토큰을 쓴다
      const tok = lib.isPreview ? 'preview-token' : await getIdToken();
      await apply(await api<Me>('/me', undefined, tok));
    } catch (e) {
      setMe(null);
      setError(e instanceof Error ? e.message : '결제 내역을 확인하지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, [uid, lib.cloudReady, lib.isPreview, apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setAiLeft = useCallback((left: number) => setMe((m) => (m ? { ...m, ai: { ...m.ai, left } } : m)), []);

  const value = useMemo<Access>(() => {
    const admin = Boolean(me?.admin);
    const adminUntil = me?.adminUntil ?? 0;
    const adminOn = admin && adminUntil > Date.now();
    const keys = me?.keys ?? [];
    return {
      enabled: payEnabled,
      loading,
      can: (ticket: string) => !payEnabled || adminOn || covers(keys, ticket),
      admin,
      adminOn,
      adminUntil,
      codeChannel: me?.codeChannel ?? null,
      plan: me?.plan ?? conf?.plan ?? null,
      payReady: conf?.payReady ?? false,
      aiReady: payEnabled && (conf?.aiReady ?? false),
      ai: me?.ai ?? null,
      error,
      refresh,
      apply,
      setAiLeft,
    };
  }, [loading, me, conf, error, refresh, apply, setAiLeft]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccess(): Access {
  const v = useContext(Ctx);
  if (!v) throw new Error('AccessProvider가 필요해요');
  return v;
}

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
/** 날짜와 시각 */
export const timeKo = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours() < 12 ? '오전' : '오후'} ${d.getHours() % 12 || 12}시 ${String(d.getMinutes()).padStart(2, '0')}분`;
};
