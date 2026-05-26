import { cn } from '@/lib/utils'

interface LedIndicatorProps {
  status: 'online' | 'offline' | 'lapsed'
  size?: 'sm' | 'md'
}

export function LedIndicator({ status, size = 'md' }: LedIndicatorProps) {
  const sizeClasses = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'

  const statusConfig = {
    online: {
      color: 'bg-blue-400',
      glow: 'shadow-blue-400/50',
      animate: 'animate-pulse',
    },
    offline: {
      color: 'bg-red-500',
      glow: 'shadow-red-500/50',
      animate: '',
    },
    lapsed: {
      color: 'bg-amber-500',
      glow: 'shadow-amber-500/50',
      animate: 'animate-pulse',
    },
  }

  const config = statusConfig[status]

  return (
    <span className="relative inline-flex">
      <span
        className={cn(
          sizeClasses,
          'rounded-full',
          config.color,
          config.animate,
          `shadow-lg ${config.glow}`
        )}
      />
    </span>
  )
}
