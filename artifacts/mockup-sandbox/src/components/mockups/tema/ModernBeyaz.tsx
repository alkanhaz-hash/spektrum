export function ModernBeyaz() {
  return (
    <div className="min-h-screen font-sans bg-white">
      {/* Navbar */}
      <nav className="px-8 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">SPEKTRUM</span>
        </div>
        <div className="flex gap-6 text-sm text-gray-500">
          <span className="cursor-pointer hover:text-gray-900 transition-colors">Keşfet</span>
          <span className="cursor-pointer hover:text-gray-900 transition-colors">Yaz</span>
          <span className="cursor-pointer hover:text-gray-900 transition-colors">Mesajlar</span>
        </div>
        <button className="px-5 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
          Giriş Yap
        </button>
      </nav>

      {/* Hero */}
      <div className="relative overflow-hidden bg-white" style={{ minHeight: "520px" }}>
        {/* Soft gradient blob */}
        <div className="absolute top-0 right-0 w-2/3 h-full opacity-10 pointer-events-none" style={{
          background: "radial-gradient(ellipse at top right, #8b5cf6 0%, #6366f1 30%, transparent 70%)"
        }} />
        <div className="absolute bottom-0 left-0 w-1/2 h-2/3 opacity-5 pointer-events-none" style={{
          background: "radial-gradient(ellipse at bottom left, #06b6d4 0%, transparent 70%)"
        }} />
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-8 py-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6 tracking-wide" style={{ background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}>
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Türkçe Yazarlık Platformu
          </div>
          <h1 className="text-6xl font-bold mb-6 leading-tight text-gray-900">
            Hikayeler<br />
            <span style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Burada Yaşar
            </span>
          </h1>
          <p className="text-lg max-w-xl mb-10 leading-relaxed text-gray-500">
            Temiz, sade ve dikkat dağıtmayan bir okuma deneyimi. Her şey hikayene odaklanman için.
          </p>
          <div className="flex gap-4">
            <button className="px-8 py-3 rounded-xl text-white font-semibold text-sm shadow-lg" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              Okumaya Başla
            </button>
            <button className="px-8 py-3 rounded-xl font-semibold text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
              Hikaye Yaz
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="px-8 pb-12">
        <h2 className="text-2xl font-bold mb-6 text-gray-900">Trend Hikayeler</h2>
        <div className="grid grid-cols-3 gap-6">
          {[
            { title: "Şehrin Sesleri", author: "Ayşe Kaya", genre: "Roman", color: "#6366f1" },
            { title: "Gece Yarısı", author: "Mehmet Demir", genre: "Şiir", color: "#8b5cf6" },
            { title: "Yeni Başlangıç", author: "Zeynep Arslan", genre: "Macera", color: "#06b6d4" },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1 border border-gray-100" style={{ background: "#fafafa" }}>
              <div className="h-36 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${s.color}15, ${s.color}08)` }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold" style={{ background: s.color }}>
                  {s.title[0]}
                </div>
              </div>
              <div className="p-4">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white" style={{ background: s.color }}>{s.genre}</span>
                <h3 className="font-bold mt-2 mb-1 text-gray-900">{s.title}</h3>
                <p className="text-xs text-gray-400">✍️ {s.author}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
