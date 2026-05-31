export default function DeviceLoading() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-white/10" />
          <div className="space-y-2">
            <div className="h-5 w-48 bg-white/10 rounded" />
            <div className="h-3 w-64 bg-white/5 rounded" />
          </div>
        </div>
        <div className="h-8 w-32 bg-white/10 rounded" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] border border-white/10 rounded-lg p-4 space-y-2">
            <div className="h-3 w-20 bg-white/10 rounded" />
            <div className="h-7 w-12 bg-white/10 rounded" />
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-6 space-y-3">
            <div className="h-4 w-32 bg-white/10 rounded" />
            <div className="h-3 w-full bg-white/5 rounded" />
            <div className="h-3 w-3/4 bg-white/5 rounded" />
            <div className="h-3 w-1/2 bg-white/5 rounded" />
          </div>
          <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-6 h-48" />
        </div>
        <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-6 h-64" />
      </div>
    </div>
  )
}
