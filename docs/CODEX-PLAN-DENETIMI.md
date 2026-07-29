# Codex plan denetimi (30.07.2026)

`docs/PLAN.md` Codex'e verildi ve **planın kendisi** denetlendi — kod değil,
planın dürüstlüğü. Üç soru: "✅" denen adımlar gerçekten tamamlanmış mı,
"kabul edilen sınır" denen şeyler aslında kapatılabilir mi, ve hedefe göre
planda adı bile geçmeyen ne var.

## Sonuç: iki adım YANLIŞ, üç adım FAZLA İDDİALI

| Adım | Codex | Ne yapıldı |
|---|---|---|
| S1 "Tek güvenlik kapısı devrede" | **YANLIŞ** | İddia daraltıldı: onay/politika kapıdan, süreç başlatma değil. Envanterdeki çelişki açıklandı |
| S2 "Farklılaştırıcılar döngüye bağlı" | **YANLIŞ** | `code_v5` `runAgentic`'i hiç çağırmıyordu — köprü yazıldı ve varsayılan yola bağlandı |
| S3 "9/9 yetenek" | FAZLA İDDİALI | `sub_agent` çalıştırılıyor, LSP sunucu kurulumu ölçülüyor, worktree yedeğe düşerse KIRIK |
| S4 "102 → 75" | DOĞRU | — |
| S5 "Yazma sınırı" | FAZLA İDDİALI | `text_to_speech` de bağlandı; genel araç kapısı hâlâ eksik |
| S6 "Tamamlanma kapısı" | FAZLA İDDİALI | `bash` `cwd`'yi yok sayıyordu; sıralama düzeltildi |
| S7 "26 bulgu" | EMİN DEĞİLİM | Sayı tanımsızdı; plandan çıkarıldı |

## S2 en ağırı — aynı hatanın üçüncü tekrarı

Hafıza ve kalite kapısının "yazılı ama bağlı değil" olmasını **projenin en
öğretici hatası** diye yazdım. `runAgentic`'e bağladım. `runAgentic`'in onları
çağırdığını test ettim. Yetenek denetimine ekledim, yeşil oldu.

Ve varsayılan yolun `runAgentic`'i çağırıp çağırmadığını hiç kontrol etmedim.
Çağırmıyordu — `code_v5` içinde `runAgentic` **sıfır** kez geçiyor.
`UrdrHafiza` ve `KaliteKapisi` `src/` altında testler dışında hiçbir yerden
çağrılmıyordu.

Yetenek denetimi bunu göremedi çünkü `runAgentic`'i **doğrudan** ölçüyordu.
Yanlış katmanı ölçmek: bu, aynı oturumda üçüncü kez.

> **"Bağlandı" iddiası, zincirin her halkası gösterilmeden kurulamaz.**
> Bir halkanın doğru olması, zincirin bağlı olduğunu göstermez.

Şimdi `src/utils/farklilastiricilar.js` var, `code_v5` onu çağırıyor, ve
yetenek denetiminde ayrı bir satır **zincirin son halkasını** kontrol ediyor —
REMEMBER'ın blok kararından SONRA geldiğini de doğruluyor.

## Sınırlar hakkında: dördü kapatılabilirmiş

Codex altı "kabul edilen sınır"dan **dördünü kapatılabilir** buldu. İkisi
makul karar: sınır lint'inin tehdit modeli (kayma, kastî kaçış değil) ve
Verðandi'nin pasif kalması.

En sert olanı 5. madde: `code_execution` "kabul edilmiş sınır değil, güvenlik
borcu" — üstelik araç kullanıcıya **"sandbox'ta çalıştır"** diye tanıtılıyordu.
Açıklama düzeltildi: artık "ALT SÜREÇTE çalıştır. Sandbox DEĞİL." İzolasyon
yanılsaması, izolasyon yokluğundan tehlikeli çünkü kullanıcı olmayan bir
korumaya güvenir.

---

## A) Dürüstlük

- **S1 — YANLIŞ:** “Tek güvenlik kapısı” yok. Envanter 59 doğrudan `child_process` kullanıcısını muaf tutuyor; daha önemlisi “geçirildi” denen `code_execution` hâlâ doğrudan `spawn` çalıştırıyor ([code_execution.js](C:/Projects/natureco-skuld/src/tools/code_execution.js:8), [code_execution.js](C:/Projects/natureco-skuld/src/tools/code_execution.js:62), [kapi-envanteri.json](C:/Projects/natureco-skuld/docs/kapi-envanteri.json:1)). Aynı dosyaların hem `gecirilenler` hem `kalan` listesinde bulunması da kanıtın kendi içinde çelişkili.

