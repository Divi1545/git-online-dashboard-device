type IslandLoafDeviceConfig = {
  url: string
  agentKey: string
}

type DeviceConfigMap = Record<string, IslandLoafDeviceConfig>

function configs(): DeviceConfigMap {
  const raw = process.env.ISLANDLOAF_DEVICE_CONFIG_JSON
  if (!raw) return {}
  try {
    return JSON.parse(raw) as DeviceConfigMap
  } catch {
    console.error('[islandloaf] ISLANDLOAF_DEVICE_CONFIG_JSON is invalid JSON')
    return {}
  }
}

export function hasIslandLoafDevice(deviceId: string): boolean {
  return Boolean(configs()[deviceId])
}

export async function callIslandLoaf(
  deviceId: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const config = configs()[deviceId]
  if (!config?.url || !config?.agentKey) {
    throw new Error('This Kiyanna device is not connected to an Island Loaf hotel')
  }

  const response = await fetch(`${config.url.replace(/\/$/, '')}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      'x-agent-key': config.agentKey,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12_000),
  })

  const result = await response.json().catch(() => ({ error: `Island Loaf returned HTTP ${response.status}` })) as Record<string, unknown>
  if (!response.ok || result.success === false) {
    throw new Error(typeof result.error === 'string' ? result.error : `Island Loaf returned HTTP ${response.status}`)
  }
  return result
}
