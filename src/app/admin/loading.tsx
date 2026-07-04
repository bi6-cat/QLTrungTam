export default function AdminLoading() {
  return (
    <div className="grid gap-5">
      <div className="h-8 w-56 animate-pulse rounded-md bg-stone-200" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 animate-pulse rounded-lg bg-white shadow-soft" />
        <div className="h-28 animate-pulse rounded-lg bg-white shadow-soft" />
        <div className="h-28 animate-pulse rounded-lg bg-white shadow-soft" />
      </div>
      <div className="h-96 animate-pulse rounded-lg bg-white shadow-soft" />
    </div>
  );
}
