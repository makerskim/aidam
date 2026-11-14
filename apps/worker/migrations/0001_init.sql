-- 아이담 서버 저장소(Cloudflare D1). 계정·로그인·분석 열쇠·주문·저장한 이름.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,          -- google | kakao
  sub TEXT NOT NULL,               -- 그 서비스에서의 계정 번호
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  photo TEXT,
  created_at INTEGER NOT NULL,
  last_login INTEGER NOT NULL,
  UNIQUE (provider, sub)
);

-- 로그인 상태. id는 쿠키에 든 값의 해시(쿠키 값 자체는 저장하지 않는다)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  admin_until INTEGER NOT NULL DEFAULT 0   -- 관리자 번호를 넣은 뒤 결제 없이 쓰는 끝 시각
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- 계정이 가진 분석 열쇠. source: free(첫 1회 무료) | paid(결제)
CREATE TABLE IF NOT EXISTS tickets (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  source TEXT NOT NULL,
  order_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,            -- ready | done
  payment_key TEXT,
  method TEXT,
  created_at INTEGER NOT NULL,
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS orders_user ON orders (user_id);

-- 저장한 이름·검색 기록
CREATE TABLE IF NOT EXISTS library (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  hangul TEXT NOT NULL,
  hanja TEXT NOT NULL,
  total REAL NOT NULL,
  grade TEXT NOT NULL,
  query TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  bookmarked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

-- 관리자 번호(일회용). 번호 자체가 아니라 해시만 둔다
CREATE TABLE IF NOT EXISTS otp (
  user_id TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);

-- 내 컴퓨터의 Claude Code 연결 화면으로 로그인 상태를 넘길 때 쓰는 일회용 값
CREATE TABLE IF NOT EXISTS handoff (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  admin_until INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);

-- 요청 횟수 제한
CREATE TABLE IF NOT EXISTS rate (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

-- 서버 설정값(서명 키 등)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
