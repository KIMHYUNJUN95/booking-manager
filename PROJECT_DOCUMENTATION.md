# HARU Dashboard - 프로젝트 인수인계 문서

> 에어비앤비/부킹 호텔 예약 관리 시스템 (PMS)
> Beds24 API 연동 대시보드

---

## 1. 프로젝트 개요

### 1.1 시스템 설명
- **프로젝트명**: HARU Dashboard
- **목적**: 에어비앤비/Booking.com 예약을 Beds24 API를 통해 통합 관리
- **기능**: 예약 현황, 매출 분석, 입퇴실 관리, 청소 스케줄 관리
- **호스팅**: Firebase Hosting + Cloud Functions
- **데이터베이스**: Firebase Firestore

### 1.2 배포 URL
- **메인 URL**: https://my-booking-app-3f0e7.web.app
- **Firebase 콘솔**: https://console.firebase.google.com/project/my-booking-app-3f0e7

---

## 2. Firebase 설정 정보

### 2.1 Firebase 프로젝트 설정
```javascript
// src/firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyBHI6d4mDDBEIB77GVQj5Rz1EbMyPaCjgA",
  authDomain: "my-booking-app-3f0e7.firebaseapp.com",
  projectId: "my-booking-app-3f0e7",
  storageBucket: "my-booking-app-3f0e7.firebasestorage.app",
  messagingSenderId: "1008418095386",
  appId: "1:1008418095386:web:99eddb1ec872d0b1906ca3",
  measurementId: "G-KKNJ5P1KFD"
};
```

### 2.2 Beds24 API 설정
```javascript
// functions/index.js
const BEDS24_API_KEY = "9378AnbjfrIDo3j9MmrQZjwKd";
```

### 2.3 Cloud Functions 엔드포인트
| 함수명 | URL | 설명 |
|--------|-----|------|
| `syncBeds24` | `https://us-central1-my-booking-app-3f0e7.cloudfunctions.net/syncBeds24` | Beds24 데이터 동기화 |
| `getTodayArrivals` | `https://us-central1-my-booking-app-3f0e7.cloudfunctions.net/getTodayArrivals` | 입퇴실 조회 |
| `scheduledBeds24Sync` | (스케줄러) | 30분마다 자동 동기화 |

---

## 3. 건물 및 객실 데이터

### 3.1 건물 목록 (Beds24 Property ID)
```javascript
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
```

### 3.2 객실 목록 (프론트엔드)
```javascript
const BUILDING_DATA = {
  "아라키초A": ["201호", "202호", "301호", "302호", "401호", "402호", "501호", "502호", "602호", "701호", "702호"],
  "아라키초B": ["101호", "102호", "201호", "202호", "301호", "302호", "401호", "402호"],
  "다이쿄초": ["B01호", "B02호", "101호", "102호", "201호", "202호", "302호"],
  "가부키초": ["202호", "203호", "302호", "303호", "402호", "403호", "502호", "603호", "802호", "803호"],
  "오쿠보A동": ["오쿠보A"],
  "오쿠보B동": ["오쿠보B"],
  "오쿠보C동": ["오쿠보C"],
  "사노시": ["사노"],
  "다카다노바바": ["201호", "301호", "401호", "501호", "601호", "701호", "801호", "901호"]
};
```

### 3.3 Beds24 Room ID 매핑
```javascript
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

  // 오쿠보
  "437952": "오쿠보A", "615969": "오쿠보B", "450096": "오쿠보C", "496532": "오쿠보C",

  // 사노시
  "481152": "사노",

  // 다카다노바바
  "513698": "201호", "513699": "301호", "513700": "401호", "556719": "401호",
  "513701": "501호", "513702": "601호", "513703": "701호", "513704": "801호", "513705": "901호"
};
```

---

## 4. Firestore 데이터 구조

