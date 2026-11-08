const http = require("http");
const net = require("net");
const { spawn } = require("child_process");

const PROXY_PORT = parseInt(process.env.PORT || "24811", 10);
const METRO_PORT = PROXY_PORT + 1;

let metroReady = false;

function forwardRequest(req, res) {
  // The shared browser route has a prefix, while Metro serves its bundles at root.
  // Move browser visitors to the dedicated Expo origin so bundle URLs stay valid.
  const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");
  const pathname = (req.url || "/").split("?")[0];
  if (basePath && (pathname === basePath || pathname === `${basePath}/`)
      && !req.headers["expo-platform"] && process.env.REPLIT_EXPO_DEV_DOMAIN) {
    res.writeHead(302, {
      Location: `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}/`,
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }
  if (req.url === "/status" || req.url === "/spektrum-mobile/status") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("packager-status:running");
    return;
  }
  // Dev server only: explicit disposable QA SDK traffic goes to loopback, never Firebase cloud.
  const qaFirestore = pathname.startsWith("/__qa-firestore/");
  const qaAuth = pathname.startsWith("/identitytoolkit.googleapis.com/") || pathname.startsWith("/securetoken.googleapis.com/");
  if (qaFirestore || qaAuth) {
    const upstream = http.request({
      hostname: "127.0.0.1", port: qaFirestore ? 18081 : 19099,
      path: qaFirestore ? req.url.replace(/^\/__qa-firestore/, "") : req.url,
      method: req.method, headers: { ...req.headers, host: `127.0.0.1:${qaFirestore ? 18081 : 19099}` },
    }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Disposable QA emulator is unavailable" }));
    });
    req.pipe(upstream);
    return;
  }
  if (!metroReady) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><body>Metro is starting, please wait</body></html>");
    return;
  }
  const options = {
    hostname: "127.0.0.1",
    port: METRO_PORT,
    path: req.url,
    method: req.method,
    // Preserve the public host: Expo compares it to Origin when loading fonts/assets.
    headers: { ...req.headers },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("packager-status:starting");
    }
  });
  req.pipe(proxyReq, { end: true });
}

const server = http.createServer(forwardRequest);

server.on("upgrade", (req, socket, head) => {
  if (!metroReady) { socket.destroy(); return; }
  const conn = net.createConnection(METRO_PORT, "127.0.0.1");
  conn.on("connect", () => {
    const headers = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    headers.push("", "");
    conn.write(headers.join("\r\n"));
    if (head && head.length) conn.write(head);
    socket.pipe(conn);
    conn.pipe(socket);
  });
  conn.on("error", () => socket.destroy());
  socket.on("error", () => conn.destroy());
});

setTimeout(() => {
  server.listen(PROXY_PORT, () => {
    console.log(`[proxy] Listening on ${PROXY_PORT} -> Metro on ${METRO_PORT}`);
  });
}, 300);

function waitForMetro() {
  const check = net.createConnection(METRO_PORT, "127.0.0.1");
  check.on("connect", () => {
    check.destroy();
    if (!metroReady) {
      metroReady = true;
      console.log(`[proxy] Metro ready on ${METRO_PORT}`);
    }
  });
  check.on("error", () => { check.destroy(); setTimeout(waitForMetro, 1500); });
}
waitForMetro();

const metroEnv = {
  ...process.env,
  PORT: String(METRO_PORT),
  EXPO_PACKAGER_PROXY_URL: `https://${process.env.REPLIT_EXPO_DEV_DOMAIN || ""}`,
  EXPO_PUBLIC_DOMAIN: process.env.REPLIT_DEV_DOMAIN || "",
  EXPO_PUBLIC_REPL_ID: process.env.REPL_ID || "",
  REACT_NATIVE_PACKAGER_HOSTNAME: process.env.REPLIT_DEV_DOMAIN || "",
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || "",
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || "",
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID || "",
};

const metro = spawn(
  "pnpm",
  ["exec", "expo", "start", "--offline", ...(process.argv.includes("--clear") ? ["--clear"] : []), "--port", String(METRO_PORT)],
  { stdio: "inherit", env: metroEnv, cwd: process.cwd() }
);

metro.on("error", (err) => { console.error("[metro] start error:", err); process.exit(1); });
metro.on("exit", (code) => { console.log(`[metro] exit ${code}`); process.exit(code || 0); });

function shutdown(sig) {
  metro.kill(sig);
  server.close();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