- **S2 — YANLIŞ:** `nskuld code` gerçekten `code_v5`’e gider ([nskuld.js](C:/Projects/natureco-skuld/bin/nskuld.js:224)), fakat `code_v5`, `runAgentic` çağırmaz. Workflow varsayılan değil, açıkça opt-in’dir ([code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:493), [code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:1199)); hafıza ve kalite bağlantılı `runAgentic` yalnızca bu workflow’un belirli sağlayıcı kolundadır ([workflow.js](C:/Projects/natureco-skuld/src/tools/workflow.js:220)). Dolayısıyla Urðr + kalite kapısı varsayılan ajan döngüsüne bağlı değildir.

- **S3 — FAZLA İDDİALI:** Betik 9 satırın yeşil olmasını ölçüyor ama 9 yeteneğin etkisini ölçmüyor. `sub_agent` için yalnızca ad/şema/`execute` varlığına bakıyor; çalıştırmıyor ([yetenek-denetimi.mjs](C:/Projects/natureco-skuld/scripts/yetenek-denetimi.mjs:116)). LSP sunucusunu başlatmıyor, yalnızca tanımlı dil adlarını sayıyor ([yetenek-denetimi.mjs](C:/Projects/natureco-skuld/scripts/yetenek-denetimi.mjs:127)). Worktree gerçek Git worktree yerine kopyaya düşse bile sonuç kırılmıyor ([yetenek-denetimi.mjs](C:/Projects/natureco-skuld/scripts/yetenek-denetimi.mjs:106)). Varsayılan tamamlanma bağlantısı da davranış testi değil kaynakta iki metin aramasıdır ([yetenek-denetimi.mjs](C:/Projects/natureco-skuld/scripts/yetenek-denetimi.mjs:255)). “9/9 kontrol yeşil” doğru; “9/9 yetenek çalışıyor/denk” değil.

- **S4 — DOĞRU:** Giriş dosyasında bugün tam 75 `.command(...)` kaydı var; üç turluk ölçümün değerleri de belgelenmiş ([nskuld.js](C:/Projects/natureco-skuld/bin/nskuld.js:164), [KOMUT-KIRPMA.md](C:/Projects/natureco-skuld/docs/KOMUT-KIRPMA.md:160)). Tarihsel 102 başlangıcını yalnızca Git geçmişi/belge üzerinden doğrulayabiliyorum; mevcut kod doğal olarak eski sayıyı içermez.

- **S5 — FAZLA İDDİALI:** Dört çekirdek düzenleme aracı gerçekten sınırlı ve bunlar için etkili test var ([yazma-siniri.test.js](C:/Projects/natureco-skuld/test/security/yazma-siniri.test.js:43), [yazma-siniri.test.js](C:/Projects/natureco-skuld/test/security/yazma-siniri.test.js:91)). Fakat ürünün yazma yüzeyi dört araçtan ibaret değil: örneğin `text_to_speech`, model kontrollü `savePath`’e doğrudan yazar ve workspace sınırı çağırmaz ([text_to_speech.js](C:/Projects/natureco-skuld/src/tools/text_to_speech.js:80)). Genel araç kapısı yalnızca hassas-yol kara listesini uygular, workspace sınırını değil ([tool-execution-gateway.js](C:/Projects/natureco-skuld/src/utils/tool-execution-gateway.js:67)). Bu nedenle “workspace dışına onaysız yazma engelli” genel ölçümü yanlıştır.

- **S6 — FAZLA İDDİALI:** “Etkileşimli değil” kısmı dürüst; headless bağlantı da mevcut. Fakat `code_v5` doğrulamaya `cwd` geçirirken `bash.execute` bunu kullanmaz ve komutu süreç dizininde çalıştırır ([code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:840), [bash.js](C:/Projects/natureco-skuld/src/tools/bash.js:24), [bash.js](C:/Projects/natureco-skuld/src/tools/bash.js:78)). Ayrıca değişiklikten **önce** çalışmış herhangi bir başarılı, kara liste dışı komut sonraki değişikliğin kanıtı sayılabilir ([tamamlanma-kapisi.js](C:/Projects/natureco-skuld/src/utils/tamamlanma-kapisi.js:98), [code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:570)). Bu yüzden headless kapı bağlıdır ama güvenilir tamamlanma kapısı değildir.

- **S7 — FAZLA İDDİALI:** Beş denetim turu ve bunlara karşılık gelen düzeltme commitleri mevcut. Ancak “26 bulgu, hepsi tetiklenerek doğrulandı” toplamını koddan doğrulayamıyorum; belgelerde 3, 5, 7, ardından 7 artık boşluk ve 6 artık boşluk sayılıyor ([CODEX-DENETIM.md](C:/Projects/natureco-skuld/docs/CODEX-DENETIM.md:87), [CODEX-TUR3-BULGULARI.md](C:/Projects/natureco-skuld/docs/CODEX-TUR3-BULGULARI.md:151), [CODEX-TUR3-BULGULARI.md](C:/Projects/natureco-skuld/docs/CODEX-TUR3-BULGULARI.md:242)). Bunların hangilerinin 26 benzersiz bulguya sayıldığı tanımlanmamış. Exact sayı için **EMİN DEĞİLİM**.

## B) Sınırlar

