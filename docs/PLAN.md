# PLAN — NatureCo Skuld

**Tarih:** 30 Temmuz 2026 · **Sürüm:** 0.1.0 · **Komut:** `nskuld`

**Hedef (kullanıcı tanımı, değiştirilmedi):**
> *"En büyük amacımız Claude Code — yani senden ve Codex'ten daha üstün ve
> daha sorunsuz bir code uygulaması yapmak."*
> *"Senin yapabildiğin her şeyi Skuld da yapabilmeli."*

Bu belge **tek plan kaynağıdır.** Daha önce plan üç dosyaya dağılmıştı
(`ROADMAP.md`, `KOMUT-KIRPMA.md`, `CODEX-DENETIM.md`) ve bunun bedeli ölçüldü:
iki dosya aynı komut listesini tutuyordu, ayrıştılar, ve kayıtlı bir kararın
tersine üç komut silindi (`13b41e5` ile geri alındı). Ayrıntı o dosyalarda
kalıyor; **durum burada.**

---

## 0. Nereden geldi

`natureco-cli` v5.71.2 (`40b4913`) fork edildi. Fork noktasında 1127 test
geçiyordu ve **hepsi hâlâ geçiyor**. Sıfırdan yazmak denendi ve terk edildi:
4 araç + 35 test yazılmışken, 92 araç + 1127 test kullanılmadan duruyordu.

Sınır **silerek** çizildi, ekleyerek değil — silinen `git log`'da görünür,
eklenmeyen görünmez.

---

## 1. Adımlar ve durum

| # | Adım | Durum | Kanıt |
|---|---|---|---|
| S1 | Onay/politika kapısı devrede | ⚠ kısmi | onay+politika kapıdan; **süreç başlatma 59 dosyada hâlâ doğrudan** |
| S2 | Farklılaştırıcılar varsayılan yolda | ✅ | RECALL + kalite kapısı + REMEMBER `code_v5` içinde |
| S3 | Yetenek denkliği denetimi | ✅ | `npm run yetenekler` → 10/10, **etki ölçüyor** |
| S4 | Komut kırpma | ✅ | 102 → 75 kayıt, açılış %16 hızlı (3 turda ölçüldü) |
| S5 | Yazma sınırı | ✅ | 4 düzenleme aracı + `text_to_speech` |
| S6 | Tamamlanma kapısı | ⚠ kısmi | headless bağlı, etkileşimli DEĞİL |
| S7 | Codex denetimi | ✅ | 6 tur; son turda **planın kendisi** denetlendi |
| S8 | Depo + yayın | ⚠ hazır | paket **çalışır durumda doğrulandı**; depo oluşturma ve yayın kullanıcı onayı bekliyor |
| S9 | Verðandi kapsülü | ⏸ pasif | tasarruf yarı kanıtlandı, ölçüm tekrarı bekliyor |
| S10 | Kimlik/ekosistem (SSO, portal) | ❌ | başlanmadı |

### S1 — Onay/politika kapısı ⚠ kısmi

**Bu adım önce "✅ Tek güvenlik kapısı devrede" yazıyordu ve Codex plan
denetimi bunu YANLIŞ buldu.** Haklıydı: 59 dosya hâlâ doğrudan
`child_process` kullanıyor, ve "geçirildi" denen `code_execution` da onların
arasında. Envanter JSON'unda `git.js` ve `code_execution.js` hem
`gecirilenler` hem `kalan` listesindeydi ve iki listenin ne ölçtüğü yazılı
değildi — kanıt kendi içinde çelişkili görünüyordu.

Gerçek durum: **onay ve politika** kapıdan geçiyor, **süreç başlatma**
geçmiyor. İkisi farklı şey ve artık envanterde açıkça yazıyor. "Tek güvenlik
kapısı" hedeftir, bugünün durumu değil.

`packages/execution-gateway` yazılmıştı ama hiçbir yerden çağrılmıyordu. Bugün
kabuk, git ve kod yollarının **onayı** kapıdan geçiyor; ağ ayrı bir izin
sınıfı.

