import { cn } from '@/lib/utils'

interface LedIndicatorProps {
  status: 'online' | 'offline' | 'lapsed'
  size?: 'sm' | 'md'
}

const statusConfig = {
  online: {
    bg: 'bg-teal-400',
    cssColor: '#2dd4bf',
    animClass: 'led-breathe',
  },
  offline: {
    bg: 'bg-red-500',
    cssColor: '#ef4444',
    animClass: '',
  },
  lapsed: {
    bg: 'bg-amber-500',
    cssColor: '#f59e0b',
    animClass: 'led-rapid-pulse',
  },
}

export function LedIndicator({ status, size = 'md' }: LedIndicatorProps) {
  const sizeClasses = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'
  const config = statusConfig[status]

  return (
    <span className="relative inline-flex items-center justify-center">
      <span
        className={cn(sizeClasses, 'rounded-full', config.bg, config.animClass)}
        style={{ '--led-color': config.cssColor } as React.CSSProperties}
      />
    </span>
  )
}