### 4.1 컬렉션: `reservations`
```javascript
{
  // 식별자
  id: "123456",                    // Beds24 bookId (문서 ID로 사용)
  bookId: "123456",                // Beds24 예약 ID
  propKey: "NSoH37aJMipHA4K4MPVyp2pnq",  // Beds24 property key
  roomId: "383971",                // Beds24 room ID

  // 건물/객실
  building: "아라키초A",           // 건물명
  room: "201호",                   // 객실명 (매핑된 이름)

  // 고객 정보
  guestName: "John Smith",         // 게스트 이름
  guestEmail: "guest@email.com",   // 이메일
  guestPhone: "+81-90-1234-5678",  // 전화번호
  guestCountry: "US",              // 국가
  guestAddress: "123 Main St",     // 주소
  guestCity: "New York",           // 도시
  guestComments: "Late check-in",  // 고객 메모/요청사항
  numAdult: 2,                     // 성인 수
  numChild: 1,                     // 아동 수

  // 예약 상태
  status: "confirmed",             // "confirmed" | "cancelled"
  rawStatus: "1",                  // Beds24 원본 상태 (1,2=확정, 그외=취소)
  platform: "Airbnb",              // "Airbnb" | "Booking" | "Expedia" | "Agoda"

  // 날짜 정보
  date: "2025-01-15",              // 예약 접수일 (bookingTime 기준)
  bookDate: "2025-01-15",          // 예약 접수일 (동일)
  arrival: "2025-02-01",           // 체크인 날짜 (firstNight)
  departure: "2025-02-03",         // 체크아웃 날짜 (lastNight + 1일)
  arrivalTime: "16:00",            // 도착 예정 시간
  stayMonth: "2025-02",            // 숙박 월 (통계용)

  // 금액 정보
  price: 50000,                    // 총 금액 (레거시)
  totalPrice: 50000,               // 총 금액 (invoiceItems 합계)
  nights: 2,                       // 숙박일수

  // 메타데이터
  updatedAt: Timestamp,            // 마지막 업데이트
  createdAt: Timestamp             // 생성일 (수기 입력 시)
}
```

### 4.2 컬렉션: `cleaningTasks`
```javascript
{
  taskId: "2025-01-15_아라키초A_201호",  // 날짜_건물_객실 (문서 ID)
  date: "2025-01-15",              // 청소 날짜
  building: "아라키초A",           // 건물명
  room: "201호",                   // 객실명

  // 퇴실 정보
  checkoutBookingId: "123456",     // 퇴실 예약 ID

  // 다음 입실 정보
  nextCheckinBookingId: "123457",  // 다음 입실 예약 ID (없으면 null)

  // 청소 상태
  status: "pending",               // "pending" | "in_progress" | "completed"
  assignedTo: "",                  // 담당자 (미사용)
  completedAt: Timestamp,          // 완료 시간
  notes: "",                       // 메모

  updatedAt: Timestamp             // 마지막 업데이트
}
```

---

## 5. 파일 구조

```
booking-manager/
├── public/
│   ├── index.html          # HTML 템플릿 (PWA 메타태그 포함)
│   ├── manifest.json       # PWA 매니페스트
│   ├── sw.js               # 서비스 워커
│   ├── icon-192.svg        # 앱 아이콘 (192x192)
│   └── icon-512.svg        # 앱 아이콘 (512x512)
│
├── src/
│   ├── App.jsx             # 메인 앱 (라우팅, 모든 대시보드 포함)
│   ├── firebase.js         # Firebase 설정 및 초기화
│   ├── RevenueDashboard.jsx # 매출 대시보드 (기수 시스템)
│   ├── main.jsx            # React 엔트리포인트
│   ├── index.js            # 대체 엔트리포인트
│   │
│   ├── components/
│   │   ├── CleaningDashboard.jsx  # 청소 스케줄 관리
│   │   ├── AddReservation.jsx     # 수기 예약 입력 (미사용)
│   │   ├── AddCancellation.jsx    # 수기 취소 입력 (미사용)
│   │   └── StatsAnalysis.jsx      # 통계 분석 (미사용)
│   │
│   └── constants/
│       └── buildingData.js        # 건물/객실 상수 (미사용, App.jsx에 직접 정의)
│
├── functions/
│   ├── index.js            # Cloud Functions (Beds24 연동)
│   ├── package.json        # Functions 의존성
│   └── package-lock.json
│
├── firebase.json           # Firebase 설정
├── package.json            # 프론트엔드 의존성
└── PROJECT_DOCUMENTATION.md # 이 문서
```