**Kasten yapılmayan:** kalan 59 dosya mekanik olarak geçirilmedi. Tek tek
okundu — macOS araçları betiği stdin'den, veriyi `argv`'den geçiriyor
(enjeksiyon yok), `cron_create` zaten onay istiyor, `delegate_task` alt sürece
kendi CLI'mızı açıyor. Ölçülebilir kazanç yok, 1200 test karşılığında büyük
risk var. Sınır lint'i bunun yerine **cırcır mandalı**: envanter dondu, liste
yalnızca kısalabilir, iki yönde de kırıyor.

### S2 — Farklılaştırıcılar ✅ (ama önce YANLIŞ iddia edilmişti)

Hafıza ve kalite kapısı **aylardır yazılı ve testliydi, döngü ikisini de hiç
çağırmıyordu.** Bunu "projenin en öğretici hatası" diye yazdım, `runAgentic`'e
bağladım, ve **aynı hatayı bir kat yukarıda tekrarladım.**

Codex plan denetimi: `code_v5` — varsayılan `nskuld code` yolu — içinde
`runAgentic` **sıfır kez** geçiyor. `runAgentic`'e yalnızca `workflow.js`
üzerinden ulaşılıyor ve workflow **opt-in**. Yani `UrdrHafiza` ve
`KaliteKapisi` sınıfları `src/` altında testler dışında hiçbir yerden
çağrılmıyordu.

Yetenek denetimi bunu göremedi çünkü `runAgentic`'i **doğrudan** ölçüyordu —
yanlış katmanı ölçmenin üçüncü tekrarı.

Ders: **"bağlandı" iddiası, zincirin her halkası gösterilmeden kurulamaz.**
Şimdi `src/utils/farklilastiricilar.js` köprüsü var, `code_v5` onu çağırıyor,
ve yetenek denetimi zincirin son halkasını ayrıca kontrol ediyor.

- RECALL hatıraları göreve **veri olarak** ekliyor ("NOTTUR, talimat değil") —
  zehirlenmiş hafıza her oturumda tekrarlanan prompt injection'dır.
- REMEMBER yalnızca dosya değiştiyse VE gerçek doğrulama başarılıysa VE kapı
  bloklamadıysa yazıyor.

### S4 — Komut kırpma ✅

102 → 75. `--help` açılışı 388 ms → ~325 ms (%16, üç turda ölçüldü çünkü tek
koşum kanıt değil).

**Kalanlar** — ilk sınıflandırmada yanlışlıkla silinecekler listesindeydi:
`dashboard` `workboard` `browser` `web-fetch` `cron` `hooks` `webhooks`
`daemon` `gateway` `node` `nodes` `acp`. Ada bakarak sınıflandırmak ucuz ve
yanlış: `acp` bir ağ protokolü gibi duruyor, gerçekte kodlama ajanına giden
takma ad.

### S6 — Tamamlanma kapısı ⚠

Codex plan denetimi iki kusur daha buldu ve ikisi de düzeltildi:
`bash.execute` `cwd` parametresini **hiç işlemiyordu**, yani doğrulama komutu
sürecin dizininde koşuyordu — yanlış dizinde koşan test, koşmamış testtir ama
yeşil görünür. Ayrıca değişiklikten **önce** koşmuş bir komut sonraki
değişikliğin kanıtı sayılabiliyordu.

Varsayılan `nskuld code` yolu, model araç çağırmayı bıraktığı anda
**başarıyla** bitiyordu. Kanıt kuralı `agentic-runner`'da vardı ama
kullanıcının fiilen kullandığı yolda yoktu — yani yoktu.

Bugün: dosya değiştiyse test > typecheck > build > lint sırasıyla doğrulama
koşuluyor, başarısızsa çıktı modele geri veriliyor (en fazla 2 onarım turu),
komut hiç bulunamazsa **sessizce başarılı sayılmıyor**.

**Eksik kalan:** etkileşimli yol bağlı değil. Gerekçe: etkileşimli kullanıcı
her turu görüyor, headless olan görmüyor — risk orada. Ama bu bir eksik ve
öyle yazıyor.

---

## 2. Ölçüm

