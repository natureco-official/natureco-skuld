#!/usr/bin/env node
/**
 * Skuld gümüş temasının canlı önizlemesi.
 *
 *   node scripts/tema-onizleme.mjs            → terminalinizin yeteneğiyle
 *   node scripts/tema-onizleme.mjs --hepsi    → dört degradasyon seviyesi
 *
 * `--hepsi` önemli: tema yalnızca truecolor'da güzel görünüp 256 renkte
 * dağılıyorsa güzel değil, şanslıdır. Dördünü yan yana görmek tek yol.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const { CAPS, detectCapabilities } = require("../src/utils/tui.js");
const T = require("../src/utils/skuld-theme.js");

const hepsi = process.argv.includes("--hepsi");

function govde() {
  const s = [];
  s.push(T.hero({ surum: "v0.1.0" }));
  s.push(T.ayrac());
  s.push("");
  s.push(`  ${T.kalin(T.gumus(100, "BİLEŞENLER"))}`);
  s.push("");
  s.push(T.durum("ok", "execution-gateway", "tek kapı · 13 düşman testi"));
  s.push(T.durum("ok", "urðr hafızası", "oturumlar arası · 5 sözleşme testi"));
  s.push(T.durum("ok", "kalite kapısı", "korumalı modül · CodeDNA"));
  s.push(T.durum("uyari", "verðandi kapsülü", "pasif — tasarruf kanıtlanmadı"));
  s.push(T.durum("hata", "cupertino köprüsü", "henüz yok"));
  s.push("");
  s.push(T.ayrac());
  s.push("");
  s.push(`  ${T.kalin(T.gumus(100, "OTURUM"))}`);
  s.push("");
  s.push(T.alan("model", "minimax-m2.5"));
  s.push(T.alan("proje", "~/projeler/api"));
  s.push(T.alan("token", "8.433 girdi · 988 çıktı"));
  s.push(T.alan("hafıza", "3 kayıt okundu, 1 karar yazıldı"));
  s.push("");
  s.push(T.durum("etkin", "src/auth/retry.ts düzenleniyor", "tur 4/12"));
  s.push("");
  s.push(T.ayrac());
  s.push("");
  s.push(`  ${T.kalin(T.gumus(100, "DENEYSEL YÜZEY"))}`);
  s.push("");
  s.push("  " + T.gumus(500, "kabartma — harfler metale basılmış gibi"));
  s.push(
    T.kabartma(T.KELIME_ISARETI)
      .split("\n")
      .map((l) => "  " + l)
      .join("\n"),
  );
  s.push("");
  s.push("  " + T.gumus(500, "akan yüzey — çalışırken parıltı kayar, boştayken donar"));
  for (const faz of [0, 0.33, 0.66]) {
    s.push("  " + T.akanSatir("████████████████████████", faz));
  }
  s.push("");
  s.push("  " + T.gumus(500, "braille grafik — tur başına token"));
  s.push(
    "  " +
      T.grafik([2, 5, 3, 8, 6, 9, 4, 7, 9, 3, 6, 8]) +
      T.soluk(T.gumus(600, "  8.4k toplam")),
  );
  s.push("");
  s.push("  " + T.gumus(500, "yükseltilmiş seçim — kutu yok, gölge var"));
  s.push(
    T.secimListesi(
      [
        { etiket: "Yerel model (ollama)", not: "hiçbir şey makineden çıkmaz" },
        { etiket: "MiniMax", not: "API anahtarı gerekir" },
        { etiket: "Anthropic", not: "API anahtarı gerekir" },
      ],
      0,
    ),
  );
  s.push("");
  return s.join("\n");
}

function seviye(ad, ayar) {
  Object.assign(CAPS, ayar);
  process.stdout.write(`\n${"═".repeat(60)}\n  ${ad}\n${"═".repeat(60)}\n`);
  process.stdout.write(govde() + "\n");
}

if (!hepsi) {
  detectCapabilities();
  // Boru içindeyken isTTY false olur ve renk kapanır; önizlemede bu istenmez.
  if (process.env["FORCE_COLOR"]) {
    CAPS.color = true;
    CAPS.trueColor = process.env["FORCE_COLOR"] === "3";
  }
  process.stdout.write(govde() + "\n");
} else {
  seviye("1 · truecolor (24-bit)", { color: true, trueColor: true, unicode: true, width: 80 });
  seviye("2 · 256 renk", { color: true, trueColor: false, unicode: true, width: 80 });
  seviye("3 · unicode yok (ASCII)", { color: true, trueColor: true, unicode: false, width: 80 });
  seviye("4 · NO_COLOR", { color: false, trueColor: false, unicode: true, width: 80 });
  seviye("5 · dar terminal (40 sütun)", { color: true, trueColor: true, unicode: true, width: 40 });
}
