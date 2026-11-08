import http from "node:http";
import net from "node:net";
import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

function hostname(value: string | undefined): string {
  if (!value) return "";
  try { return new URL(`https://${value.split(",")[0].trim()}`).hostname.toLowerCase(); }
  catch { return ""; }
}

/** The shared workspace router can send the dedicated Expo hostname to the web root. */
export function mobilePreviewProxy(): Plugin {
  return {
    name: "spektrum-mobile-preview-proxy",
    enforce: "pre",
    configureServer(server) {
      const expoHost = hostname(process.env.REPLIT_EXPO_DEV_DOMAIN);
      if (!expoHost) return;
      const manifest = readFileSync(new URL("../../spektrum-mobile/.replit-artifact/artifact.toml", import.meta.url), "utf8");
      const port = Number(manifest.match(/^localPort\s*=\s*(\d+)\s*$/m)?.[1]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("Mobil önizleme servisinin portu okunamadı.");
      }
      const isMobile = (req: IncomingMessage) =>
        [req.headers.host, req.headers["x-forwarded-host"]]
          .flat().some((value) => hostname(value) === expoHost);

      server.middlewares.use((req, res, next) => {
        if (!isMobile(req)) return next();
        const upstream = http.request({
          hostname: "127.0.0.1", port, method: req.method, path: req.url,
          headers: { ...req.headers, host: expoHost },
        }, (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        });
        upstream.on("error", () => {
          if (res.headersSent) { res.destroy(); return; }
          res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Mobil önizleme sunucusuna ulaşılamıyor. Mobil iş akışını başlatıp yeniden dene.");
        });
        req.on("aborted", () => upstream.destroy());
        res.on("close", () => { if (!res.writableEnded) upstream.destroy(); });
        req.pipe(upstream);
      });

      server.httpServer?.on("upgrade", (req, socket, head) => {
        if (!isMobile(req)) return;
        const upstream = net.createConnection(port, "127.0.0.1");
        upstream.on("connect", () => {
          const headers = { ...req.headers, host: expoHost };
          const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
          for (const [name, value] of Object.entries(headers)) {
            for (const item of Array.isArray(value) ? value : [value]) {
              if (item !== undefined) lines.push(`${name}: ${item}`);
            }
          }
          upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
          if (head.length) upstream.write(head);
          socket.pipe(upstream).pipe(socket);
        });
        upstream.on("error", () => socket.destroy());
        socket.on("error", () => upstream.destroy());
        socket.on("close", () => upstream.destroy());
      });
    },
  };
}
