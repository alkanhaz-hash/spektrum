export function Bahar() {
  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(160deg, #fdf6f9 0%, #fce8f3 40%, #f5e6ff 100%)" }}>
      {/* Navbar */}
      <nav className="px-8 py-4 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(219,112,219,0.2)" }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌸</span>
          <span className="text-xl font-bold" style={{ color: "#9b2c8a", letterSpacing: "0.04em" }}>SPEKTRUM</span>
        </div>
        <div className="flex gap-6 text-sm" style={{ color: "#b05a9e" }}>
          <span className="cursor-pointer hover:underline">Keşfet</span>
          <span className="cursor-pointer hover:underline">Yaz</span>
          <span className="cursor-pointer hover:underline">Mesajlar</span>
        </div>
        <button className="px-5 py-2 rounded-full text-sm font-semibold text-white shadow-md" style={{ background: "linear-gradient(135deg, #e879c8, #a855f7)" }}>
          Giriş Yap
        </button>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ minHeight: "520px" }}>
        {/* Floating flowers */}
        {["🌸","🌺","🌼","🌷","🌻","🏵️"].map((f,i) => (
          <div key={i} className="absolute text-4xl opacity-30 select-none" style={{
            top: `${10 + (i * 13) % 60}%`,
            left: `${5 + (i * 17) % 90}%`,
            transform: `rotate(${i * 30}deg)`,
            fontSize: `${2 + (i % 3)}rem`
          }}>{f}</div>
        ))}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-8 py-20">
          <div className="inline-block px-4 py-1 rounded-full text-xs font-semibold mb-6 tracking-widest uppercase" style={{ background: "rgba(232,121,200,0.15)", color: "#9b2c8a", border: "1px solid rgba(232,121,200,0.4)" }}>
            🌸 Baharın Renkleriyle Oku
          </div>
          <h1 className="text-6xl font-bold mb-6 leading-tight" style={{ color: "#5b1c7a" }}>
            Her Sayfa<br />
            <span style={{ background: "linear-gradient(135deg, #e879c8, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Çiçek Gibi
            </span>
          </h1>
          <p className="text-lg max-w-xl mb-10 leading-relaxed" style={{ color: "#7c3d8f" }}>
            Türkçe hikayelerin renkli, neşeli ve taze dünyasında kaybol. Her hikaye kalbini ısıtsın.
          </p>
          <div className="flex gap-4">
            <button className="px-8 py-3 rounded-full text-white font-semibold text-sm shadow-lg" style={{ background: "linear-gradient(135deg, #e879c8, #a855f7)" }}>
              🌸 Okumaya Başla
            </button>
            <button className="px-8 py-3 rounded-full font-semibold text-sm border-2" style={{ color: "#9b2c8a", borderColor: "#e879c8", background: "rgba(255,255,255,0.7)" }}>
              Hikaye Yaz
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="px-8 pb-12">
        <h2 className="text-2xl font-bold mb-6" style={{ color: "#7c3d8f" }}>🌷 Trend Hikayeler</h2>
        <div className="grid grid-cols-3 gap-6">
          {[
            { title: "Lavanta Tarlası", author: "Ayşe Kaya", genre: "Roman", emoji: "💜", bg: "linear-gradient(135deg, #f5e6ff, #e8d5ff)" },
            { title: "Pembe Sabah", author: "Mehmet Demir", genre: "Şiir", emoji: "🌸", bg: "linear-gradient(135deg, #fce8f3, #fbd5e8)" },
            { title: "Çiçeklerin Dili", author: "Zeynep Arslan", genre: "Masal", emoji: "🌺", bg: "linear-gradient(135deg, #fff0e6, #ffe0d0)" },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl overflow-hidden shadow-md cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1" style={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(232,121,200,0.25)" }}>
              <div className="h-36 flex items-center justify-center text-5xl" style={{ background: s.bg }}>{s.emoji}</div>
              <div className="p-4">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(232,121,200,0.15)", color: "#9b2c8a" }}>{s.genre}</span>
                <h3 className="font-bold mt-2 mb-1" style={{ color: "#5b1c7a" }}>{s.title}</h3>
                <p className="text-xs" style={{ color: "#b05a9e" }}>✍️ {s.author}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
