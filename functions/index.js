const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const axios = require("axios");
const cors = require("cors")({ origin: true });
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ==========================================
// ▼ Beds24 설정
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

function getStandardRoomName(roomId, rawRoomName) {
  if (ROOM_MAPPING[roomId]) return ROOM_MAPPING[roomId];
  return rawRoomName || `Room(${roomId})`;
}

// 데이터 청소 함수
const cleanPrice = (val) => {
  if (!val) return 0;
  const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  return isNaN(num) ? 0 : num;
};

// ★ [핵심] 예약일 결정 로직 (결제일 추가!)
const determineDate = (b) => {
  // 1순위: 예약 시간
  if (b.bookTime && b.bookTime.length >= 10) return b.bookTime.slice(0, 10);
  
  // 2순위: 시스템 입력 시간
  if (b.entryTime && b.entryTime.length >= 10) return b.entryTime.slice(0, 10);
  
  // 3순위 (New): 인보이스(결제) 날짜 중 가장 빠른 날
  // "결제한 고객"을 찾기 위한 결정적 힌트
  if (b.invoiceItems && Array.isArray(b.invoiceItems) && b.invoiceItems.length > 0) {
    // 날짜가 있는 항목만 골라서 정렬
    const validDates = b.invoiceItems
        .map(item => item.invoiceDate)
        .filter(d => d && d.length >= 10)
        .sort(); // 오름차순 정렬 (가장 옛날 날짜가 맨 앞)
    
    if (validDates.length > 0) {
        return validDates[0]; // 최초 결제일 리턴
    }
  }

  // 4순위: 최후의 수단 (입실일) - 정말 아무것도 없을 때만 사용
  if (b.firstNight) return b.firstNight; 
  
  return null;
};

const determinePlatform = (b) => {
  const source = [b.referer, b.referrer, b.apiSource, b.subSource].join(" ").toLowerCase();
  if (source.includes("booking")) return "Booking";
  if (source.includes("airbnb")) return "Airbnb";
  if (source.includes("expedia")) return "Expedia";
  if (source.includes("agoda")) return "Agoda";
  return "Airbnb";
};

// 동기화 범위: 2024.01 ~ 미래 2년
async function fetchAllBookings() {
  const now = new Date();
  const arrivalFrom = "20240101"; 
  const futureDate = new Date(now);
  futureDate.setMonth(now.getMonth() + 24); 
  const arrivalTo = futureDate.toISOString().slice(0, 10).replace(/-/g, "");

  console.log(`🚀 동기화 범위: ${arrivalFrom} ~ ${arrivalTo}`);

  const promises = PROPERTIES.map(async (prop) => {
    const payload = {
      authentication: { apiKey: BEDS24_API_KEY, propKey: prop.id },
      arrivalFrom, arrivalTo,
      includeInfo: true, includeGuests: true, includeInvoice: true
    };
    try {
      const response = await axios.post("https://api.beds24.com/json/getBookings", payload);
      let bookings = [];
      if (Array.isArray(response.data)) bookings = response.data;
      else if (response.data && Array.isArray(response.data.bookings)) bookings = response.data.bookings;
      return bookings.map(b => ({ ...b, customBuildingName: prop.name }));
    } catch (e) { return []; }
  });

  const results = await Promise.all(promises);
  return results.flat();
}

