import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from '../firebase';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// 국가 코드를 한글 이름으로 매핑
const COUNTRY_NAMES = {
  'KR': '대한민국',
  'KO': '대한민국', // Korea 약자 (KR과 동일)
  'JP': '일본',
  'US': '미국',
  'CN': '중국',
  'TW': '대만',
  'HK': '홍콩',
  'SG': '싱가포르',
  'MY': '말레이시아',
  'TH': '태국',
  'VN': '베트남',
  'PH': '필리핀',
  'ID': '인도네시아',
  'IN': '인도',
  'AU': '호주',
  'NZ': '뉴질랜드',
  'GB': '영국',
  'FR': '프랑스',
  'DE': '독일',
  'IT': '이탈리아',
  'ES': '스페인',
  'CA': '캐나다',
  'BR': '브라질',
  'MX': '멕시코',
  'RU': '러시아',
  'SA': '사우디아라비아',
  'AE': '아랍에미리트',
  'EG': '이집트',
  'ZA': '남아프리카공화국',
  'NG': '나이지리아',
  'KE': '케냐',
  'AR': '아르헨티나',
  'CL': '칠레',
  'CO': '콜롬비아',
  'PE': '페루',
  'NL': '네덜란드',
  'BE': '벨기에',
  'CH': '스위스',
  'AT': '오스트리아',
  'SE': '스웨덴',
  'NO': '노르웨이',
  'DK': '덴마크',
  'FI': '핀란드',
  'PL': '폴란드',
  'CZ': '체코',
  'GR': '그리스',
  'PT': '포르투갈',
  'IE': '아일랜드',
  'TR': '터키',
  'IL': '이스라엘',
  'BD': '방글라데시',
  'PK': '파키스탄',
  'NP': '네팔',
  'LK': '스리랑카',
  'MM': '미얀마',
  'KH': '캄보디아',
  'LA': '라오스',
  'MN': '몽골',
  'KZ': '카자흐스탄',
  'UZ': '우즈베키스탄',
};

// 파이 차트 색상
const PIE_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#C06C84',
  '#6C5B7B', '#355C7D', '#99B898', '#FECEAB', '#E8175D'
];

const CountryOccupancyDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('all'); // all, thisYear, thisMonth
  const [countryData, setCountryData] = useState([]);
  const [guestSizeData, setGuestSizeData] = useState([]);
  const [totalReservations, setTotalReservations] = useState(0);

  useEffect(() => {
    fetchCountryData();
  }, [selectedPeriod]);

  const fetchCountryData = async () => {
    setLoading(true);
    try {
      // 날짜 범위 계산
      const today = new Date();
      let startDate = null;

      if (selectedPeriod === 'thisYear') {
        startDate = `${today.getFullYear()}-01-01`;
      } else if (selectedPeriod === 'thisMonth') {
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        startDate = `${year}-${month}-01`;
      }

      // 쿼리 생성 (확정된 예약만)
      let q;
      if (startDate) {
        q = query(
          collection(db, "reservations"),
          where("status", "==", "confirmed"),
          where("arrival", ">=", startDate)
        );
      } else {
        q = query(
          collection(db, "reservations"),
          where("status", "==", "confirmed")
        );
      }

      const snapshot = await getDocs(q);

      // ★ 중복 제거: bookId 기준으로 유니크하게 (아라키초A, 가부키초, 다카다노바바 계정 중복 방지)
      const uniqueMap = new Map();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const bookId = data.bookId || data.refNum || doc.id; // bookId 우선, 없으면 refNum, 없으면 문서 ID

        // 이미 있는 예약이면 건너뛰기 (중복 제거)
        if (!uniqueMap.has(bookId)) {
          uniqueMap.set(bookId, data);
        }
      });

      const reservations = Array.from(uniqueMap.values());

      console.log(`🌍 국가별 분석: 전체 ${snapshot.docs.length}건 → 중복 제거 후 ${reservations.length}건의 confirmed 예약`);

      // 디버깅: 첫 3개 예약의 필드 확인
      if (reservations.length > 0) {
        console.log(`📋 예약 데이터 샘플:`, reservations.slice(0, 3).map(r => ({
          bookId: r.bookId,
          refNum: r.refNum,
          guestName: r.guestName,
          guestCountry: r.guestCountry,
          numAdult: r.numAdult,
          building: r.building,
          room: r.room
        })));
      }

      // 국가별 집계
      const countryMap = {};
      reservations.forEach(r => {
        const countryCode = (r.guestCountry || 'UNKNOWN').toUpperCase(); // 대문자로 변환
        const countryName = COUNTRY_NAMES[countryCode] || (countryCode === 'UNKNOWN' ? '미상' : countryCode);

        if (!countryMap[countryName]) {
          countryMap[countryName] = 0;
        }
        countryMap[countryName]++;
      });

      // 국가별 데이터 정렬 (예약 건수 내림차순)
      const countryArray = Object.entries(countryMap)
        .map(([name, count]) => ({
          name,
          count,
          percentage: ((count / reservations.length) * 100).toFixed(1)
        }))
        .sort((a, b) => b.count - a.count);

      setCountryData(countryArray);
      setTotalReservations(reservations.length);

      // 인원수별 집계 (numAdult 기준)
      const guestSizeMap = {};
      reservations.forEach(r => {
        const size = r.numAdult || 1; // 기본값 1명
        const key = `${size}인`;

        // 디버깅: 12인 이상 예약 로그
        if (size >= 12) {
          console.log(`⚠️ ${size}인 예약 발견:`, {
            bookId: r.bookId,
            guestName: r.guestName,
            building: r.building,
            room: r.room,
            arrival: r.arrival,
            departure: r.departure,
            numAdult: r.numAdult
          });
        }

        if (!guestSizeMap[key]) {
          guestSizeMap[key] = 0;
        }
        guestSizeMap[key]++;
      });

      // 인원수별 데이터 정렬
      const guestSizeArray = Object.entries(guestSizeMap)
        .map(([name, count]) => ({
          name,
          count,
          percentage: ((count / reservations.length) * 100).toFixed(1)
        }))
        .sort((a, b) => {
          // 숫자 기준으로 정렬 (1인, 2인, 3인...)
          const aNum = parseInt(a.name);
          const bNum = parseInt(b.name);
          return aNum - bNum;
        });

      setGuestSizeData(guestSizeArray);

    } catch (error) {
      console.error("국가별 데이터 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title" style={{ color: "#5856D6" }}>🌍 국가별 점유율 대시보드</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#86868B" }}>조회 기간:</span>
          <select
            className="form-select"
            style={{ width: "auto", marginBottom: 0 }}
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            <option value="all">전체</option>
            <option value="thisYear">올해</option>
            <option value="thisMonth">이번 달</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px", color: "#999" }}>
          데이터 분석 중...
        </div>
      ) : (
        <>
          {/* KPI 카드 */}
          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderLeft: "5px solid #5856D6" }}>
              <div className="kpi-label">총 예약 건수</div>
              <div className="kpi-value" style={{ color: "#5856D6" }}>
                {totalReservations}건
              </div>
              <div className="kpi-sub">확정 예약</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: "5px solid #34C759" }}>
              <div className="kpi-label">국가 수</div>
              <div className="kpi-value" style={{ color: "#34C759" }}>
                {countryData.length}개국
              </div>
              <div className="kpi-sub">방문 국가</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: "5px solid #FF9500" }}>
              <div className="kpi-label">최다 방문 국가</div>
              <div className="kpi-value" style={{ color: "#FF9500", fontSize: "28px" }}>
                {countryData[0]?.name || '-'}
              </div>
              <div className="kpi-sub">{countryData[0]?.count || 0}건 ({countryData[0]?.percentage || 0}%)</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: "5px solid #0071E3" }}>
              <div className="kpi-label">최다 인원</div>
              <div className="kpi-value" style={{ color: "#0071E3", fontSize: "28px" }}>
                {guestSizeData.reduce((max, curr) => curr.count > max.count ? curr : max, guestSizeData[0])?.name || '-'}
              </div>
              <div className="kpi-sub">
                {guestSizeData.reduce((max, curr) => curr.count > max.count ? curr : max, guestSizeData[0])?.count || 0}건
              </div>
            </div>
          </div>

          {/* 차트 영역 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "30px" }}>
            {/* 국가별 파이 차트 */}
            <div className="chart-card">
              <div className="chart-title">🌏 국가별 예약 비율 (Top 10)</div>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={countryData.slice(0, 10)}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={({ name, percentage }) => `${name} ${percentage}%`}
                  >
                    {countryData.slice(0, 10).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value}건`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 인원수별 바 차트 */}
            <div className="chart-card">
              <div className="chart-title">👥 예약 인원별 분포</div>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={guestSizeData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value) => `${value}건`} />
                  <Legend />
                  <Bar dataKey="count" name="예약 건수" fill="#0071E3" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 국가별 상세 테이블 */}
          <div className="table-card">
            <div className="chart-title" style={{ marginBottom: "20px" }}>📊 국가별 상세 통계</div>
            <table className="table-full">
              <thead>
                <tr>
                  <th className="text-left" style={{ width: "10%" }}>순위</th>
                  <th className="text-left" style={{ width: "30%" }}>국가</th>
                  <th className="text-right">예약 건수</th>
                  <th className="text-right">점유율</th>
                  <th className="text-right">비율 막대</th>
                </tr>
              </thead>
              <tbody>
                {countryData.map((country, index) => (
                  <tr key={country.name}>
                    <td className="text-left" style={{ fontWeight: "600" }}>
                      {index + 1}위
                    </td>
                    <td className="text-left" style={{ fontWeight: "600", fontSize: "15px" }}>
                      {country.name}
                    </td>
                    <td className="text-right" style={{ color: "#5856D6", fontWeight: "600" }}>
                      {country.count}건
                    </td>
                    <td className="text-right" style={{ fontWeight: "600" }}>
                      {country.percentage}%
                    </td>
                    <td className="text-right">
                      <div style={{
                        width: "100%",
                        height: "24px",
                        background: "#F5F5F7",
                        borderRadius: "4px",
                        overflow: "hidden",
                        position: "relative"
                      }}>
                        <div style={{
                          width: `${country.percentage}%`,
                          height: "100%",
                          background: `linear-gradient(90deg, ${PIE_COLORS[index % PIE_COLORS.length]}, ${PIE_COLORS[index % PIE_COLORS.length]}dd)`,
                          borderRadius: "4px",
                          transition: "width 0.3s ease"
                        }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 인원수별 상세 테이블 */}
          <div className="table-card" style={{ marginTop: "30px" }}>
            <div className="chart-title" style={{ marginBottom: "20px" }}>👥 인원수별 상세 통계</div>
            <table className="table-full">
              <thead>
                <tr>
                  <th className="text-left" style={{ width: "30%" }}>인원</th>
                  <th className="text-right">예약 건수</th>
                  <th className="text-right">점유율</th>
                  <th className="text-right">비율 막대</th>
                </tr>
              </thead>
              <tbody>
                {guestSizeData.map((size) => (
                  <tr key={size.name}>
                    <td className="text-left" style={{ fontWeight: "600", fontSize: "15px" }}>
                      {size.name}
                    </td>
                    <td className="text-right" style={{ color: "#0071E3", fontWeight: "600" }}>
                      {size.count}건
                    </td>
                    <td className="text-right" style={{ fontWeight: "600" }}>
                      {size.percentage}%
                    </td>
                    <td className="text-right">
                      <div style={{
                        width: "100%",
                        height: "24px",
                        background: "#F5F5F7",
                        borderRadius: "4px",
                        overflow: "hidden",
                        position: "relative"
                      }}>
                        <div style={{
                          width: `${size.percentage}%`,
                          height: "100%",
                          background: "linear-gradient(90deg, #0071E3, #0071E3dd)",
                          borderRadius: "4px",
                          transition: "width 0.3s ease"
                        }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 도움말 */}
          <div style={{
            marginTop: "20px",
            padding: "15px 20px",
            background: "#F5F5F7",
            borderRadius: "12px",
            fontSize: "13px",
            color: "#666"
          }}>
            <strong>💡 참고:</strong>
            <ul style={{ marginTop: "10px", paddingLeft: "20px", lineHeight: "1.8" }}>
              <li><strong>국가별 점유율</strong>: 확정된 예약 기준으로 각 국가의 방문 비율을 표시합니다</li>
              <li><strong>인원수</strong>: 성인(Adult) 기준 인원수로 집계됩니다</li>
              <li><strong>조회 기간</strong>: 전체 / 올해 / 이번 달 중 선택 가능합니다</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default CountryOccupancyDashboard;