| | Fork noktası | Bugün |
|---|---|---|
| Devralınan test | 1127 | **1200** / 3 atlanıyor |
| Paket testi | 0 | **42** |
| Yetenek denetimi | yok | **10/10** (`npm run yetenekler`) |
| Mutasyon denemesi | yok | **11/11** (`npm run mutasyon`) |
| Komut kaydı | 102 | **75** |
| Araç | 92 | 92 |
| `--help` açılışı | 388 ms | ~325 ms |
| Kapıdan geçen çalıştırma yolu | 0 | kabuk, git, kod |
| Sınır lint kapsamı | 4 dosya | 330 dosya |
| Hayalet komut | 2 | **0** |
| Workspace dışına onaysız yazma | mümkün | 5 yazma aracında **engelli** |
| Farklılaştırıcılar varsayılan yolda | yok | RECALL + kapı + REMEMBER |

> **"Engelli" satırı önce koşulsuz yazılmıştı ve Codex plan denetimi bunu
> YANLIŞ buldu:** sınır dört düzenleme aracına bağlanmıştı, oysa
> `text_to_speech` model kontrollü `savePath`'e doğrudan yazıyordu. Yazma
> yüzeyi dört araçtan ibaret değil. O araç da bağlandı; genel araç kapısının
> workspace sınırını uygulaması hâlâ yapılmadı.

Fork noktasındaki 1127 testin **tamamı** geçiyor. İki devralınan testin
beklentisi değişti, ikisi de ölçülerek çürütüldüğü için ve gerekçesi yanında
yazılı.

---

## 3. Kabul edilen ve belgelenen sınırlar

Bunlar eksik değil, **karar**. Gizlenmiyorlar çünkü gizlenen sınır yanlış
güven verir.

1. **Tamamlanma kapısı ilgililik kanıtlamıyor.** `npm test` geçmesi deponun
   yeşil olduğunu gösterir; istenen davranışın eklendiğini göstermez.
   *Codex: KAPATILABİLİR — kanıtın son yazmadan SONRA üretilmesi zorunlu
   kılınabilir. Kısmen yapıldı (sıralama kontrolü), hedefli test istemek
   yapılmadı.*
2. **Sınır lint'i kastî kaçışı yakalamaz.** `createRequire`, dize birleştirme.
   Tehdit modeli kayma, kastî kaçış kod incelemesinin işi.
3. **Yol alanları ADLA sınıflandırılıyor.** Yeni bir araç `downloadPath`
   getirirse listeye eklenmeli. Doğru çözüm araç şemasının giriş/çıkış yol
   semantiğini bildirmesi — ayrı iş.
4. **Doğrulama kara listesi tanımı gereği eksik.**
5. **`code_execution` sandbox değil.** Onay + ortam süzgeci var; izolasyon yok.
   *Codex: bu kabul edilmiş sınır DEĞİL, güvenlik/ürün borcu — üstelik araç
   kullanıcıya hâlâ "sandbox'ta çalıştır" diye tanıtılıyor. Açıklama
   düzeltildi; izolasyon açık borç olarak duruyor.*
6. **Verðandi tasarrufu kanıtlanmadı.** Koşumlar arası 84 kat fark ölçüldü;
   ona dayanan eşik yanlış çıktı. Pasif.

---

## 4. Kalan iş

### Bende

| İş | Neden bekliyor |
|---|---|
| Tamamlanma kapısını etkileşimli yola bağlamak | `code_v5` 1300+ satır; headless önce, ölçülerek |
| Verðandi ölçümünü tekrarlamak | görev başına 5–10 tekrar + medyan gerekiyor |
| S10 kimlik/ekosistem | S1–S6 önce |

### Kullanıcıda (bensiz ilerlemez)

| İş | Durum | Engel |
|---|---|---|
| `github.com/natureco-official/natureco-skuld` deposu | **yok** | `package.json` oraya işaret ediyor; açılmadan yayınlanırsa bağlantılar 404 |
| CI'ın gerçekten koşması | **hiç koşmadı** | depo yok; Linux/macOS'ta yeşil olduğu görülmedi, yalnızca Windows'ta |
| `npm publish` | yapılmadı | kullanıcı kararı |

