/**
 * Ortak tipler ve hata sınıfları.
 *
 * Hata sınıflandırması bilinçli: kullanıcı hatası, politika reddi, model
 * hatası, araç hatası ve sistem hatası farklı şeylerdir ve farklı davranış
 * gerektirirler. Hepsini `Error` olarak fırlatmak, çağıranı mesaj metnine
 * bakmaya zorlar — ve mesaj metni değiştiği gün sessizce kırılır.
 */

export type HataSinifi =
  | "kullanici" // yanlış argüman, eksik dosya — kullanıcı düzeltebilir
  | "politika" // gateway reddetti — güvenlik kararı, hata değil
  | "model" // sağlayıcı hatası, rate limit, timeout
  | "arac" // araç çalıştı ama başarısız oldu (test düştü, lint kırmızı)
  | "sistem"; // beklenmeyen; bug

export class SkuldHatasi extends Error {
  readonly sinif: HataSinifi;
  readonly ayrinti: Record<string, unknown>;

  constructor(sinif: HataSinifi, mesaj: string, ayrinti: Record<string, unknown> = {}) {
    super(mesaj);
    this.name = "SkuldHatasi";
    this.sinif = sinif;
    this.ayrinti = ayrinti;
  }

  /** `--json` çıktısı için stabil şekil. */
  toJSON(): Record<string, unknown> {
    return { hata: true, sinif: this.sinif, mesaj: this.message, ...this.ayrinti };
  }
}

export const kullaniciHatasi = (m: string, a?: Record<string, unknown>) =>
  new SkuldHatasi("kullanici", m, a);
export const politikaReddi = (m: string, a?: Record<string, unknown>) =>
  new SkuldHatasi("politika", m, a);
export const modelHatasi = (m: string, a?: Record<string, unknown>) =>
  new SkuldHatasi("model", m, a);
export const aracHatasi = (m: string, a?: Record<string, unknown>) =>
  new SkuldHatasi("arac", m, a);

/**
 * Sır maskeleme.
 *
 * Tek yerde durmasının sebebi: log, onay metni, model prompt'u ve `--json`
 * çıktısı aynı filtreden geçmeli. Dört ayrı yerde dört ayrı regex, üçüncüsünün
 * eksik kaldığı gün sızıntı olur.
 *
 * Bu tam bir çözüm değil ve öyle sunulmuyor: bilinen desenleri yakalar. Asıl
 * savunma, secret dosyalarını kapsüle hiç almamaktır.
 */
const SIR_DESENLERI: Array<[RegExp, string]> = [
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, "sk-ant-***"],
  [/\bsk-[A-Za-z0-9]{20,}/g, "sk-***"],
  [/\bgsk_[A-Za-z0-9]{20,}/g, "gsk_***"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, "xox*-***"],
  [/\bghp_[A-Za-z0-9]{20,}/g, "ghp_***"],
  // Codex denetimi (29.07.2026): aşağıdaki biçimler listede yoktu ve çıktıda
  // değişmeden kalıyordu. `GITHUB_TOKEN=...` genel KEY kuralına takılıyordu
  // ama `Authorization: Bearer github_pat_...` takılmıyordu — ve bir token en
  // çok o ikinci biçimde görünür.
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "github_pat_***"],
  [/\bgho_[A-Za-z0-9]{20,}/g, "gho_***"],
  [/\bglpat-[A-Za-z0-9_-]{15,}/g, "glpat-***"],
  [/\bnpm_[A-Za-z0-9]{30,}/g, "npm_***"],
  [/\bAKIA[0-9A-Z]{16}/g, "AKIA***"],
  [/\bdop_v1_[a-f0-9]{60,}/g, "dop_v1_***"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "eyJ***.***"],
  [/\bAIza[A-Za-z0-9_-]{30,}/g, "AIza***"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "***PRIVATE KEY***"],
  // KEY=deger biçimi: değeri maskele, adı bırak (tanılama için ad lazım).
  [/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)S?)\s*=\s*\S+/g, "$1=***"],
];

export function sirlariMaskele(metin: string): string {
  let sonuc = metin;
  for (const [desen, yerine] of SIR_DESENLERI) sonuc = sonuc.replace(desen, yerine);
  return sonuc;
}

/** Uzun çıktıyı sınırlar; ortadan keser ki hem baş hem son görünsün. */
export function ciktiyiSinirla(metin: string, enFazla: number): { metin: string; kesildi: boolean } {
  if (metin.length <= enFazla) return { metin, kesildi: false };
  const yarim = Math.floor(enFazla / 2);
  const atlanan = metin.length - enFazla;
  return {
    metin: `${metin.slice(0, yarim)}\n\n… [${atlanan} karakter atlandı] …\n\n${metin.slice(-yarim)}`,
    kesildi: true,
  };
}