---

## 6. 주요 기능 설명

### 6.1 예약 접수 대시보드 (`/`)
- **목적**: 월별 예약 접수 현황 확인
- **기준**: `bookDate` (예약 접수일)
- **기능**:
  - 건물별 예약/취소 건수
  - 플랫폼별 점유율 (Airbnb vs Booking)
  - 객실별 상세 현황
  - 예약/취소 전환 보기

### 6.2 매출 대시보드 (`/revenue`)
- **목적**: 기수별/기간별 매출 분석
- **기준**: `arrival` (체크인 날짜) + `totalPrice`
- **기수 시스템**:
  ```javascript
  const FISCAL_PERIODS = [
    { period: 8, label: "8기", startYear: 2026, startMonth: 7, endYear: 2027, endMonth: 6 },
    { period: 7, label: "7기", startYear: 2025, startMonth: 7, endYear: 2026, endMonth: 6 },
    { period: 6, label: "6기", startYear: 2024, startMonth: 7, endYear: 2025, endMonth: 6 },
    { period: 5, label: "5기", startYear: 2023, startMonth: 7, endYear: 2024, endMonth: 6 },
    { period: 4, label: "4기", startYear: 2022, startMonth: 7, endYear: 2023, endMonth: 6 },
  ];
  ```
- **기능**:
  - 기수 선택 (7월~6월)
  - 커스텀 날짜 검색
  - 기수별 비교 (월별, 건물별, 객실별)
  - 성장률 계산

### 6.3 입퇴실 대시보드 (`/arrivals`)
- **목적**: 일별 체크인/체크아웃 관리
- **기준**: `arrival`, `departure`
- **기능**:
  - 날짜 선택
  - 입실 예정 목록
  - 퇴실 예정 목록
  - 고객 상세 정보 모달 (이름 클릭)
  - 고객 이름 검색

### 6.4 청소 스케줄 관리 (`/cleaning`)
- **목적**: 퇴실 객실 청소 관리
- **기준**: `departure` (퇴실일)
- **기능**:
  - 날짜별 청소 목록
  - 청소 상태 관리 (대기중 → 청소중 → 완료)
  - 다음 입실 정보 표시
  - 긴급도 표시 (입실 시간 기준)

### 6.5 숙박 현황 (`/occupancy`)
- **목적**: 월별 숙박 건수 확인
- **기준**: `stayMonth`

### 6.6 기타 (미사용)
- `/list`: 전체 기록 관리
- `/add`: 예약 수기 입력
- `/add-cancel`: 취소 수기 입력

---

## 7. Beds24 연동 로직

### 7.1 데이터 동기화 프로세스
1. Beds24 API 호출 (`getBookings`)
2. 각 건물(Property)별 예약 데이터 수집
3. 데이터 정규화 (`normalize` 함수)
4. Firestore에 저장 (bookId를 문서 ID로 사용)

### 7.2 날짜 결정 우선순위 (`determineDate`)
```javascript
// 예약 접수일 결정 순서
1. bookingTime  // 가장 정확
2. bookTime
3. entryTime
4. invoiceItems[0].invoiceDate  // 결제일
// ※ firstNight(입실일)은 사용하지 않음 (뻥튀기 방지)
```

### 7.3 퇴실일 계산
```javascript
// Beds24의 lastNight = 마지막 숙박일
// 실제 체크아웃 = lastNight + 1일
const departure = dayjs(b.lastNight).add(1, 'day').format('YYYY-MM-DD');
```

