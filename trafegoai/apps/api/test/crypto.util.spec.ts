import { encryptToken, decryptToken } from '../src/common/crypto.util';

describe('crypto.util — tokens OAuth em repouso (AES-256-GCM)', () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef'; // 32 bytes hex-ish
  });

  it('faz round-trip encrypt → decrypt', () => {
    const plain = 'ya29.super-secret-oauth-token';
    const enc = encryptToken(plain);
    expect(enc).toMatch(/^enc:/);
    expect(enc).not.toContain(plain); // nunca em texto plano
    expect(decryptToken(enc)).toBe(plain);
  });

  it('gera ciphertexts diferentes para o mesmo texto (IV aleatório)', () => {
    const a = encryptToken('mesmo-valor');
    const b = encryptToken('mesmo-valor');
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe('mesmo-valor');
    expect(decryptToken(b)).toBe('mesmo-valor');
  });

  it('passa tokens legados/mock sem prefixo enc: adiante', () => {
    expect(decryptToken('mock:encrypted')).toBe('mock:encrypted');
  });
});
