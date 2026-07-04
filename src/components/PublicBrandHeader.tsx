export function PublicBrandHeader({
  subtitle
}: {
  subtitle?: string;
}) {
  return (
    <header className="border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <img
          src="/logo.jpg"
          alt="APLUS ACADEMY"
          className="h-10 w-10 rounded-md border border-stone-200 bg-white object-cover"
        />
        <div>
          <p className="text-sm font-bold text-primary">APLUS ACADEMY</p>
          <p className="text-xs text-stone-500">{subtitle ?? "Quản lý học phí và lớp học"}</p>
        </div>
      </div>
    </header>
  );
}
