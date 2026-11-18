import argon2 from "argon2";

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword);
}

export async function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    // argon2.verify throws on a malformed hash rather than returning false.
    return false;
  }
}
