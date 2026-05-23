import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Home,
  BarChart3,
  Wallet,
  Archive,
  MessageSquare,
  Settings,
  UserPlus,
  Users,
  Menu,
} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import AppShellBackground from '@/components/layout/AppShellBackground'
import NavBadgeDot from '@/components/layout/NavBadgeDot'
import { NavBadgesProvider, useNavBadges, type NavBadgePath } from '@/contexts/NavBadgesContext'
import { cn } from '@/lib/utils'

type NavItem = { path: string; icon: LucideIcon; label: string }

const mainNavItems: NavItem[] = [
  { path: '/', icon: Home, label: 'Pulse' },
  { path: '/decision', icon: BarChart3, label: 'Decide' },
  { path: '/tab', icon: Wallet, label: 'Tab' },
  { path: '/vault', icon: Archive, label: 'Vault' },
  { path: '/profile', icon: Settings, label: 'Profile' },
]

const moreNavItems: NavItem[] = [
  { path: '/friends', icon: UserPlus, label: 'Friends' },
  { path: '/groups', icon: Users, label: 'Groups' },
  { path: '/ai', icon: MessageSquare, label: 'Chat' },
]

function routeIsActive(path: string, pathname: string): boolean {
  if (path === '/ai') {
    return pathname === '/ai' || pathname === '/concierge'
  }
  return pathname === path
}

function moreMenuIsActive(pathname: string): boolean {
  return moreNavItems.some((item) => routeIsActive(item.path, pathname))
}

function LayoutShell() {
  const location = useLocation()
  const [moreSheetOpen, setMoreSheetOpen] = useState(false)
  const badges = useNavBadges()

  const badgeFor = (path: string): boolean => {
    if (path in badges) return badges[path as NavBadgePath]
    return false
  }

  return (
    <div className="relative isolate min-h-screen flex flex-col lg:flex-row">
      <AppShellBackground />
      <Toaster richColors position="top-center" />
      {/* Desktop Sidebar */}
      <aside className="relative z-10 hidden lg:flex w-16 flex-col items-center py-4 border-r border-sidebar-border bg-sidebar/85 backdrop-blur-md">
        <div className="mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-2">
          {mainNavItems.map((item) => {
            const isActive = routeIsActive(item.path, location.pathname)
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200',
                  isActive
                    ? 'bg-primary/20 text-primary glow-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                )}
              >
                <item.icon className="w-5 h-5" />
                <NavBadgeDot show={badgeFor(item.path)} className="top-2 right-2" />
              </NavLink>
            )
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  moreMenuIsActive(location.pathname)
                    ? 'bg-primary/20 text-primary glow-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                )}
                aria-label="More navigation"
              >
                <Menu className="w-5 h-5" />
                <NavBadgeDot show={badges.more} className="top-2 right-2" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-48">
              {moreNavItems.map((item) => (
                <DropdownMenuItem key={item.path} asChild>
                  <NavLink
                    to={item.path}
                    className={cn(
                      'relative flex cursor-pointer items-center gap-2',
                      routeIsActive(item.path, location.pathname) && 'bg-accent',
                    )}
                  >
                    <item.icon className="size-4 opacity-80" />
                    {item.label}
                    <NavBadgeDot
                      show={badgeFor(item.path)}
                      className="top-1/2 right-1 -translate-y-1/2 ring-sidebar"
                    />
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="relative z-10 flex flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border/80 bg-card/40 px-4 backdrop-blur-xl lg:px-6">
          <div className="flex items-center gap-3">
            <div className="lg:hidden w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">The Huddle</h1>
          </div>
          <NavLink
            to="/ai"
            aria-label="Group chat"
            className={cn(
              'relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200',
              location.pathname === '/ai' || location.pathname === '/concierge'
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
            )}
          >
            <MessageSquare className="w-5 h-5" />
            <NavBadgeDot show={badgeFor('/ai')} className="top-0.5 right-0.5" />
          </NavLink>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 lg:pb-6 w-full">
          <div className="w-full max-w-4xl mx-auto px-4 lg:px-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border/80 bg-card/55 px-1 backdrop-blur-xl lg:hidden">
        {mainNavItems.map((item) => {
          const isActive = routeIsActive(item.path, location.pathname)
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'relative flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-all duration-200 min-w-0 flex-1 max-w-[4.5rem]',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className="relative">
                <item.icon className={cn('w-5 h-5 shrink-0', isActive && 'glow-primary')} />
                <NavBadgeDot show={badgeFor(item.path)} className="-top-0.5 -right-1" />
              </span>
              <span className="text-[11px] font-medium truncate w-full text-center">
                {item.label}
              </span>
            </NavLink>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreSheetOpen(true)}
          className={cn(
            'relative flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-all duration-200 min-w-0 flex-1 max-w-[4.5rem]',
            moreMenuIsActive(location.pathname) ? 'text-primary' : 'text-muted-foreground',
          )}
          aria-label="Open more navigation"
        >
          <span className="relative">
            <Menu className={cn('w-5 h-5 shrink-0', moreMenuIsActive(location.pathname) && 'glow-primary')} />
            <NavBadgeDot show={badges.more} className="-top-0.5 -right-1" />
          </span>
          <span className="text-[11px] font-medium">More</span>
        </button>
      </nav>

      <Sheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-xl pb-8">
          <SheetHeader className="text-left">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="mt-2 flex flex-col gap-1 px-2">
            {moreNavItems.map((item) => (
              <Button
                key={item.path}
                variant="ghost"
                className={cn(
                  'h-12 w-full justify-start gap-3 px-3',
                  routeIsActive(item.path, location.pathname) && 'bg-primary/10 text-primary',
                )}
                asChild
              >
                <NavLink
                  to={item.path}
                  onClick={() => setMoreSheetOpen(false)}
                  className="relative"
                >
                  <item.icon className="size-5 opacity-80" />
                  {item.label}
                  <NavBadgeDot
                    show={badgeFor(item.path)}
                    className="top-1/2 right-3 -translate-y-1/2"
                  />
                </NavLink>
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default function Layout() {
  return (
    <NavBadgesProvider>
      <LayoutShell />
    </NavBadgesProvider>
  )
}