async function saveToFirestore(allBookings) {
  let batch = db.batch();
  let batchCount = 0;
  let totalCount = 0;

  for (const b of allBookings) {
    const docRef = db.collection("reservations").doc(String(b.bookId));
    const stdRoomName = getStandardRoomName(String(b.roomId), b.roomName);

    let price = cleanPrice(b.price);
    if (price === 0 && b.invoiceItems && Array.isArray(b.invoiceItems)) {
        price = b.invoiceItems.reduce((sum, item) => sum + cleanPrice(item.amount), 0);
    }

    const platform = determinePlatform(b);
    
    // ★ 결제일 포함해서 날짜 결정
    const recordDate = determineDate(b);

    // ★ 상태값 정리
    let status = "confirmed";
    if (String(b.status) === "0" || String(b.status).toLowerCase() === "cancelled") {
        status = "cancelled";
    }

    if (!recordDate) continue; // 날짜를 못 구하면 저장 안 함 (거의 없을 것임)

    batch.set(docRef, {
      id: String(b.bookId),
      date: recordDate, 
      stayMonth: b.firstNight?.slice(0, 7) ?? null,
      building: b.customBuildingName,
      room: stdRoomName,
      platform: platform,
      status: status,
      guestName: `${b.guestFirstName || ""} ${b.guestName || ""}`.trim(),
      price: price,
      currency: b.currency || "JPY",
      updatedAt: new Date()
    });

    batchCount++;
    totalCount++;

    if (batchCount >= 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();
  return totalCount;
}

exports.syncBeds24 = onRequest({ cors: true, timeoutSeconds: 300 }, async (req, res) => {
  cors(req, res, async () => {
    try {
      const allBookings = await fetchAllBookings();
      const count = await saveToFirestore(allBookings);
      return res.json({ success: true, message: `동기화 완료! (결제일 로직 추가됨) 총 ${count}건 저장됨.`, count });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });
});

exports.scheduledBeds24Sync = onSchedule("every 30 minutes", async (event) => {
  try {
    const allBookings = await fetchAllBookings();
    await saveToFirestore(allBookings);
    console.log("⏰ 스케줄러 완료");
  } catch (error) { console.error(error); }
});

exports.getTodayArrivals = onRequest({ cors: true }, async (req, res) => {
  cors(req, res, async () => {
    try {
      const now = new Date();
      const startDate = new Date(now); startDate.setDate(now.getDate() - 30);
      const endDate = new Date(now); endDate.setDate(now.getDate() + 30);
      const arrivalFrom = startDate.toISOString().slice(0, 10).replace(/-/g, "");
      const arrivalTo = endDate.toISOString().slice(0, 10).replace(/-/g, "");

      const promises = PROPERTIES.map(async (prop) => {
        const payload = {
          authentication: { apiKey: BEDS24_API_KEY, propKey: prop.id },
          arrivalFrom, arrivalTo,
          includeInfo: true, includeGuests: true, includeInvoice: true
        };
        try {
          const response = await axios.post("https://api.beds24.com/json/getBookings", payload);
          let bookings = [];
          if (Array.isArray(response.data)) bookings = response.data;
          else if (response.data && Array.isArray(response.data.bookings)) bookings = response.data.bookings;
          return bookings.map(b => ({ ...b, customBuildingName: prop.name }));
        } catch (e) { return []; }
      });

      const results = await Promise.all(promises);
      const allBookings = results.flat();

      const finalResult = allBookings.map(b => {
        let guestName = "이름없음";
        if (b.guestFirstName || b.guestName) {
           guestName = [(b.guestFirstName || ""), (b.guestName || "")].join(" ").trim();
        }
        const stdRoomName = getStandardRoomName(String(b.roomId), b.roomName);
        let price = cleanPrice(b.price);
        if (price === 0 && b.invoiceItems && Array.isArray(b.invoiceItems)) {
            price = b.invoiceItems.reduce((sum, item) => sum + cleanPrice(item.amount), 0);
        }
        const platform = determinePlatform(b);
        let status = "confirmed";
        if (String(b.status) === "0" || String(b.status) === "cancelled") status = "cancelled";

        return {
          id: String(b.bookId),
          bookId: String(b.bookId),
          guestName: guestName,
          arrival: b.firstNight,
          departure: b.lastNight,
          date: determineDate(b),
          stayMonth: b.firstNight ? b.firstNight.slice(0, 7) : "",
          building: b.customBuildingName, 
          room: stdRoomName,
          platform: platform,
          price: price,
          status: status
        };
      });
      return res.json({ success: true, count: finalResult.length, data: finalResult });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
});