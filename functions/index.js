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

// ==========================================
// ★ 객실 이름 정리
// ==========================================
const ROOM_MAPPING = {
  // 아라키초A
  "383971": "201호", "601545": "201호", "403542": "202호", "601546": "202호",
  "383972": "301호", "601547": "301호", "383978": "302호", "601548": "302호",
  "440617": "401호", "515300": "401호", "383974": "402호", "601549": "402호",
  "502229": "501호", "383975": "501호", "383976": "502호", "601550": "502호",
  "537451": "602호", "601551": "602호", "383973": "701호", "601552": "701호",
  "383977": "702호", "601553": "702호",
  // 아라키초B
  "585734": "101호", "585738": "102호", "585735": "201호", "585739": "202호",
  "585736": "301호", "585740": "302호", "585737": "401호", "585741": "402호",
  // 다이쿄초
  "440619": "B01호", "440620": "B02호", "440621": "101호", "440622": "102호",
  "440623": "201호", "440624": "202호", "440625": "302호",
  // 가부키초
  "383979": "202호", "451220": "202호", "383980": "203호", "452061": "203호",
  "383981": "302호", "452062": "302호", "383982": "303호", "451223": "303호",
  "383983": "402호", "451224": "402호", "383984": "403호", "452063": "403호",
  "543189": "502호", "601560": "502호", "383985": "603호", "452064": "603호",
  "441885": "802호", "452065": "802호", "624198": "803호",
  // 오쿠보 A, B, C
  "437952": "오쿠보A", "615969": "오쿠보B", "450096": "오쿠보C", "496532": "오쿠보C",
  // 사노
  "481152": "사노",
  // 다카다노바바
  "513698": "201호", "513699": "301호", "513700": "401호", "556719": "401호",
  "513701": "501호", "513702": "601호", "513703": "701호", "513704": "801호", "513705": "901호"
};

function getStandardRoomName(roomId, rawRoomName) {
  if (ROOM_MAPPING[roomId]) return ROOM_MAPPING[roomId];
  return rawRoomName || `Room(${roomId})`;
}

// ==========================================
// 공통 함수: 데이터 가져오기 (24년 1월 ~ 미래 2년)
// ==========================================
async function fetchAllBookings() {
  const now = new Date();
  const arrivalFrom = "20240101"; // 시작일 고정
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
    } catch (e) {
      console.error(`❌ ${prop.name} 조회 실패:`, e.message);
      return [];
    }
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

    // 금액 계산
    let price = 0;
    if (b.price) {
        price = parseFloat(b.price);
    } else if (b.invoiceItems && Array.isArray(b.invoiceItems)) {
        price = b.invoiceItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    }

    // 플랫폼 확인
    let platform = "Airbnb";
    if (b.referer && b.referer.toLowerCase().includes("booking")) {
        platform = "Booking";
    }

    // ★ [핵심 수정] 예약일(bookTime)이 없으면 체크인날짜(firstNight)를 대신 씀
    // 이렇게 해야 대시보드에서 '날짜 없음'으로 누락되는 것을 막을 수 있습니다.
    let recordDate = null;
    if (b.bookTime) {
        recordDate = b.bookTime.slice(0, 10);
    } else if (b.firstNight) {
        recordDate = b.firstNight; // 예약일 정보 없으면 체크인 날짜로 대체
    }

    batch.set(docRef, {
      id: String(b.bookId),
      date: recordDate, // 수정된 날짜 로직 적용
      stayMonth: b.firstNight?.slice(0, 7) ?? null,
      building: b.customBuildingName,
      room: stdRoomName,
      platform: platform,
      status: b.status === "0" ? "cancelled" : "confirmed", // 0(취소) 아니면 다 확정으로 간주
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

// 1. 수동 동기화
exports.syncBeds24 = onRequest({ cors: true, timeoutSeconds: 300 }, async (req, res) => {
  cors(req, res, async () => {
    try {
      const allBookings = await fetchAllBookings();
      const count = await saveToFirestore(allBookings);
      return res.json({ success: true, message: `동기화 완료! 총 ${count}건 저장됨.`, count });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });
});

// 2. 자동 스케줄러
exports.scheduledBeds24Sync = onSchedule("every 30 minutes", async (event) => {
  try {
    const allBookings = await fetchAllBookings();
    await saveToFirestore(allBookings);
    console.log("⏰ 스케줄러 동기화 완료");
  } catch (error) {
    console.error("⏰ 스케줄러 에러:", error);
  }
});

// 3. 입/퇴실 조회
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

        let price = 0;
        if (b.price) price = parseFloat(b.price);
        else if (b.invoiceItems && Array.isArray(b.invoiceItems)) {
            price = b.invoiceItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        }

        let platform = "Airbnb";
        if (b.referer && b.referer.toLowerCase().includes("booking")) {
            platform = "Booking";
        }

        return {
          id: String(b.bookId),
          bookId: String(b.bookId),
          guestName: guestName,
          arrival: b.firstNight,
          departure: b.lastNight,
          date: b.bookTime ? b.bookTime.slice(0, 10) : "",
          stayMonth: b.firstNight ? b.firstNight.slice(0, 7) : "",
          building: b.customBuildingName, 
          room: stdRoomName,
          platform: platform,
          price: price,
          status: b.status === "0" ? "cancelled" : "confirmed"
        };
      });
      return res.json({ success: true, count: finalResult.length, data: finalResult });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
});