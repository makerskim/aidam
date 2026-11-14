/**
 * 출시 전 잠금 화면.
 * SITE_MODE가 closed인 동안에는 관리자 계정으로 로그인한 사람에게만 사이트 파일을 준다.
 * 그 밖의 사람에게는 이 화면만 나가므로, 사이트 코드(이름 계산 포함) 자체가 바깥으로 나가지 않는다.
 */
const LOCK_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const page = (body: string) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>아이담 · 준비 중</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#1b1e26;font-family:-apple-system,BlinkMacSystemFont,system-ui,'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif}
  main{max-width:340px;padding:32px 24px;text-align:center}
  b.brand{display:block;font-size:40px;letter-spacing:-.02em}
  span.en{display:block;color:#d63a55;letter-spacing:.3em;font-size:12px;font-weight:700;margin-top:4px}
  h1{font-size:20px;margin:28px 0 8px}
  p{color:#50576a;line-height:1.6;margin:0 0 24px;word-break:keep-all}
  a.btn,button{display:block;width:100%;box-sizing:border-box;padding:14px 16px;border-radius:999px;border:1.5px solid #e9ebef;background:#fff;color:#1b1e26;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
  small{display:block;color:#6b7280;margin-top:16px}
</style>
</head>
<body><main><b class="brand">아이담</b><span class="en">AIDAM</span>${body}</main></body>
</html>`;

export const LOCK = {
  csp: LOCK_CSP,
  /** 로그인하지 않은 사람 */
  guest: (googleReady: boolean) =>
    page(
      `<h1>준비 중이에요</h1><p>아이의 이름에 의미를 담는 작명 서비스를 준비하고 있어요. 곧 만나요.</p>` +
        (googleReady ? `<a class="btn" href="/api/auth/google/start">관리자 로그인</a>` : `<small>관리자 로그인 설정이 아직 없어요.</small>`),
    ),
  /** 로그인했지만 관리자가 아닌 사람 */
  notAdmin: () =>
    page(`<h1>아직 준비 중이에요</h1><p>지금은 관리자만 들어올 수 있어요. 문을 열면 다시 찾아 주세요.</p><form method="post" action="/api/auth/logout"><button type="submit">로그아웃</button></form>`),
};
