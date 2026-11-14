/**
 * 계정·결제 상태(서버 /api/me 한 곳에서 온다).
 * - 서버 주소(VITE_API_BASE, 예: /api)가 없으면 '미리보기': 서버 없이 모두 열리고, 미리보기 계정은 이 기기에만 있다.
 * - 있으면: Google·카카오로 로그인하고, 분석(열쇠)마다 "첫 1회 무료 → 그 뒤 990원"으로 연다.
 *   관리자 계정도 똑같이 잠겨 있고, 휴대폰으로 받은 관리자 번호를 넣으면 결제 없이 열린다.
 * - 로그인 상태는 자바스크립트가 읽지 못하는 쿠키에 있다. 이 화면은 서버가 서명한 답만 믿는다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readStored, writeStored } from './storage';
import { covers } from './ticket';

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';
/** 서버(로그인·결제)가 연결되어 있는지 */
export const payEnabled = API_BASE !== '';
/** 맛보기로 보여 주는 추천 이름 수 */
export const FREE_NAMES = 3;

export type Provider = 'google' | 'kakao';

export interface CloudUser {
  uid: string;
  name: string | null;
  email: string | null;
  photo: string | null;
  provider?: Provider;
}

export interface Plan {
  /** 분석 1회 가격(원) */
  amount: number;
  orderName: string;
}

/** 서버가 주는 계정 상태(서명 포함) */
export interface Me {
  user: { id: string; name: string | null; email: string | null; photo: string | null; provider: Provider } | null;
  uid?: string;
  iat?: number;
  /** 서버 서명(위조 방지) */
  sig?: string | null;
  admin?: boolean;
  adminUntil?: number;
  keys?: string[];
  /** 무료 1회가 남았는지(1 또는 0) */
  freeLeft?: number;
  plan: Plan;
  /** off: 결제 준비 중 / test: 시험 결제 / live: 실제 결제 */
  payMode: 'off' | 'test' | 'live';
  login: { google: boolean; kakao: boolean };
  codeChannel?: 'sms' | 'push' | null;
}

