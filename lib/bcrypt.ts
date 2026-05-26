import bcryptjs from 'bcryptjs'

export async function hashSecret(secret: string): Promise<string> {
  return bcryptjs.hash(secret, 10)
}

export async function compareSecret(secret: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(secret, hash)
}
