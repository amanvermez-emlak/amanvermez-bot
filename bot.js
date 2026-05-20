const puppeteer = require('puppeteer');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, query, orderByChild, equalTo, get, push } = require('firebase/database');
const express = require('express');

// Firebase Yapılandırması
const firebaseConfig = {
    apiKey: "AIzaSyB1Ucw0oOV6JlWUwgPuOgv2Iou_jQumtmQ",
    authDomain: "emlak-panel.firebaseapp.com",
    databaseURL: "https://emlak-panel-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "emlak-panel",
    storageBucket: "emlak-panel.firebasestorage.app",
    messagingSenderId: "465170015059",
    appId: "1:465170015059:web:0050cbec9b3506e86f37a6"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const portfoyRef = ref(db, 'emlak_portfoyleri');

const TARGET_URL = "https://www.sahibinden.com/kiralik/osmaniye-merkez/sahibinden";

async function ilanlariKontrolEt() {
    console.log(`[${new Date().toLocaleString('tr-TR')}] Puppeteer ile Osmaniye Merkez ilanları taranıyor...`);
    let browser;
    try {
        // Bulut sunucusunda çalışabilmesi için özel argümanlarla Chrome'u başlatıyoruz
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();
        
        // Gerçek insan taklidi için User-Agent ve ekran boyutu ayarları
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });

        // Sayfaya git ve tamamen yüklenmesini bekle
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // İlan satırlarını sayfadan çekiyoruz
        const ilanlar = await page.evaluate(() => {
            const rows = document.querySelectorAll('tr.searchResultsItem');
            const data = [];
            rows.forEach(row => {
                const id = row.getAttribute('data-id');
                if (!id) return;

                const baslikEl = row.querySelector('td.searchResultsTitleValue a');
                const fiyatEl = row.querySelector('td.searchResultsPriceValue');
                const tds = row.querySelectorAll('td');

                if (baslikEl) {
                    data.push({
                        ilanNo: id.trim(),
                        baslik: baslikEl.innerText.replace(/\s+/g, ' ').trim().toUpperCase(),
                        fiyat: fiyatEl ? fiyatEl.innerText.replace(/\s+/g, ' ').trim().replace(" TL", "") : "0",
                        metrekare: tds[4] ? tds[4].innerText.trim() : "Belirtilmemiş",
                        odaSayisi: tds[5] ? tds[5].innerText.trim() : "2+1"
                    });
                }
            });
            return data;
        });

        console.log(`Sayfada ${ilanlar.length} adet ilan bulundu. Veritabanı kontrolü yapılıyor...`);

        if (ilanlar.length === 0) {
            console.log("⚠️ Sayfa içeriği okunamadı (Engelleme veya Boş içerik).");
        }

        for (const ilan of ilanlar) {
            const ilanSorgu = query(portfoyRef, orderByChild('ilan_no'), equalTo(ilan.ilanNo));
            const snapshot = await get(ilanSorgu);

            if (!snapshot.exists()) {
                const yeniPortfoy = {
                    ilan_baslik: "🔴 [OTOMATİK] " + ilan.baslik,
                    oda_sayisi: ilan.odaSayisi,
                    metrekare: ilan.metrekare,
                    kat_numarasi: "Bulut Bot",
                    fiyat: ilan.fiyat,
                    portfoy_durumu: "KİRALIK",
                    ilan_no: ilan.ilanNo,
                    sahip_bilgi: "SAHİBİNDEN (BULUT)",
                    adres: "OSMANİYE / MERKEZ",
                    notlar: "7/24 Canlı bulut tarayıcısı tarafından yakalandı.",
                    tarih: new Date().toLocaleString('tr-TR'),
                    timestamp: Date.now()
                };

                await push(portfoyRef, yeniPortfoy);
                console.log(`✅ Havuza yeni ilan eklendi: No ${ilan.ilanNo}`);
            }
        }

    } catch (error) {
        console.error("Tarama esnasında hata oluştu:", error.message);
    } finally {
        if (browser) await browser.close();
    }
}

// 5 dakikada bir çalıştır
ilanlariKontrolEt();
setInterval(ilanlariKontrolEt, 300000);

// Render web portu
const server = express();
server.get('/', (req, res) => res.send('Amanvermez Canlı Bot Aktif!'));
server.listen(process.env.PORT || 3000);