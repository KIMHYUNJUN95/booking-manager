const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const axios = require("axios");
const admin = require("firebase-admin");
const dayjs = require("dayjs");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// ==========================================
// 1) CONSTANTS & MAPPING (사용자 정보 포함)
// ==========================================
const BEDS24_API_KEY = "9378AnbjfrIDo3j9MmrQZjwKd";
const PROPERTIES = [
    { name: "아라키초A", id: "NSoH37aJMipHA4K4MPVyp2pnq" },
    { name: "아라키초B", id: "AV3yKzD2gFz4OmNdlv4qANoQc" },
    { name: "다이쿄초", id: "CXNtlpJnRuKJDPrTpqOaa3yws" },
    { name: "가부키초", id: "3ldwEucRNOIyhAdAhFWbBhw3e" },
    { name: "다카다노바바", id: "8Nx8VcOYwSYVAwG01xkokmsX7" },
    { name: "오쿠보A동", id: "dJQloWov7XuXMUmSXyVsLP8LR" },
    { name: "오쿠보B동", id: "WbtREQENBg6aIR0pgEIympSAv" },
    { name: "오쿠보C동", id: "MXP5jJXp2mPxVhjdTAF0KnHTP" },
    { name: "사노시", id: "gDzuVIkyvm5fqtuifdveeIKZO" }
];

function getStandardRoomName(roomId, rawName) {
    const ROOM_MAPPING = {
        "383971": "201호", "601545": "201호", "403542": "202호", "601546": "202호",
        "383972": "301호", "601547": "301호", "383978": "302호", "601548": "302호",
        "440617": "401호", "515300": "401호", "383974": "402호", "601549": "402호",
        "502229": "501호", "383975": "501호", "383976": "502호", "601550": "502호",
        "537451": "602호", "601551": "602호", "383973": "701호", "601552": "701호",
        "383977": "702호", "601553": "702호",
        "585734": "101호", "585738": "102호", "585735": "201호", "585739": "202호",
        "585736": "301호", "585740": "302호", "585737": "401호", "585741": "402호",
        "440619": "B01호", "440620": "B02호", "440621": "101호", "440622": "102호",
        "440623": "201호", "440624": "202호", "440625": "302호",
        "383979": "202호", "451220": "202호", "383980": "203호", "452061": "203호",
        "383981": "302호", "452062": "302호", "383982": "303호", "451223": "303호",
        "383983": "402호", "451224": "402호", "383984": "403호", "452063": "403호",
        "543189": "502호", "601560": "502호", "383985": "603호", "452064": "603호",
        "441885": "802호", "452065": "802호", "624198": "803호",
        "437952": "오쿠보A", "615969": "오쿠보B", "450096": "오쿠보C", "496532": "오쿠보C",
        "481152": "사노",
        "513698": "201호", "513699": "301호", "513700": "401호", "556719": "401호",
        "513701": "501호", "513702": "601호", "513703": "701호", "513704": "801호", "513705": "901호"
    };
    return ROOM_MAPPING[roomId] || rawName || `Room(${roomId})`;
}
const cleanPrice = (val) => {
    if (!val) return 0;
    const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? 0 : num;
};
const determineStatus = (b) => {
    const s = String(b.status);
    if (s === "1" || s === "2") { return "confirmed"; }
    return "cancelled";
};

// ==========================================
// 2) HELPER: DATE LOGIC (bookingTime 우선순위 적용)
// ==========================================
const determineDate = (b) => {
    // 1순위: [최종 발견 필드] bookingTime 사용 (가장 정확한 예약 접수일)
    if (b.bookingTime && b.bookingTime.length >= 10) return b.bookingTime.slice(0, 10);
    
    // 2순위: bookTime
    if (b.bookTime && b.bookTime.length >= 10) return b.bookTime.slice(0, 10);
    
    // 3순위: entryTime
    if (b.entryTime && b.entryTime.length >= 10) return b.entryTime.slice(0, 10);
    
    // 4순위: invoiceDate (결제일)
    if (b.invoiceItems && Array.isArray(b.invoiceItems) && b.invoiceItems.length > 0) {
        const validDates = b.invoiceItems
            .map(item => item.invoiceDate)
            .filter(d => d && d.length >= 10)
            .sort();
        if (validDates.length > 0) return validDates[0].slice(0, 10);
    }
    
    // ★ 입실일(firstNight)은 사용하지 않음 (뻥튀기 영구 방지)
    return null;
};

