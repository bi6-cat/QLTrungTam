export function PublicBrandHeader({
  subtitle
}: {
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <img
          src="/logo.jpg"
          alt="APLUS ACADEMY"
          className="h-10 w-10 rounded-xl border border-stone-200 bg-white object-cover shadow-sm"
        />
        <div>
          <p className="text-sm font-bold tracking-tight text-primary">APLUS ACADEMY</p>
          <p className="text-xs text-stone-500">{subtitle ?? "Quản lý học phí và lớp học"}</p>
        </div>
      </div>
    </header>
  );
}
