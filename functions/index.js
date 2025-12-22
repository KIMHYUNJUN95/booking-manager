const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const axios = require("axios");
const admin = require("firebase-admin");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);
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

    // ★ 수수료 및 순수익 계산
    const commission = cleanPrice(b.commission) || 0;
    const netRevenue = totalPrice - commission;

    return {
        id: String(b.bookId), bookId: String(b.bookId), propKey, roomId: String(b.roomId), room: getStandardRoomName(String(b.roomId), b.roomName),
        building, guestName: `${b.guestFirstName || ""} ${b.guestName || ""}`.trim(),
        status, rawStatus: String(b.status), platform,
        date, price: totalPrice, nights,
        bookDate: bookDateStr, arrival, departure, stayMonth, totalPrice,
        numAdult: parseInt(b.numAdult) || 0,
        numChild: parseInt(b.numChild) || 0,
        // ★ 고객 상세 정보
        guestEmail: b.guestEmail || "",
        guestPhone: b.guestPhone || b.guestMobile || "",
        guestCountry: b.guestCountry || "",
        guestCountry2: b.guestCountry2 || "",
        guestAddress: b.guestAddress || "",
        guestCity: b.guestCity || "",
        guestPostcode: b.guestPostcode || "",
        guestComments: b.guestComments || b.notes || "",
        guestTitle: b.guestTitle || "",
        arrivalTime: b.arrivalTime || b.guestArrivalTime || "",
        lang: b.lang || "",
        // ★ 금액/정산 관련
        commission: commission,
        netRevenue: netRevenue,
        currency: b.currency || "JPY",
        deposit: cleanPrice(b.deposit) || 0,
        tax: cleanPrice(b.tax) || 0,
        rateDescription: b.rateDescription || "",
        // ★ 채널/예약 관련
        apiReference: b.apiReference || "",
        referer: b.referer || "",
        // ★ 시간/이력 관련
        cancelTime: b.cancelTime || "",
        modified: b.modified || "",
        // ★ 플래그/표시
        flagColor: b.flagColor || "",
        flagText: b.flagText || "",
        updatedAt: new Date(),
    };
}

