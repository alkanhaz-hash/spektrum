/** Offline typography: generated artwork + crisp Turkish titles → 800×1200 WebP. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadStories, loadStoriesFromDirectory } from "./launch-library.mjs";

const exec = promisify(execFile);
const diverse = process.argv.includes("--diverse");
const sequel = process.argv.includes("--sequel") || diverse;
const directory = diverse ? "generated-artifacts/book-covers-diverse"
  : sequel ? "generated-artifacts/book-covers-romance" : "generated-artifacts/book-covers";
const serif = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf";
const sans = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const crops = [
  "626x918+198+52", "630x950+195+36", null, "640x918+192+52",
  "640x918+192+52", "640x950+192+36", "640x918+192+52",
  "610x894+207+64", "640x918+192+52", null,
];
const titles = diverse ? [
  "İki Ayın\nHaritası", "Saat Kulesinin\nSırrı", "Cam Kalenin\nAltı",
  "Yitik Yıldızın\nPeşinde", "Gölge\nPazarı", "Son Kapının\nAnahtarı",
  "Fenerin Yanında\nBir Yaz", "Geç Kalan\nMektuplar", "Son Raundun\nÖncesi",
  "Minderdeki\nSöz",
] : sequel ? [
  "İki Ayın\nHaritası", "Saat Kulesinin\nSırrı", "Cam Kalenin\nAltı",
  "Yitik Yıldızın\nPeşinde", "Gölge\nPazarı", "Son Kapının\nAnahtarı",
  "Fenerin Ardındaki\nSes", "Tersine İşleyen\nSaat", "Taş Bahçenin\nVarisi",
  "Mor Ejderhanın\nYemini",
] : [
  "Kayıp Renkler\nAtlası", "Saat Dokuzu\nGeçmeden", "Sardunya\nApartmanı",
  "Bulut\nPostanesi", "Kod Adı\nPapatya", "Mavi Defterin\nRotası",
  "Çatıdaki Küçük\nOrkestra", "Bir Fincanlık\nGezegen", "Kumaşlara\nÇizilen Deniz",
  "Yarın Açılacak\nBahçe",
];

const stories = sequel
  ? await loadStoriesFromDirectory(diverse ? "artifacts/api-server/seed-content-diverse" : "artifacts/api-server/seed-content-romance")
  : await loadStories();
for (let index = 0; index < stories.length; index++) {
  const id = sequel ? String(index + 11).padStart(2, "0") : String(index + 1).padStart(2, "0");
  const artworkDirectory = diverse && [0, 2, 3].includes(index) ? "generated-artifacts/book-covers-romance" : directory;
  const args = [`${artworkDirectory}/art-${id}.png`];
  if (!sequel && crops[index]) args.push("-crop", crops[index], "+repage");
  args.push(
    "-resize", sequel ? "800x1200^" : "800x1200!",
    "-gravity", "center", "-extent", "800x1200", "-colorspace", "sRGB",
    "(", "-size", "800x360", "gradient:#081427ee-#08142700", ")",
    "-gravity", "north", "-compose", "over", "-composite",
    "(", "-background", "none", "-fill", "#fff5da", "-font", serif,
    "-pointsize", "55", "-interline-spacing", "5", "-size", "736x185",
    "-gravity", "center", `caption:${titles[index]}`, ")",
    "-gravity", "north", "-geometry", "+0+48", "-composite",
    "(", "-size", "800x110", "gradient:#08142700-#081427cc", ")",
    "-gravity", "south", "-geometry", "+0+0", "-composite",
    "-font", sans, "-pointsize", "20", "-fill", "#fff5da",
    "-gravity", "south", "-annotate", "+0+30", "S P E K T R U M",
    "-strip", "-quality", "85", `${directory}/cover-${id}.webp`,
  );
  await exec("magick", args);
}
await exec("magick", ["montage", "-font", sans,
    ...stories.map((_, index) => `${directory}/cover-${String(index + (sequel ? 11 : 1)).padStart(2, "0")}.webp`),
  "-thumbnail", "200x300", "-tile", "5x2", "-geometry", "+12+12",
  "-background", "#eef0f3", `${directory}/kapaklar-onizleme.jpg`,
]);
console.log("10 adet 800×1200 WebP kapak ve toplu önizleme hazır.");
