/**
 * Criptografia de tokens OAuth em repouso (LGPD).
 * AES-256-GCM com chave de 32 bytes vinda de TOKEN_ENCRYPTION_KEY (hex).
 * Formato armazenado: enc:<iv hex>:<authTag hex>:<ciphertext hex>
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function key(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    // fallback dev: deriva 32 bytes do valor bruto (NÃO usar em produção)
    return Buffer.alloc(32, hex || 'dev');
  }
  return buf;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `enc:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith('enc:')) return stored; // tokens mock do seed
  const [, ivHex, tagHex, dataHex] = stored.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
