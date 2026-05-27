'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createBrowserClient } from '@/lib/supabase/client'
import {
  LayoutGrid,
  Cpu,
  MessageSquare,
  Settings,
  Menu,
  LogOut,
  ChevronDown,
  Bot,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DashboardShellProps {
  children: React.ReactNode
  user: {
    email: string
    isAdmin: boolean
  }
}

const navItems = [
  { href: '/dashboard', label: 'Fleet Overview', icon: LayoutGrid },
  { href: '/dashboard/devices', label: 'Devices', icon: Cpu },
  { href: '/dashboard/receptionist', label: 'AI Receptionist', icon: Bot },
  { href: '/dashboard/inquiries', label: 'Inquiries', icon: MessageSquare, adminOnly: true },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function DashboardShell({ children, user }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createBrowserClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const visibleNav = navItems.filter((item) => !item.adminOnly || user.isAdmin)

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <div>
            <p className="font-semibold text-white text-sm leading-tight">Kiyanna AI</p>
            <p className="text-white/40 text-xs">Hardware Division</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {visibleNav.map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                isActive
                  ? 'bg-teal-600/10 text-teal-400 border-l-2 border-teal-600 pl-[10px]'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
              {item.adminOnly && (
                <Badge className="ml-auto text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                  Admin
                </Badge>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-white/5">
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors bg-transparent border-0 cursor-pointer">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarFallback className="bg-teal-600 text-white text-xs">
                  {user.email.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs text-white truncate">{user.email}</p>
                {user.isAdmin && (
                  <p className="text-[10px] text-teal-400">Admin</p>
                )}
              </div>
              <ChevronDown className="w-3 h-3 text-white/30 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-[#1A1A1A] border-white/10 text-white w-48"
          >
            <DropdownMenuSeparator className="bg-white/5" />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-red-400 hover:bg-white/5 cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-[#0A0A0A] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-[#111111] border-r border-white/5 shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-60 bg-[#111111] border-r border-white/5">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-white/5 px-4 flex items-center justify-between bg-[#111111] shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-white/50 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <Badge
              className={cn(
                'text-xs',
                user.isAdmin
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-teal-600/20 text-teal-400 border-teal-600/30'
              )}
            >
              {user.isAdmin ? 'Admin' : 'Operator'}
            </Badge>
            <span className="text-white/50 text-sm hidden sm:block">{user.email}</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