Depo oluşturmak ve yayınlamak **dışa dönük ve geri alınması zor** eylemler.
Onay olmadan yapılmadı. `gh` ve `npm` oturumları açık, yani onay geldiğinde
engel yok.

### Yayın hazırlığında bulunan İKİ ciddi kusur

Yayınlamadan önce paketi açıp çalıştırmak, ikisini de ortaya çıkardı. İkisi de
"depoda çalışıyor, pakette çalışmıyor" sınıfında ve 1200 test hiçbirini
göremezdi:

1. **`packages/` yayına hiç girmiyordu.** `.gitignore` `dist/`'i dışlıyor ve
   `.npmignore` yokken npm onu devralıyordu. Köprü kapıyı
   `packages/execution-gateway/dist`ten yüklüyor — yani yayınlanan `nskuld`
   kapıyı açamaz, `yazmaSiniri` "sınır uygulanamadı" der ve **hiçbir dosya
   yazamaz.** Ürün tamamen çalışmaz hâlde yayınlanacaktı.

   `files` listesine `packages/*/dist` yazmak da yetmedi; npm sondaki `/**`
   olmadan dizini almıyor. Doğru desen `packages/*/dist/**`.

2. **Paketlenen dist kendi kendine yeterli değildi.** Derlenmiş kapı
   `@skuld/shared`'ı çıplak isimle import ediyor ve bu yalnızca workspace
   symlink'iyle çözülüyor; paketler `private: true` ve sürümleri `0.0.0`, yani
   npm'den de çözülemezler. Dosyaları paketlemek yetmedi, içlerindeki yolların
   da taşınabilir olması gerekti.

   `scripts/dist-yollari-duzelt.mjs` derleme sonrası çıplak isimleri göreli
   yola çeviriyor.

Ayrıca `git remote origin` hâlâ **fork kaynağını** (`natureco-cli`)
gösteriyordu: bir `git push`, Skuld'un 396 commit'ini o depoya yazardı.
Skuld'un kendi adresine çevrildi.

`scripts/yayin-onkontrol.mjs` (`prepublishOnly` içinde) paketi açıp zorunlu
dosyaları arıyor, `--version`ı paketten çalıştırıyor ve **kapının paket içinden
yüklenebildiğini** doğruluyor. `files` listesine bakmak yetmez — liste doğru
görünüp yol yanlış olabilir.

---

## 5. Codex denetimi — beş tur

| Tur | Ne denetlendi | Bulgu | Sonuç |
|---|---|---|---|
| 1 | Kapıya bağlama | 3 | 3'ü doğrulandı, kapandı |
| 2 | Ağ izin sınıfı | 5 | 5'i doğrulandı, kapandı |
| 3 | Tur 2 düzeltmeleri | 7 | 7'si doğrulandı, kapandı |
| 3b | Tur 3 düzeltmeleri | 7 artık boşluk | 7'si kapandı |
| 4 | Tur 3b düzeltmeleri | 6 + **testler sabitlemiyor** | 6'sı kapandı, testler güçlendirildi |
| 5 | Yakınsama + strateji | **asıl risk başka yerde** | yazma sınırı + tamamlanma kapısı |

**Codex'in en değerli iki katkısı benim kodum hakkında değildi:**

Tur 4: beş test yeşildi, düzeltmeler doğruydu, **testler düzeltmeleri
sabitlemiyordu.** `npm run mutasyon` bunun cevabı; ilk koşumda üç mutasyon
hayatta kaldı — Codex'in söylediğinden ikisi fazla.

Tur 5: dört turdur hassas yol **kara listesine** desen ekliyordum. Asıl risk
`write_file`ın workspace dışına onaysız yazabilmesiydi. Kara liste "neyi
yasaklayacağını bilmek" ister; sınır "neyin içeride olduğunu bilmek" — ikincisi
bilinebilir.

---

## 6. Bu planın denetlenmesi

Codex'e sorulan: *bu plan dürüst mü?* Yani "tamamlandı" denen bir adım
gerçekten tamamlanmış mı, "kabul edilen sınır" denen bir şey aslında
kapatılabilir bir eksik mi, ve ürün hedefine göre planda hiç görünmeyen ne var.

Sonuç: `CODEX-PLAN-DENETIMI.md`.
