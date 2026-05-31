# Kiyanna AI Hardware Dashboard — Session Log
**Date:** 2026-05-31  
**Project:** `git-online-dashboard-device` (Divi1545/git-online-dashboard-device)  
**Live URL:** https://git-online-dashboard-device.vercel.app  
**Stack:** Next.js 14, Supabase, Vercel, ESP32-S3 (PlatformIO)

---

## 1. Supabase MCP Connected
- Added Supabase MCP server to `~/.claude/settings.json`
- Project ref: `oykjhygrytgdvfyxzgrx`

---

## 2. Dashboard Stuck on Login — Fixed

**Root cause:** `router.push('/dashboard')` was called after login without `router.refresh()`. Next.js App Router keeps a server component cache, so the middleware still saw the unauthenticated state and redirected back to `/login` in a loop.

**Fix:** `app/login/page.tsx`
```diff
- router.push('/dashboard')
+ router.refresh()
+ router.push('/dashboard')
```

**Commit:** `e660acf`

---

## 3. Supabase Client Error — Fixed

**Error:** `@supabase/ssr: Your project's URL and API key are required`

**Root cause:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` was missing from Vercel environment variables. `NEXT_PUBLIC_*` vars are baked into the JS bundle at build time — old cached builds didn't have it.

**Fix:**
- Added `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel Production
- Force redeployed (`vercel --prod --force`) to skip build cache

---

## 4. Admin Access Hidden — Fixed

**Root cause:** `ADMIN_EMAIL` env var in Vercel was set to `divindu@aicodeagency.org` but the actual login email is `aicodeagency@gmail.com`. The `isAdmin` check failed, hiding the **Program Device** button and using the RLS-restricted Supabase client.

**Fix:**
- Removed old `ADMIN_EMAIL` from Vercel
- Added correct `ADMIN_EMAIL=aicodeagency@gmail.com`
- Redeployed

---

## 5. Firmware API URL — Fixed

**Root cause:** `firmware/kiyanna-esp32/src/config.h` had the wrong API base URL pointing to an old/non-existent deployment.

**Fix:** `firmware/kiyanna-esp32/src/config.h`
```diff
- #define API_BASE_URL "https://ai-hardware-two.vercel.app"
+ #define API_BASE_URL "https://git-online-dashboard-device.vercel.app"
```

**Commit:** `fc0734e`

---

## 6. ESP32-S3 Device Flashed & Online

- Device: **KIYANNA-001** (AiDesk S1 — Galle Fort Hotel Lobby)
- Connected via USB at `/dev/cu.usbmodem101`
- Flashed using PlatformIO: `pio run --target upload`
- Device authenticated successfully and went **ONLINE** in dashboard
- Supabase confirmed: `status: "online"`, `last_seen: 2026-05-31T03:18:13Z`

---

## 7. Device Page Navigation — Fixed

**Root cause:** No `loading.tsx` files existed. Next.js App Router with `force-dynamic` runs all server queries before rendering anything, causing the page to appear frozen/unresponsive during navigation. Device detail page also ran 4 Supabase queries sequentially.

**Fixes:**
- Created `app/dashboard/loading.tsx` — skeleton for fleet overview
- Created `app/dashboard/device/[id]/loading.tsx` — skeleton for device detail
- Parallelized all device detail queries with `Promise.all()`
- Changed `.single()` to `.maybeSingle()` on subscription query (prevents error when no subscription exists)

**Commit:** `f3cbfc1`

---

## Supabase Database
| Table | Status |
|---|---|
| `hardware_devices` | 2 devices (KIYANNA-001, KIYANNA-002) |
| `hardware_subscriptions` | exists |
| `hardware_conversations` | exists, empty |

**Devices:**
| Device ID | Product | Location | Status |
|---|---|---|---|
| KIYANNA-001 | AiDesk S1 | Galle Fort Hotel Lobby | Online |
| KIYANNA-002 | AiDesk S1 | Colombo Clinic Reception | Offline |

---

## Vercel Environment Variables
| Variable | Environment |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview |
| `ADMIN_EMAIL` | Production |
| `ADMIN_REGISTER_KEY` | Production, Preview |
| `DEVICE_JWT_SECRET` | Production, Preview |
| `ANTHROPIC_API_KEY` | Production, Preview |

---

## How to Flash a New Device

1. Edit `firmware/kiyanna-esp32/src/config.h`:
   ```c
   #define DEVICE_ID      "KIYANNA-XXX"
   #define DEVICE_SECRET  "your-secret"
   #define WIFI_SSID      "your-wifi"
   #define WIFI_PASSWORD  "your-password"
   ```
2. Connect ESP32-S3 via USB
3. Run: `cd firmware/kiyanna-esp32 && pio run --target upload`
4. Device auto-registers → appears in dashboard as ONLINE

---

## Git Commits This Session
| Commit | Description |
|---|---|
| `e660acf` | fix: add router.refresh() before push to resolve login redirect loop |
| `fc0734e` | fix: update API_BASE_URL to correct production domain |
| `f3cbfc1` | fix: add loading skeletons and parallelize device queries for instant navigation |
