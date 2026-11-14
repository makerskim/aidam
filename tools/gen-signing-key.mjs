// 이용권 서명 키 한 쌍을 만든다(배포 워크플로가 처음 한 번 쓴다). 출력: {"private":JWK,"public":JWK}
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = async (k) => {
  const { kty, crv, x, y, d } = await crypto.subtle.exportKey('jwk', k);
  return d ? { kty, crv, x, y, d } : { kty, crv, x, y };
};
process.stdout.write(JSON.stringify({ private: await jwk(kp.privateKey), public: await jwk(kp.publicKey) }));
