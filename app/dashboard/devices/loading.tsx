export default function DevicesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-32 bg-white/5 rounded animate-pulse" />
        <div className="h-4 w-40 bg-white/5 rounded animate-pulse mt-2" />
      </div>
      <div className="bg-[#1A1A1A] border border-white/10 rounded-lg overflow-hidden">
        <div className="h-10 bg-white/5 border-b border-white/5" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-white/5 last:border-0">
            <div className="w-8 h-8 rounded-lg bg-white/5 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
              <div className="h-3 w-24 bg-white/5 rounded animate-pulse" />
            </div>
            <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
            <div className="h-6 w-28 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
