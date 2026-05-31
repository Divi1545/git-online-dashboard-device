export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-white/10 rounded" />
        <div className="h-4 w-32 bg-white/5 rounded" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] border border-white/10 rounded-lg p-4 space-y-2">
            <div className="h-3 w-20 bg-white/10 rounded" />
            <div className="h-7 w-12 bg-white/10 rounded" />
          </div>
        ))}
      </div>

      {/* Device cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] border border-white/10 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-white/10" />
                <div className="h-4 w-28 bg-white/10 rounded" />
              </div>
              <div className="h-5 w-16 bg-white/10 rounded" />
            </div>
            <div className="h-3 w-full bg-white/5 rounded" />
            <div className="h-8 w-full bg-white/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
