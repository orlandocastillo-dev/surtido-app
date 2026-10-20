/**
 * Contraseñas con PBKDF2 (Web Crypto, nativo del navegador): nunca se guarda la contraseña,
 * solo un hash con sal aleatoria por usuario y 150.000 iteraciones.
 */
const ITERATIONS = 150_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export function newSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt) as BufferSource, iterations: ITERATIONS },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

/** Comparación en tiempo constante para no filtrar información por la duración. */
export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await hashPassword(password, salt);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}
