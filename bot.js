const axios = require('axios');
const cheerio = require('cheerio');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, query, orderByChild, equalTo, get, push } = require('firebase/database');
const express = require('express');

// Sizin Ofis Paneline Ait Tam Firebase Yapılandırması (Şifre istemez)
const firebaseConfig = {
    apiKey: "AIzaSyB1Ucw0oOV6JlWUwgPuOgv2Iou_jQumtmQ",
    authDomain: "emlak-panel.firebaseapp.com",
    databaseURL: "https://emlak-panel-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "emlak-panel",
    storageBucket: "emlak-panel.firebasestorage.app",
    messagingSenderId: "465170015059",
    appId: "1:465170015059:web:0050cbec9b3506e86f37a6"
};

// Firebase Başlatma
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const portfoyRef = ref(db, 'emlak_portfoyleri');

const TARGET_URL = "https://www.sahibinden.com/kiralik/osmaniye-merkez/sahibinden";

async function ilanlariKontrolEt() {
    console.log(`[${new Date().toLocaleString('tr-TR')}] Osmaniye Merkez ilanları kontrol ediliyor...`);
    try {
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

        ilanSatirlari.each(async (index, element) => {
            const ilanNo = $(element).attr('data-id');
            if (!ilanNo) return;

            const baslikElement = $(element).find('td.searchResultsTitleValue a');
            if (!baslikElement.length) return;
            let ilanBaslik = baslikElement.text().replace(/\s+/g, ' ').trim().toUpperCase();

            const fiyatElement = $(element).find('td.searchResultsPriceValue');
            let fiyat = fiyatElement ? fiyatElement.text().replace(/\s+/g, ' ').trim().replace(" TL", "") : "0";

            const hucreler = $(element).find('td');
            let metrekare = "Belirtilmemiş";
            let odaSayisi = "2+1";

            if (hucreler.length >= 6) {
                metrekare = $(hucreler[4]).text().trim();
                odaSayisi = $(hucreler[5]).text().trim();
            }

            // Hafifletilmiş Yeni Sorgu Mantığı
            const ilanSorgu = query(portfoyRef, orderByChild('ilan_no'), equalTo(ilanNo));
            const snapshot = await get(ilanSorgu);

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

                await push(portfoyRef, yeniPortfoy);
                console.log(`✅ Havuza yeni ilan eklendi: No ${ilanNo} - ${ilanBaslik}`);
            }
        });

    } catch (error) {
        console.error("Hata oluştu:", error.message);
    }
}

// 5 dakikada bir otomatik çalışma döngüsü
ilanlariKontrolEt();
setInterval(ilanlariKontrolEt, 300000);

// Sunucu açık kalma ayarı
const server = express();
server.get('/', (req, res) => res.send('Amanvermez Bot Aktif ve Çalışıyor!'));
server.listen(process.env.PORT || 3000);