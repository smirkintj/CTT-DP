export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="h-16 bg-white border-b border-slate-200 animate-pulse" />
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 bg-slate-200 rounded animate-pulse" />
          <div className="h-9 w-28 bg-slate-200 rounded-lg animate-pulse" />
        </div>
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 bg-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