interface Access {
  /** 서버(로그인·결제)가 연결되어 있는지 */
  enabled: boolean;
  /** 서버 답을 한 번이라도 받았는지 */
  ready: boolean;
  loading: boolean;
  user: CloudUser | null;
  /** 서버 없이 쓰는 미리보기 계정인지 */
  isPreview: boolean;
  /** 이 분석(열쇠)을 전부 볼 수 있는지 */
  can: (ticket: string) => boolean;
  /** 무료 1회가 남았는지 */
  freeLeft: boolean;
  /** 무료 1회로 이 분석을 연다 */
  claim: (ticket: string) => Promise<void>;
  admin: boolean;
  adminOn: boolean;
  adminUntil: number;
  codeChannel: 'sms' | 'push' | null;
  plan: Plan | null;
  payMode: 'off' | 'test' | 'live';
  login: { google: boolean; kakao: boolean };
  error: string | null;
  refresh: () => Promise<void>;
  /** 결제·관리자 번호 확인 뒤 서버가 준 새 상태를 바로 반영한다 */
  apply: (me: Me) => Promise<void>;
  /** 로그인 화면으로 간다. back: 로그인 뒤 돌아올 화면 */
  signIn: (provider: Provider, back?: string) => void;
  signOut: () => Promise<void>;
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

/** 서버 호출. 로그인 쿠키는 브라우저가 알아서 붙인다 */
export async function api<T>(path: string, body?: unknown, method?: 'GET' | 'POST' | 'PUT' | 'DELETE'): Promise<T> {
  const m = method ?? (body === undefined ? 'GET' : 'POST');
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: m,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(data.error ?? 'ERROR', data.message ?? '잠시 문제가 생겼어요.', res.status);
  return data as T;
}

/** 서버 서명을 확인할 공개 키(빌드할 때 넣는다). 없으면 확인을 건너뛴다(내 컴퓨터에서 시험할 때) */
const PUB_JWK = (import.meta.env.VITE_ENTITLE_PUB as string | undefined) ?? '';
let pubKey: Promise<CryptoKey> | null = null;
const DAY = 86_400_000;

/**
 * 서버가 서명한 상태인지 확인한다. 확인되지 않으면 아무것도 열리지 않은 상태로 돌려준다.
 * 브라우저에서 서버 답을 가짜로 바꾸거나, 오래된 답을 다시 써도 잠금이 풀리지 않는다.
 */
async function verified(me: Me): Promise<Me> {
  const keys = Array.isArray(me.keys) ? me.keys.filter((k) => typeof k === 'string') : [];
  const clean: Me = { ...me, keys, adminUntil: Number(me.adminUntil) || 0, admin: me.admin === true };
  if (!PUB_JWK || !me.user) return clean;
  const locked: Me = { ...clean, admin: false, adminUntil: 0, keys: [], freeLeft: clean.freeLeft };
  try {
    const now = Date.now();
    if (!me.sig || !me.iat || !me.uid || me.uid !== me.user.id || me.iat < now - DAY || me.iat > now + DAY) return locked;
    pubKey ??= crypto.subtle.importKey('jwk', JSON.parse(PUB_JWK) as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = Uint8Array.from(atob(me.sig.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    // 서버(apps/worker/src/sign.ts accessMessage)와 똑같이 만든다
    const msg = `aidam-access-3|${me.uid}|${clean.admin ? 1 : 0}|${clean.adminUntil}|${me.iat}|${keys.join(',')}`;
    return (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await pubKey, sig, new TextEncoder().encode(msg))) ? clean : locked;
  } catch {
    return locked;
  }
}

const PREVIEW_KEY = 'preview-user';
const PREVIEW_USER: CloudUser = { uid: 'preview', name: '미리보기 계정', email: null, photo: null };
/** 로그인 화면에 다녀온 뒤 돌아갈 화면 */
export const AFTER_LOGIN = 'aidam:after-login';

export function AccessProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(!payEnabled);
  const [loading, setLoading] = useState(payEnabled);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<boolean>(() => !payEnabled && Boolean(readStored(PREVIEW_KEY, false)));

  const apply = useCallback(async (raw: Me) => setMe(await verified(raw)), []);

  const refresh = useCallback(async () => {
    if (!payEnabled) return;
    setLoading(true);
    setError(null);
    try {
      await apply(await api<Me>('/me'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '계정을 확인하지 못했어요.');
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback((provider: Provider, back?: string) => {
    if (!payEnabled) {
      writeStored(PREVIEW_KEY, true);
      setPreview(true);
      return;
    }
    try {
      sessionStorage.setItem(AFTER_LOGIN, back ?? window.location.hash.slice(1) ?? '/');
    } catch {
      /* 저장이 막힌 환경 */
    }
    window.location.assign(`${API_BASE}/auth/${provider}/start`);
  }, []);

  const signOut = useCallback(async () => {
    if (!payEnabled) {
      writeStored(PREVIEW_KEY, false);
      setPreview(false);
      return;
    }
    await api('/auth/logout', {}).catch(() => undefined);
    await refresh();
  }, [refresh]);

  const claim = useCallback(
    async (ticket: string) => {
      const r = await api<{ me: Me }>('/ticket/claim', { key: ticket });
      await apply(r.me);
    },
    [apply],
  );

  const value = useMemo<Access>(() => {
    const u = me?.user;
    const user: CloudUser | null = payEnabled ? (u ? { uid: u.id, name: u.name, email: u.email, photo: u.photo, provider: u.provider } : null) : preview ? PREVIEW_USER : null;
    const admin = Boolean(me?.admin);
    const adminUntil = me?.adminUntil ?? 0;
    const adminOn = admin && adminUntil > Date.now();
    const keys = me?.keys ?? [];
    return {
      enabled: payEnabled,
      ready,
      loading,
      user,
      isPreview: !payEnabled && preview,
      can: (ticket: string) => !payEnabled || adminOn || covers(keys, ticket),
      freeLeft: Boolean(user) && (me?.freeLeft ?? 0) > 0,
      claim,
      admin,
      adminOn,
      adminUntil,
      codeChannel: me?.codeChannel ?? null,
      plan: me?.plan ?? null,
      payMode: me?.payMode ?? 'off',
      login: me?.login ?? { google: !payEnabled, kakao: false },
      error,
      refresh,
      apply,
      signIn,
      signOut,
    };
  }, [me, ready, loading, preview, error, refresh, apply, signIn, signOut, claim]);
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