1. **KAPATILABİLİR:** Mutlak anlamsal ispat mümkün olmayabilir; fakat mevcut kapı en azından kanıtın son yazmadan sonra üretilmesini ve görevle ilişkili hedefli test istemeyi sağlayabilir. Şu an eski bir başarılı komutu doğrudan kabul ediyor ([tamamlanma-kapisi.js](C:/Projects/natureco-skuld/src/utils/tamamlanma-kapisi.js:98)).

2. **KABUL EDİLEBİLİR:** Sınır lint’inin amacı güvenilmeyen çalışma zamanı kodunu durdurmak değil, depoya yeni doğrudan `child_process` kullanımının kazara eklenmesini engellemekse kastî kaynak gizleme kod incelemesine bırakılabilir. Bu tehdit modeli betikte açıkça yazılmış ([gateway-boundary-check.mjs](C:/Projects/natureco-skuld/scripts/gateway-boundary-check.mjs:17)).

3. **KAPATILABİLİR:** Plan doğru çözümü zaten söylüyor: araç şemalarında giriş/çıkış yolu semantiği. Alan adı listesi kalıcı karar değil, teknik borçtur ([tool-path-policy.js](C:/Projects/natureco-skuld/src/utils/tool-path-policy.js:32)).

4. **KAPATILABİLİR:** Kara liste yerine yalnızca yapılandırılmış test/typecheck/build/lint sonuçlarını veya açık proje doğrulama tariflerini kabul eden bir allowlist kullanılabilir. Şu an kara listeye uymayan herhangi bir komut “kanıt”tır ([tamamlanma-kapisi.js](C:/Projects/natureco-skuld/src/utils/tamamlanma-kapisi.js:35)).

5. **KAPATILABİLİR:** İzolasyon uygulanabilir ve hedef açısından önemlidir. Üstelik araç kullanıcıya hâlâ “sandbox’ta çalıştır” diye tanıtılıyor ([code_execution.js](C:/Projects/natureco-skuld/src/tools/code_execution.js:105)), gerçekte doğrudan makinede süreç açıyor ([code_execution.js](C:/Projects/natureco-skuld/src/tools/code_execution.js:62)). Bu kabul edilmiş sınır değil, güvenlik/ürün borcudur.

6. **KABUL EDİLEBİLİR:** Tasarrufu kanıtlanmamış optimizasyonun pasif tutulması doğru karar. Etkin davranışa veya başarı iddiasına dönüşmediği sürece kapatılması zorunlu değil.

## C) Eksikler

1. **Kesinti sonrası dosya durumu atomik değil.** Araç yazmayı bitirdikten sonra abort kontrolü çalışıyor; abort olursa mesajlar geri sarılıyor fakat dosya değişikliği geri alınmıyor ve snapshot/izleme aşamasına dahi ulaşılmayabiliyor ([code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:326), [code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:1510)). Kullanıcı “Esc” ile kestiğinde disk ile konuşma geçmişi ayrışabilir.

2. **Undo bütün mutasyon yollarını kapsamıyor.** Değişiklik takibi dört aracı sayıyor, ancak işlem öncesi snapshot yalnızca `write_file` ve `edit_file` için alınıyor ([code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:549), [code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:1503)). `structural_patch`/`notebook_edit` değişiklikleri `/undo` ile güvenilir biçimde geri alınamaz.

3. **İlk kurulum hata mesajı var olmayan komuta yönlendiriyor.** Sağlayıcı ayarlı değilken kullanıcıya `natureco bots` çalıştırması söyleniyor ([code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:499)); `bots` komutu bilerek kaldırılmış ([KOMUT-KIRPMA.md](C:/Projects/natureco-skuld/docs/KOMUT-KIRPMA.md:106)). Ayrıca ürün komutu `nskuld` iken hata metni eski `natureco` adını kullanıyor.

4. **Çok dosyalı semantik refactor yolu yok.** LSP istemcisi yazılmış, fakat yetenek denetimi onu başlatmak yerine yalnızca `DEFAULT_SERVERS` anahtarlarını sayıyor ([yetenek-denetimi.mjs](C:/Projects/natureco-skuld/scripts/yetenek-denetimi.mjs:127)); varsayılan ajan araçlarını `src/tools` manifestinden yüklüyor ([code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:38)) ve LSP/refactor aracı bu yüzeyde yok. Dolayısıyla rename/references doğruluğu modele ve metin değişimine kalıyor.

5. **Model fallback sağlayıcı fallback’i değil.** Hata halinde yalnızca model adı değiştiriliyor; aynı `providerUrl` ve aynı API anahtarı tekrar kullanılıyor ([code_v5.js](C:/Projects/natureco-skuld/src/commands/code_v5.js:172)). Fallback listesinde Claude/Gemini adları bulunsa bile sağlayıcı uç noktası çöktüyse veya bu modelleri sunmuyorsa kurtarma gerçekleşmez ([fallback-chain.js](C:/Projects/natureco-skuld/src/utils/fallback-chain.js:2)).
