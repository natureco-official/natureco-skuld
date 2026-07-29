# ADR-0003 — Cupertino Terminal entegrasyon sözleşmesi

**Durum:** Önerilen
**Tarih:** 29 Temmuz 2026

## Temel ilke: Cupertino bir bonus, bağımlılık değil

Skuld **her standart terminalde** tam çalışmalı. Cupertino varsa deneyim zenginleşir. Bu ayrım kodda da görünmeli: `cupertino-bridge` paketi kaldırıldığında `agent-core` derlenmeye ve testleri geçmeye devam etmeli.

## Bilinen durum

cupertino-terminal 0.6.4, SHA `3d0ee91`, MIT, Rust çekirdek + ince Node kabuğu. **JS tarafında 6 test var** (gerçekten çalıştırıldı, hepsi geçiyor). Bu, Skuld'un dayanacağı yüzeyin olgunluğu hakkında az şey söylüyor — sözleşme testleri **Skuld tarafında** yazılmalı.

Ayrıca bu oturumda kaydedilmiş bir gerçek: ZeroLink'in **Mac istemci → Windows host** yönü hiç test edilmedi. Uzak senaryolarda bu bilinmeyen açık.

## Karar 1 — Yetenek algılama: env değişkenine güvenme

`TERM_PROGRAM` ve benzeri env değerleri **taklit edilebilir** ve sürüm bilgisi taşımaz. Kötü niyetli bir ortam kendini Cupertino gibi tanıtıp Skuld'u zengin IPC yoluna sokabilir.

**Karar:** sürümlenmiş **capability handshake**.

```
Skuld → terminal : HELLO { protocol: "skuld-term/1", features: [...] }
terminal → Skuld : HELLO_ACK { protocol: "skuld-term/1", features: [...], session: <token> }
```

- Protokol sürümü uyuşmazsa **plain mode**'a düş, hata verme.
- `features` kesişimi kullanılır; bilinmeyen feature yok sayılır.
- Handshake zaman aşımı **kısa** (≤250 ms); terminal cevaplamazsa plain mode.
- Env değişkeni yalnızca **ipucu**: handshake'i denemeye değer mi sorusunu cevaplar, yetkiyi vermez.

## Karar 2 — IPC güvenliği

| Kural | Gerekçe |
|---|---|
| Yalnızca **loopback** (127.0.0.1 / Unix socket / named pipe) bind | Ağdan erişim yok |
| Her oturum için **rastgele bearer/session token** | T12 spoof |
| Her mesajda **nonce + monotonic sequence** | T12 replay |
| Şema doğrulama (runtime validation) | Bozuk/kötü niyetli payload |
| Origin/PID doğrulaması mümkünse | Yerel başka bir sürecin taklidi |
| Boyut sınırı ve timeout | DoS |

**IPC asla ayrıcalık kaynağı olmayacak.** Terminal üzerinden gelen hiçbir mesaj, kullanıcı onayının yerine geçemez. Cupertino "bu komutu onayla" diyemez; yalnızca onay **arayüzünü gösterebilir**, onayı kullanıcı verir. Bu, execution-gateway'in tek kapı ilkesinin (ADR-0001 Karar 6) doğal sonucu.

## Karar 3 — Yetenek listesi ve düşüş davranışı

| Yetenek | Cupertino ile | Plain terminalde |
|---|---|---|
| Görev/ajan durumu | native tab veya panel | tek satırlık durum çubuğu |
| Tool call & onay bildirimi | native bildirim | satır içi prompt |
| Dosya/diff/test sonucuna deep link | tıklanabilir | dosya:satır metni (çoğu terminal zaten linkler) |
| Oturum resume | terminal tarafında görünür | `skuld resume` |
| Güvenli paste / command preview | terminal destekli | satır içi preview |
| ZeroLink uzak bağlam | hedef göstergesi | **açık metin uyarısı** |

Her satırın plain karşılığı **testli** olmalı; "Cupertino yoksa özellik yok" kabul edilebilir ama "Cupertino yoksa bozuk" kabul edilemez.

## Karar 4 — ZeroLink: hedef her zaman görünür

Uzak oturumda en tehlikeli hata, kullanıcının **hangi makinede** komut çalıştırdığını karıştırmasıdır (T13).

- Her onay isteminde hedef host ve cwd **zorunlu** alan.
- Uzak hedefte çalıştırma **ayrı bir izin sınıfı**; yerel onay uzak çalıştırmayı kapsamaz.
- Uzak/yerel geçişinde görsel ayrım (renk kapalıyken de metinle).
- Mac→Windows yönü test edilene kadar **desteklenen** olarak duyurulmayacak.

## Doğrulanmamış

- Cupertino'nun bugün böyle bir handshake'i **yok**; bu ADR yeni bir sözleşme öneriyor. Karşı taraf implementasyonu cupertino-terminal deposunda ayrı iş kalemi.
- Windows named pipe ACL davranışı ve macOS Unix socket izinleri P0'da ölçülmeli; platformlar arası ilk çalışan sürüm prototip sayılacak.
