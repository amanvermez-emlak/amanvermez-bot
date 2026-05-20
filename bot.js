const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

// Sizin Firebase Veritabanı Yapılandırmanız
const firebaseConfig = {
    databaseURL: "https://emlak-panel-default-rtdb.europe-west1.firebasedatabase.app"
};

// Firebase'i Başlatma
admin.initializeApp({
    credential: admin.credential.applicationDefault(), // Bulut sunucusunda otomatik yetki alacak
    databaseURL: firebaseConfig.databaseURL
});

const db = admin.database();
const portfoyRef = db.ref('emlak_portfoyleri');

// Sizin Sahibinden Osmaniye Merkez Kiralık Filtre Linkiniz
const TARGET_URL = "https://www.sahibinden.com/kiralik/osmaniye-merkez/sahibinden";

async function ilanlariKontrolEt() {
    console.log(`[${new Date().toLocaleString('tr-TR')}] Osmaniye Merkez ilanları kontrol ediliyor...`);
    try {
        // Sahibinden botları engellemesin diye gerçek kullanıcı taklidi yapıyoruz (User-Agent)
        const response = await axios.get(TARGET_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const $ = cheerio.load(response.data);
        const ilanSatirlari = $('tr.searchResultsItem');

        if (ilanSatirlari.length === 0) {
            console.log("⚠️ Sahibinden güvenlik duvarına takılmış olabilir veya ilan bulunamadı.");
            return;
        }

        ilanSatirlari.each((index, element) => {
            const ilanNo = $(element).attr('data-id');
            if (!ilanNo) return;

            const baslikElement = $(element).find('td.searchResultsTitleValue a');
            let ilanBaslik = baslikElement.text().replace(/\s+/g, ' ').trim().toUpperCase();

            const fiyatElement = $(element).find('td.searchResultsPriceValue');
            let fiyat = fiyatElement ? fiyatElement.text().replace(/\s+/g, ' ').trim().replace(" TL", "") : "0";

            // Tablodaki hücreleri tarayarak M2 ve Oda Sayısını Alıyoruz
            const hucreler = $(element).find('td');
            let metrekare = "Belirtilmemiş";
            let odaSayisi = "2+1";

            if (hucreler.length >= 6) {
                metrekare = $(hucreler[4]).text().trim();
                odaSayisi = $(hucreler[5]).text().trim();
            }

            // Veritabanında kontrol et, yoksa otomatik ekle
            portfoyRef.orderByChild('ilan_no').equalTo(ilanNo).once('value', (snapshot) => {
                if (!snapshot.exists()) {
                    const yeniPortfoy = {
                        ilan_baslik: "🔴 [OTOMATİK] " + ilanBaslik,
                        oda_sayisi: odaSayisi,
                        metrekare: metrekare,
                        kat_numarasi: "Bulut Bot",
                        fiyat: fiyat,
                        portfoy_durumu: "KİRALIK",
                        ilan_no: ilanNo,
                        sahip_bilgi: "SAHİBİNDEN (BULUT)",
                        adres: "OSMANİYE / MERKEZ",
                        notlar: "7/24 Bulut sistemi tarafından otomatik yakalanan ilan.",
                        tarih: new Date().toLocaleString('tr-TR'),
                        timestamp: Date.now()
                    };

                    portfoyRef.push(yeniPortfoy).then(() => {
                        console.log(`✅ Havuza yeni ilan eklendi: No ${ilanNo} - ${ilanBaslik}`);
                    });
                }
            });
        });

    } catch (error) {
        console.error("Hata oluştu:", error.message);
    }
}

// Bulut sunucusunun kapanmaması ve her 5 dakikada bir (300.000 milisaniye) otomatik çalışması için döngü
ilanlariKontrolEt();
setInterval(ilanlariKontrolEt, 300000);

// Render platformunun kapanmaması için basit bir web portu açıyoruz
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Amanvermez Bot Aktif ve Çalışıyor!'));
app.listen(process.env.PORT || 3000);