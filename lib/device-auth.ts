import jwt from 'jsonwebtoken'

export interface DeviceTokenPayload {
  device_id: string
  plan: string
  region: string
  expires_at: string
}

export function signDeviceToken(payload: DeviceTokenPayload): string {
  const secret = process.env.DEVICE_JWT_SECRET!
  return jwt.sign(payload, secret, { expiresIn: '24h' })
}

export function verifyDeviceToken(token: string): DeviceTokenPayload {
  const secret = process.env.DEVICE_JWT_SECRET!
  return jwt.verify(token, secret) as DeviceTokenPayload
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}
