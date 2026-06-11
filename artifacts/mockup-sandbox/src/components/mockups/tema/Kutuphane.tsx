export function Kutuphane() {
  return (
    <div className="min-h-screen font-serif" style={{ background: "linear-gradient(135deg, #f5f0e8 0%, #ede3d0 40%, #e8dcc8 100%)" }}>
      {/* Navbar */}
      <nav style={{ background: "rgba(139,90,43,0.12)", borderBottom: "1px solid rgba(139,90,43,0.2)" }} className="px-8 py-4 flex items-center justify-between backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📚</span>
          <span className="text-xl font-bold" style={{ color: "#5c3d1e", letterSpacing: "0.05em" }}>SPEKTRUM</span>
        </div>
        <div className="flex gap-6 text-sm" style={{ color: "#7a5230" }}>
          <span className="cursor-pointer hover:underline">Keşfet</span>
          <span className="cursor-pointer hover:underline">Yaz</span>
          <span className="cursor-pointer hover:underline">Mesajlar</span>
        </div>
        <button className="px-5 py-2 rounded-full text-sm font-semibold text-white" style={{ background: "#8b4513" }}>
          Giriş Yap
        </button>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ minHeight: "520px" }}>
        {/* Decorative background */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%238b4513' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-8 py-20">
          <div className="inline-block px-4 py-1 rounded-full text-xs font-semibold mb-6 tracking-widest uppercase" style={{ background: "rgba(139,69,19,0.15)", color: "#7a4010", border: "1px solid rgba(139,69,19,0.3)" }}>
            Dijital Kütüphane
          </div>
          <h1 className="text-6xl font-bold mb-6 leading-tight" style={{ color: "#3d2008", textShadow: "1px 1px 0 rgba(255,255,255,0.5)" }}>
            Kelimelerin<br />
            <span style={{ color: "#8b4513" }}>Sıcaklığında</span> Kaybol
          </h1>
          <p className="text-lg max-w-xl mb-10 leading-relaxed" style={{ color: "#6b4226" }}>
            Türkçe hikayelerin, şiirlerin ve romanların buluşma noktası. Her satırda yeni bir dünya.
          </p>
          <div className="flex gap-4">
            <button className="px-8 py-3 rounded-full text-white font-semibold text-sm shadow-lg" style={{ background: "#8b4513" }}>
              Okumaya Başla
            </button>
            <button className="px-8 py-3 rounded-full font-semibold text-sm border-2" style={{ color: "#8b4513", borderColor: "#8b4513", background: "rgba(255,255,255,0.5)" }}>
              Hikaye Yaz
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="px-8 pb-12">
        <h2 className="text-2xl font-bold mb-6" style={{ color: "#5c3d1e" }}>📖 Trend Hikayeler</h2>
        <div className="grid grid-cols-3 gap-6">
          {[
            { title: "Gece Yarısı Mektubu", author: "Ayşe Kaya", genre: "Roman", color: "#d4a574" },
            { title: "Bozkırın Sesi", author: "Mehmet Demir", genre: "Şiir", color: "#c8956c" },
            { title: "Kayıp Şehir", author: "Zeynep Arslan", genre: "Macera", color: "#b8835a" },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl overflow-hidden shadow-md cursor-pointer hover:shadow-xl transition-shadow" style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(139,90,43,0.2)" }}>
              <div className="h-36 flex items-center justify-center text-5xl" style={{ background: `linear-gradient(135deg, ${s.color}40, ${s.color}20)` }}>📜</div>
              <div className="p-4">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#8b451320", color: "#8b4513" }}>{s.genre}</span>
                <h3 className="font-bold mt-2 mb-1" style={{ color: "#3d2008" }}>{s.title}</h3>
                <p className="text-xs" style={{ color: "#9a6b4b" }}>✍️ {s.author}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
