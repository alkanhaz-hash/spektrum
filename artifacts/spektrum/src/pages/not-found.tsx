import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        <p className="text-8xl font-bold text-primary/20 font-serif select-none">404</p>
        <h1 className="text-2xl font-bold text-foreground">Sayfa Bulunamadı</h1>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Aradığın sayfa mevcut değil veya taşınmış olabilir.
        </p>
        <Link href="/">
          <button className="mt-4 inline-flex items-center justify-center px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:shadow-[0_0_20px_hsl(var(--primary)/0.3)]">
            Ana Sayfaya Dön
          </button>
        </Link>
      </div>
    </div>
  );
}
