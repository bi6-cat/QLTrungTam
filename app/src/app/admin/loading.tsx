export default function AdminLoading() {
  return (
    <div className="grid gap-6">
      <div className="h-8 w-56 animate-pulse rounded-xl bg-stone-200/70" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="h-28 animate-pulse rounded-2xl border border-stone-200/60 bg-white shadow-soft" />
        <div className="h-28 animate-pulse rounded-2xl border border-stone-200/60 bg-white shadow-soft" />
        <div className="h-28 animate-pulse rounded-2xl border border-stone-200/60 bg-white shadow-soft" />
        <div className="h-28 animate-pulse rounded-2xl border border-stone-200/60 bg-white shadow-soft" />
      </div>
      <div className="h-96 animate-pulse rounded-2xl border border-stone-200/60 bg-white shadow-soft" />
    </div>
  );
}