// ==========================================
// 3) NORMALIZE & FETCH (Normal Sync)
// ==========================================
function normalize(b, propKey, building) {
    const status = determineStatus(b);
    const bookDateStr = determineDate(b);
    
    const arrival = b.firstNight ? b.firstNight.slice(0, 10) : null;
    // ★ 퇴실일 = lastNight + 1일 (마지막 숙박일 다음날이 실제 체크아웃)
    const departure = b.lastNight ? dayjs(b.lastNight).add(1, 'day').format('YYYY-MM-DD') : null;
    const stayMonth = arrival ? arrival.slice(0, 7) : null;

    const date = bookDateStr; // 대시보드 쿼리 필드 (정확한 예약 접수일)

    const allSources = [b.referer, b.referrer, b.apiSource, b.subSource, b.source, b.channel].join(" ").toLowerCase();
    let platform = "Airbnb";
    if (allSources.includes("booking")) platform = "Booking";
    else if (allSources.includes("expedia")) platform = "Expedia";
    else if (allSources.includes("agoda")) platform = "Agoda";

    let totalPrice = 0;
    if (Array.isArray(b.invoiceItems) && b.invoiceItems.length > 0) {
        totalPrice = b.invoiceItems.reduce((s, x) => s + cleanPrice(x.amount || 0), 0);
    } else if (b.price) {
        totalPrice = cleanPrice(b.price);
    } else if (b.amount) {
        totalPrice = cleanPrice(b.amount);
    }
    const nights = (arrival && departure) ? dayjs(departure).diff(dayjs(arrival), "day") : 0;

    return {
        id: String(b.bookId), bookId: String(b.bookId), propKey, roomId: String(b.roomId), room: getStandardRoomName(String(b.roomId), b.roomName),
        building, guestName: `${b.guestFirstName || ""} ${b.guestName || ""}`.trim(),
        status, rawStatus: String(b.status), platform,
        date, price: totalPrice, nights,
        bookDate: bookDateStr, arrival, departure, stayMonth, totalPrice,
        updatedAt: new Date(),
    };
}

async function fetchFromBeds24() {
    const arrivalFrom = "20240101";
    const arrivalTo = dayjs().add(24, "month").format("YYYYMMDD"); 

    const tasks = PROPERTIES.map(async (prop) => {
        try {
            const res = await axios.post("https://api.beds24.com/json/getBookings", {
                authentication: { apiKey: BEDS24_API_KEY, propKey: prop.id },
                arrivalFrom, arrivalTo, includeInfo: true, includeGuests: true, includeInvoice: true
            });
            const arr = Array.isArray(res.data) ? res.data : res.data.bookings || [];
            return arr.map((b) => normalize(b, prop.id, prop.name));
        } catch (err) {
            console.error("❌ Fetch Error:", prop.name, err.message);
            return [];
        }
    });
    return (await Promise.all(tasks)).flat();
}

async function saveBookings(list) {
    const batchLimit = 400;
    let batch = db.batch();
    let count = 0;

    for (const item of list) {
        // [0건 방지] 날짜가 null이더라도 저장을 스킵하지 않음
        const docRef = db.collection("reservations").doc(item.id);
        batch.set(docRef, item, { merge: true });

        count++;
        if (count % batchLimit === 0) {
            await batch.commit();
            batch = db.batch();
        }
    }
    if (count % batchLimit !== 0) { await batch.commit(); }
    return count;
}


// ==========================================
// 4) EXPORTS
// ==========================================

// 일반 동기화 (메모리 증설 적용)
exports.syncBeds24 = onRequest({ cors: true, timeoutSeconds: 540, memory: '512MiB' }, async (req, res) => {
    try {
        const list = await fetchFromBeds24();
        const count = await saveBookings(list);
        res.json({ success: true, message: `동기화 완료! ${count}건 저장됨.`, count });
    } catch (e) {
        console.error("Sync Failed:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 스케줄러 (자동 동기화)
exports.scheduledBeds24Sync = onSchedule("every 30 minutes", async () => {
    const list = await fetchFromBeds24();
    await saveBookings(list);
});

// 입/퇴실 조회
exports.getTodayArrivals = onRequest({ cors: true }, async (req, res) => {
    const date = req.body.date || dayjs().format("YYYY-MM-DD");

    const snap = await db.collection("reservations")
        .where("status", "==", "confirmed")
        .get();

    const list = [];
    snap.forEach((d) => {
        const x = d.data();
        if (x.arrival === date || x.departure === date) list.push(x);
    });

    res.json({ success: true, data: list });
});