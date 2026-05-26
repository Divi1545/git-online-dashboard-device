# CLAUDE.md — Kiyanna AI Hardware Dashboard

## Owner
Divindu Edirisinghe — AI Code Agency Pvt Ltd, Sri Lanka

## What This Project Is
Operator dashboard for Kiyanna AI hardware devices (MUMA ESP32-S3 / AiDesk S1).
Operators are businesses (hotels, clinics, restaurants) subscribed to hardware device plans.

## Tech Stack
- Framework: Next.js 14 (App Router), TypeScript
- Styling: Tailwind CSS, shadcn/ui
- Database: Supabase (PostgreSQL + RLS)
- Auth: Supabase Auth (@supabase/ssr)
- AI: Anthropic Claude API ONLY — NEVER OpenAI
- Realtime: Supabase Realtime (device status updates)
- Font: Barlow (via next/font/google)
- Charts: Recharts
- Hosting: Vercel

## Critical Rules
1. NEVER use OpenAI — Anthropic only
2. NEVER poll for device status — use Supabase Realtime only
3. Admin is identified by ADMIN_EMAIL env var — NEVER hardcode email
4. Service role key ONLY in Server Components and API routes — never client-side
5. Dark theme throughout — bg-[#0A0A0A], sidebar bg-[#111111], cards bg-[#1A1A1A]
6. Teal accent: #0D9488, Amber: #F59E0B, Red: #EF4444
7. Push changes to: Divi1545/ai-hardware

## Routes
- /login — Auth page
- /dashboard — Fleet overview with Supabase Realtime device updates
- /dashboard/device/[id] — Device detail, conversations, analytics
- /dashboard/inquiries — Admin only: hardware inquiries table
- /dashboard/settings — Account settings