### 7.4 금액 계산
```javascript
// invoiceItems 배열의 amount 합계 = totalPrice
// Beds24에서 취소된 예약도 금액이 있으므로 status 확인 필수
if (status === "confirmed") {
  totalPrice = invoiceItems.reduce((sum, item) => sum + item.amount, 0);
}
```

---

## 8. 배포 방법

### 8.1 프론트엔드 배포
```bash
# 빌드
npm run build

# Firebase Hosting 배포
firebase deploy --only hosting
```

### 8.2 Functions 배포
```bash
cd functions
npm install

# Functions 배포
firebase deploy --only functions
```

### 8.3 전체 배포
```bash
npm run build
firebase deploy
```

### 8.4 Firebase 인증 갱신
```bash
firebase login --reauth
```

---

## 9. 의존성

### 9.1 프론트엔드 (`package.json`)
```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "dayjs": "^1.11.10",
    "firebase": "^10.7.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "react-scripts": "5.0.1",
    "recharts": "^2.10.0",
    "web-vitals": "^2.1.4"
  }
}
```

### 9.2 Functions (`functions/package.json`)
```json
{
  "engines": { "node": "24" },
  "dependencies": {
    "axios": "^1.13.2",
    "cors": "^2.8.5",
    "dayjs": "^1.11.19",
    "firebase-admin": "^13.6.0",
    "firebase-functions": "^7.0.0"
  }
}
```

---

## 10. 모바일/PWA 설정

### 10.1 PWA 설치 프롬프트
- 웹사이트 접속 시 하단에 설치 배너 표시
- "설치하기" 버튼 클릭 시 앱 설치
- X 버튼으로 닫으면 다시 표시 안 됨 (localStorage)
- iOS Safari: 공유 → 홈 화면에 추가 안내

### 10.2 모바일 반응형
- **768px 이하**: 하단 네비게이션 바 (4개 메뉴)
  - 예약 접수 대시보드
  - 매출 대시보드
  - 입실/퇴실 대시보드
  - 청소 스케줄 관리
- **480px 이하**: 더 작은 폰트, 단일 컬럼 레이아웃

---

## 11. 알려진 이슈 및 주의사항

### 11.1 매출 계산
- Beds24 리포트에는 취소된 예약도 포함될 수 있음
- 대시보드는 `status === "confirmed"`만 집계
- Beds24 설정에서 "Include cancelled" 확인 필요

### 11.2 스케줄러 배포
- `scheduledBeds24Sync` 사용 시 Google Cloud에서 Eventarc API 활성화 필요
- 또는 해당 함수를 주석 처리하고 수동 동기화만 사용

### 11.3 Firebase Hosting 에러
- `"resolving hosting target of a site with no site name"` 에러 발생 시
- `firebase.json`에 `"site": "my-booking-app-3f0e7"` 추가 필요

---

## 12. 프롬프트 예시

### 12.1 기능 추가 요청 시
```
이 프로젝트는 React + Firebase 기반의 호텔 예약 관리 시스템입니다.
- Beds24 API로 예약 데이터를 가져옴
- Firestore에 reservations 컬렉션으로 저장
- 주요 필드: building, room, arrival, departure, totalPrice, status

[요청 내용]
```

### 12.2 버그 수정 요청 시
```
Firebase 프로젝트: my-booking-app-3f0e7
Functions URL: https://us-central1-my-booking-app-3f0e7.cloudfunctions.net/
Firestore 컬렉션: reservations, cleaningTasks

현재 문제:
[에러 메시지]

관련 파일:
- src/App.jsx (프론트엔드)
- functions/index.js (백엔드)
```

---

## 13. 연락처 및 참고

- **Firebase 콘솔**: https://console.firebase.google.com/project/my-booking-app-3f0e7
- **Beds24 API 문서**: https://api.beds24.com/
- **배포 사이트**: https://my-booking-app-3f0e7.web.app

---

*문서 작성일: 2025-12-12*
*마지막 업데이트: PWA 설치 기능 + 모바일 최적화 추가*
