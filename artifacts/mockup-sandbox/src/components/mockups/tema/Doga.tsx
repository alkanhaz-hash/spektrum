export function Doga() {
  return (
    <div className="min-h-screen font-sans" style={{ background: "#f0f7f0" }}>
      {/* Navbar */}
      <nav className="px-8 py-4 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(74,124,89,0.2)" }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌿</span>
          <span className="text-xl font-bold" style={{ color: "#2d5a3d", letterSpacing: "0.04em" }}>SPEKTRUM</span>
        </div>
        <div className="flex gap-6 text-sm" style={{ color: "#4a7c59" }}>
          <span className="cursor-pointer hover:underline">Keşfet</span>
          <span className="cursor-pointer hover:underline">Yaz</span>
          <span className="cursor-pointer hover:underline">Mesajlar</span>
        </div>
        <button className="px-5 py-2 rounded-full text-sm font-semibold text-white shadow" style={{ background: "linear-gradient(135deg, #4a7c59, #2d5a3d)" }}>
          Giriş Yap
        </button>
      </nav>

      {/* Hero with nature bg */}
      <div className="relative overflow-hidden" style={{ minHeight: "520px" }}>
        <div className="absolute inset-0" style={{
          background: "linear-gradient(160deg, #c8e6d0 0%, #a8d5b5 30%, #7bbf91 60%, #5a9e72 100%)",
        }} />
        {/* Sun rays */}
        <div className="absolute top-0 right-0 w-96 h-96 opacity-30 rounded-full" style={{ background: "radial-gradient(circle, #fff9c4, transparent)", transform: "translate(30%, -30%)" }} />
        {/* Mountains */}
        <svg className="absolute bottom-0 w-full opacity-30" viewBox="0 0 1280 200" fill="none">
          <path d="M0 200 L200 60 L400 140 L600 20 L800 120 L1000 50 L1200 110 L1280 80 L1280 200Z" fill="#2d5a3d" />
        </svg>
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-8 py-20">
          <div className="inline-block px-4 py-1 rounded-full text-xs font-semibold mb-6 tracking-widest uppercase" style={{ background: "rgba(255,255,255,0.5)", color: "#2d5a3d", border: "1px solid rgba(255,255,255,0.6)" }}>
            Doğanın Sesinde Oku
          </div>
          <h1 className="text-6xl font-bold mb-6 leading-tight" style={{ color: "#1a3d28", textShadow: "0 2px 20px rgba(255,255,255,0.4)" }}>
            Huzurun İçinde<br />
            <span style={{ color: "#fff", textShadow: "0 2px 10px rgba(45,90,61,0.5)" }}>Kaybol Git</span>
          </h1>
          <p className="text-lg max-w-xl mb-10 leading-relaxed" style={{ color: "#1e4d30" }}>
            Türkçe hikayelerin temiz dünyasında nefes al. Her sayfa, taze bir başlangıç.
          </p>
          <div className="flex gap-4">
            <button className="px-8 py-3 rounded-full text-white font-semibold text-sm shadow-lg" style={{ background: "#2d5a3d" }}>
              🌱 Okumaya Başla
            </button>
            <button className="px-8 py-3 rounded-full font-semibold text-sm border-2" style={{ color: "#2d5a3d", borderColor: "#2d5a3d", background: "rgba(255,255,255,0.7)" }}>
              Hikaye Yaz
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="px-8 pb-12">
        <h2 className="text-2xl font-bold mb-6" style={{ color: "#2d5a3d" }}>🌿 Trend Hikayeler</h2>
        <div className="grid grid-cols-3 gap-6">
          {[
            { title: "Dağın Ardındaki Köy", author: "Ayşe Kaya", genre: "Doğa", emoji: "🏔️", bg: "#c8e6d0" },
            { title: "Orman Sesleri", author: "Mehmet Demir", genre: "Şiir", emoji: "🌲", bg: "#b5d9c2" },
            { title: "Göl Kıyısında", author: "Zeynep Arslan", genre: "Roman", emoji: "🌊", bg: "#a8d5b5" },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl overflow-hidden shadow-md cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1" style={{ background: "white", border: "1px solid rgba(74,124,89,0.15)" }}>
              <div className="h-36 flex items-center justify-center text-5xl" style={{ background: `linear-gradient(135deg, ${s.bg}, ${s.bg}80)` }}>{s.emoji}</div>
              <div className="p-4">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#c8e6d030", color: "#2d5a3d", border: "1px solid #4a7c5930" }}>{s.genre}</span>
                <h3 className="font-bold mt-2 mb-1" style={{ color: "#1a3d28" }}>{s.title}</h3>
                <p className="text-xs" style={{ color: "#4a7c59" }}>✍️ {s.author}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