// ★ Beds24 API 호출 (페이지네이션 + 순차 호출)
// Beds24 제한: 1회 최대 1000건, 동시 1개 호출만 허용
async function fetchAllBookingsFromProperty(prop, arrivalFrom, arrivalTo) {
    const allBookings = [];
    let offset = 0;
    const limit = 1000; // Beds24 최대값

    while (true) {
        try {
            const res = await axios.post("https://api.beds24.com/json/getBookings", {
                authentication: { apiKey: BEDS24_API_KEY, propKey: prop.id },
                arrivalFrom,
                arrivalTo,
                includeInfo: true,
                includeGuests: true,
                includeInvoice: true,
                limit: limit,
                offset: offset
            });

            const arr = Array.isArray(res.data) ? res.data : res.data.bookings || [];
            console.log(`  📦 ${prop.name}: offset=${offset}, 가져온 건수=${arr.length}`);

            if (arr.length === 0) break;

            allBookings.push(...arr.map((b) => normalize(b, prop.id, prop.name)));

            // 1000건 미만이면 더 이상 없음
            if (arr.length < limit) break;

            offset += limit;

            // Beds24 권장: API 호출 사이 딜레이
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (err) {
            console.error(`❌ Fetch Error (${prop.name}, offset=${offset}):`, err.message);
            break;
        }
    }

    return allBookings;
}

// 빠른 동기화: 도쿄 시간 기준 오늘 ~ 향후 5개월
async function fetchFromBeds24Quick() {
    const tokyoNow = dayjs().utcOffset(9);
    const arrivalFrom = tokyoNow.format("YYYYMMDD");
    const arrivalTo = tokyoNow.add(5, "month").format("YYYYMMDD");

    console.log(`[Quick Sync] Tokyo: ${tokyoNow.format("YYYY-MM-DD HH:mm")} | Range: ${arrivalFrom} ~ ${arrivalTo}`);

    const allBookings = [];

    // ★ 순차 호출 (Beds24 제한: 동시 1개만)
    for (const prop of PROPERTIES) {
        console.log(`🔄 Fetching: ${prop.name}...`);
        const bookings = await fetchAllBookingsFromProperty(prop, arrivalFrom, arrivalTo);
        allBookings.push(...bookings);

        // API 호출 사이 딜레이
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`✅ Quick Sync 완료: 총 ${allBookings.length}건`);
    return allBookings;
}

// 전체 동기화: 2023년 1월부터 전체 (관리자용)
async function fetchFromBeds24Full() {
    const arrivalFrom = "20230101";
    const arrivalTo = dayjs().add(24, "month").format("YYYYMMDD");

    console.log(`[Full Sync] ${arrivalFrom} ~ ${arrivalTo}`);

    const allBookings = [];

    // ★ 순차 호출 (Beds24 제한: 동시 1개만)
    for (const prop of PROPERTIES) {
        console.log(`🔄 Fetching: ${prop.name}...`);
        const bookings = await fetchAllBookingsFromProperty(prop, arrivalFrom, arrivalTo);
        allBookings.push(...bookings);

        // API 호출 사이 딜레이
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`✅ Full Sync 완료: 총 ${allBookings.length}건`);
    return allBookings;
}

// saveBookings: syncRangeStart를 전달받아 해당 범위 내의 예약만 취소 처리
async function saveBookings(list, syncRangeStart = null) {
    const batchLimit = 400;
    let batch = db.batch();
    let count = 0;

    // Beds24에서 가져온 예약 ID 목록
    const beds24BookIds = new Set(list.map(item => item.id));

    // 건물별로 기존 예약 확인 및 삭제/취소 처리
    const buildingsInList = [...new Set(list.map(item => item.building))];

    // ★ 동기화 범위 시작일 (Quick Sync: 오늘, Full Sync: 2023-01-01)
    const rangeStartDate = syncRangeStart ? new Date(syncRangeStart) : null;

    for (const building of buildingsInList) {
        const existingSnap = await db.collection("reservations")
            .where("building", "==", building)
            .get();

        existingSnap.forEach(doc => {
            const docId = doc.id;
            // Beds24에 없는 예약은 cancelled로 표시
            if (!beds24BookIds.has(docId)) {
                const existingData = doc.data();
                // 이미 cancelled가 아니고, 확정된 예약인 경우만
                if (existingData.status === "confirmed" && existingData.arrival) {
                    const arrivalDate = new Date(existingData.arrival);

                    // ★ 핵심 수정: 동기화 범위 내의 예약만 취소 처리
                    // Quick Sync는 오늘 이후 예약만 가져오므로, 과거 예약은 건드리지 않음
                    if (rangeStartDate && arrivalDate < rangeStartDate) {
                        // 동기화 범위 이전의 예약은 건드리지 않음 (과거 예약 보존)
                        return;
                    }

                    const sixMonthsAgo = new Date();
                    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

                    if (arrivalDate > sixMonthsAgo) {
                        console.log(`Marking as cancelled (not in Beds24): ${docId} - ${existingData.guestName}`);
                        batch.update(doc.ref, {
                            status: "cancelled",
                            updatedAt: new Date(),
                            syncNote: "Beds24에서 삭제됨"
                        });
                        count++;

                        if (count % batchLimit === 0) {
                            batch.commit();
                            batch = db.batch();
                        }
                    }
                }
            }
        });
    }

    // 새로운/업데이트된 예약 저장 (merge: false로 완전 덮어쓰기)
    for (const item of list) {
        const docRef = db.collection("reservations").doc(item.id);
        batch.set(docRef, item); // merge 없이 완전 덮어쓰기

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

// 빠른 동기화 (기본) - 오늘 ~ 향후 5개월 (과거 예약은 건드리지 않음)
// ★ 순차 호출로 변경되어 타임아웃 증가
exports.syncBeds24 = onRequest({ cors: true, timeoutSeconds: 540, memory: '512MiB' }, async (req, res) => {
    try {
        const tokyoNow = dayjs().utcOffset(9);
        const syncRangeStart = tokyoNow.format("YYYY-MM-DD"); // 오늘부터
        const list = await fetchFromBeds24Quick();
        const count = await saveBookings(list, syncRangeStart);
        res.json({ success: true, message: `빠른 동기화 완료! ${count}건 저장됨 (오늘~향후 5개월, 과거예약 보존)`, count });
    } catch (e) {
        console.error("Quick Sync Failed:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 전체 동기화 (관리자용) - 2023년 1월부터 전체
// ★ 순차 호출 + 페이지네이션으로 모든 데이터 가져오기 (최대 10분)
exports.syncBeds24Full = onRequest({ cors: true, timeoutSeconds: 600, memory: '1GiB' }, async (req, res) => {
    try {
        const syncRangeStart = "2023-01-01"; // 2023년부터
        const list = await fetchFromBeds24Full();
        const count = await saveBookings(list, syncRangeStart);
        res.json({ success: true, message: `전체 동기화 완료! ${count}건 저장됨 (2023년~향후 24개월)`, count });
    } catch (e) {
        console.error("Full Sync Failed:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 스케줄러 (자동 동기화) - 빠른 동기화 사용
exports.scheduledBeds24Sync = onSchedule("every 30 minutes", async () => {
    const tokyoNow = dayjs().utcOffset(9);
    const syncRangeStart = tokyoNow.format("YYYY-MM-DD");
    const list = await fetchFromBeds24Quick();
    await saveBookings(list, syncRangeStart);
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

// ==========================================
// 디버깅: 건물별 가격 필드 구조 확인 (p1~p5 채널 매핑)
// ==========================================
exports.debugPriceFields = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
    try {
        const targetDate = dayjs().add(30, "day").format("YYYYMMDD"); // 30일 후 날짜로 테스트
        const results = {};

        for (const prop of PROPERTIES) {
            const rooms = BUILDING_ROOMS[prop.name];
            if (!rooms || rooms.length === 0) continue;

            // 첫 번째 객실만 샘플로 조회
            const sampleRoom = rooms[0];

            try {
                const priceResponse = await axios.post("https://api.beds24.com/json/getRoomDates", {
                    authentication: { apiKey: BEDS24_API_KEY, propKey: prop.id },
                    roomId: sampleRoom.roomId,
                    from: targetDate,
                    to: targetDate
                });

                const dateData = priceResponse.data[targetDate] || {};

                results[prop.name] = {
                    roomId: sampleRoom.roomId,
                    roomName: sampleRoom.name,
                    date: targetDate,
                    priceFields: {
                        p1: dateData.p1 || null,
                        p2: dateData.p2 || null,
                        p3: dateData.p3 || null,
                        p4: dateData.p4 || null,
                        p5: dateData.p5 || null,
                        p6: dateData.p6 || null
                    },
                    allFields: Object.keys(dateData).filter(k => k.startsWith('p')).sort(),
                    rawData: dateData
                };
            } catch (err) {
                results[prop.name] = { error: err.message };
            }

            // API 호출 간 딜레이
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // 채널 분석 (패턴 파악)
        const analysis = {};
        Object.entries(results).forEach(([building, data]) => {
            if (data.error) return;

            const pf = data.priceFields;
            analysis[building] = {
                p1: pf.p1 ? `¥${parseFloat(pf.p1).toLocaleString()}` : '없음',
                p2: pf.p2 ? `¥${parseFloat(pf.p2).toLocaleString()}` : '없음',
                p3: pf.p3 ? `¥${parseFloat(pf.p3).toLocaleString()}` : '없음',
                p4: pf.p4 ? `¥${parseFloat(pf.p4).toLocaleString()}` : '없음',
                p5: pf.p5 ? `¥${parseFloat(pf.p5).toLocaleString()}` : '없음',
                hasP4: !!pf.p4,
                hasP5: !!pf.p5
            };
        });

        res.json({
            success: true,
            message: "건물별 가격 필드 구조 (p1=기본, p2=Booking, p3=?, p4=?, p5=?)",
            targetDate: targetDate,
            analysis: analysis,
            fullData: results
        });
    } catch (e) {
        console.error("debugPriceFields Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================
// 디버깅: Beds24 전체 필드 구조 확인
// ==========================================
exports.debugBeds24Fields = onRequest({ cors: true }, async (req, res) => {
    try {
        const prop = PROPERTIES[0]; // 첫 번째 숙소로 테스트
        const response = await axios.post("https://api.beds24.com/json/getBookings", {
            authentication: { apiKey: BEDS24_API_KEY, propKey: prop.id },
            arrivalFrom: dayjs().subtract(30, "day").format("YYYYMMDD"),
            arrivalTo: dayjs().add(30, "day").format("YYYYMMDD"),
            includeInfo: true,
            includeGuests: true,
            includeInvoice: true,
            includeRooms: true,
            includeMessages: true,
            includePayments: true,
            includeIntegrations: true
        });

        const bookings = Array.isArray(response.data) ? response.data : response.data.bookings || [];

        if (bookings.length === 0) {
            return res.json({ message: "예약 데이터 없음", rawResponse: response.data });
        }

        // 모든 예약에서 발견된 필드들을 수집
        const allFields = new Set();
        const sampleValues = {};

        bookings.forEach(booking => {
            Object.keys(booking).forEach(key => {
                allFields.add(key);
                if (!sampleValues[key] && booking[key] !== null && booking[key] !== "") {
                    sampleValues[key] = booking[key];
                }
            });
        });

        res.json({
            success: true,
            totalBookings: bookings.length,
            allFieldNames: Array.from(allFields).sort(),
            fieldCount: allFields.size,
            sampleBookingRaw: bookings[0],
            sampleValues: sampleValues
        });
    } catch (e) {
        console.error("Debug Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 건물별 roomId 매핑
const BUILDING_ROOMS = {
    "아라키초A": [
        { roomId: "383971", name: "201호" }, { roomId: "403542", name: "202호" },
        { roomId: "383972", name: "301호" }, { roomId: "383978", name: "302호" },
        { roomId: "440617", name: "401호" }, { roomId: "383974", name: "402호" },
        { roomId: "502229", name: "501호" }, { roomId: "383976", name: "502호" },
        { roomId: "537451", name: "602호" }, { roomId: "383973", name: "701호" },
        { roomId: "383977", name: "702호" }
    ],
    "아라키초B": [
        { roomId: "585734", name: "101호" }, { roomId: "585738", name: "102호" },
        { roomId: "585735", name: "201호" }, { roomId: "585739", name: "202호" },
        { roomId: "585736", name: "301호" }, { roomId: "585740", name: "302호" },
        { roomId: "585737", name: "401호" }, { roomId: "585741", name: "402호" }
    ],
    "다이쿄초": [
        { roomId: "440619", name: "B01호" }, { roomId: "440620", name: "B02호" },
        { roomId: "440621", name: "101호" }, { roomId: "440622", name: "102호" },
        { roomId: "440623", name: "201호" }, { roomId: "440624", name: "202호" },
        { roomId: "440625", name: "302호" }
    ],
    "가부키초": [
        { roomId: "383979", name: "202호" }, { roomId: "383980", name: "203호" },
        { roomId: "383981", name: "302호" }, { roomId: "383982", name: "303호" },
        { roomId: "383983", name: "402호" }, { roomId: "383984", name: "403호" },
        { roomId: "543189", name: "502호" }, { roomId: "383985", name: "603호" },
        { roomId: "441885", name: "802호" }, { roomId: "624198", name: "803호" }
    ],
    "다카다노바바": [
        { roomId: "513698", name: "201호" }, { roomId: "513699", name: "301호" },
        { roomId: "513700", name: "401호" }, { roomId: "513701", name: "501호" },
        { roomId: "513702", name: "601호" }, { roomId: "513703", name: "701호" },
        { roomId: "513704", name: "801호" }, { roomId: "513705", name: "901호" }
    ],
    "오쿠보A동": [{ roomId: "437952", name: "오쿠보A" }],
    "오쿠보B동": [{ roomId: "615969", name: "오쿠보B" }],
    "오쿠보C동": [{ roomId: "450096", name: "오쿠보C" }],
    "사노시": [{ roomId: "481152", name: "사노" }]
};

// ==========================================
// 가격 조회: Beds24에서 객실별 가격 가져오기
// ==========================================
exports.getRoomPrices = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
    try {
        const { building, roomId, dateFrom, dateTo } = req.body;

        // 건물명으로 propKey 찾기
        const prop = PROPERTIES.find(p => p.name === building) || PROPERTIES[0];
        const buildingName = prop.name;

        const from = dateFrom || dayjs().format("YYYYMMDD");
        const to = dateTo || dayjs().add(30, "day").format("YYYYMMDD");

        // 특정 roomId만 조회하거나 건물 전체 조회
        const roomsToFetch = roomId
            ? [{ roomId, name: getStandardRoomName(roomId, "") }]
            : (BUILDING_ROOMS[buildingName] || []);

        const priceData = {};

        for (const room of roomsToFetch) {
            try {
                const priceResponse = await axios.post("https://api.beds24.com/json/getRoomDates", {
                    authentication: { apiKey: BEDS24_API_KEY, propKey: prop.id },
                    roomId: room.roomId,
                    from: from,
                    to: to
                });

                priceData[room.roomId] = {
                    roomName: room.name,
                    roomId: room.roomId,
                    dates: priceResponse.data
                };
            } catch (err) {
                console.log(`Room ${room.roomId} price fetch error:`, err.message);
                priceData[room.roomId] = { error: err.message };
            }
        }

        res.json({
            success: true,
            building: buildingName,
            propKey: prop.id,
            dateFrom: from,
            dateTo: to,
            priceData: priceData
        });
    } catch (e) {
        console.error("getRoomPrices Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================
// 가격 설정: Beds24에 객실 가격 푸시
// ==========================================
exports.setRoomPrices = onRequest({ cors: true }, async (req, res) => {
    try {
        const { building, roomId, dateFrom, dateTo, priceAirbnb } = req.body;

        console.log("setRoomPrices 요청:", { building, roomId, dateFrom, dateTo, priceAirbnb });

        // 건물명으로 propKey 찾기
        const prop = PROPERTIES.find(p => p.name === building);
        if (!prop) {
            return res.status(400).json({ success: false, error: "건물을 찾을 수 없습니다" });
        }

        if (!roomId || !dateFrom || !dateTo) {
            return res.status(400).json({ success: false, error: "roomId, dateFrom, dateTo는 필수입니다" });
        }

        if (!priceAirbnb) {
            return res.status(400).json({ success: false, error: "Airbnb 가격을 입력해주세요" });
        }

        // Beds24 setRoomDates API 호출
        // 올바른 API 구조: { authentication, roomId, dates: { YYYYMMDD: { p1, p4 } } }
        const datesData = {};

        // 날짜 범위 설정
        let currentDate = dayjs(dateFrom, "YYYYMMDD");
        const endDate = dayjs(dateTo, "YYYYMMDD");

        while (currentDate.isBefore(endDate) || currentDate.isSame(endDate)) {
            const dateStr = currentDate.format("YYYYMMDD");
            // p1 = 기본가 (Airbnb), Booking (p2)은 Beds24에서 자동 연동
            // p1과 p3 모두 설정 (건물마다 다를 수 있음)
            datesData[dateStr] = {
                p1: String(parseInt(priceAirbnb)),
                p3: String(parseInt(priceAirbnb))
            };

            currentDate = currentDate.add(1, "day");
        }

        console.log("Beds24에 전송할 데이터:", JSON.stringify({ roomId, dates: datesData }, null, 2));

        const response = await axios.post("https://api.beds24.com/json/setRoomDates", {
            authentication: { apiKey: BEDS24_API_KEY, propKey: prop.id },
            roomId: String(roomId),
            dates: datesData
        });

        console.log("Beds24 setRoomDates 응답:", response.data);

        res.json({
            success: true,
            message: `Airbnb 가격 ¥${priceAirbnb} 설정 완료`,
            building: building,
            roomId: roomId,
            dateFrom: dateFrom,
            dateTo: dateTo,
            response: response.data
        });
    } catch (e) {
        console.error("setRoomPrices Error:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});