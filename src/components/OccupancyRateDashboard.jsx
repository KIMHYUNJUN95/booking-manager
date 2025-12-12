// src/components/OccupancyRateDashboard.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from '../firebase';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// 건물 정렬 순서
const BUILDING_ORDER = [
  "아라키초A", "아라키초B", "다이쿄초", "가부키초",
  "다카다노바바", "오쿠보A동", "오쿠보B동", "오쿠보C동", "사노시"
];

// 각 건물의 객실 수 (객실 리스트의 길이)
const BUILDING_ROOMS = {
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

// 월의 일수 계산
const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

// 예약된 날짜들을 Set으로 계산 (겹침 제거)
const getOccupiedDaysSet = (reservations, monthStart, monthEnd) => {
  const occupiedDates = new Set();

  reservations.forEach(r => {
    const resStart = new Date(Math.max(new Date(r.arrival), new Date(monthStart)));
    const resEnd = new Date(Math.min(new Date(r.departure), new Date(monthEnd)));

    if (resStart <= resEnd) {
      // 예약 기간의 모든 날짜를 Set에 추가
      const current = new Date(resStart);
      while (current <= resEnd) {
        occupiedDates.add(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
      }
    }
  });

  return occupiedDates.size;
};

const OccupancyRateDashboard = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);

  // 데이터 상태
  const [monthlyData, setMonthlyData] = useState([]); // 월별 가동률
  const [buildingData, setBuildingData] = useState([]); // 건물별 가동률
  const [roomData, setRoomData] = useState({}); // 객실별 상세 데이터
  const [lowSeasonMonths, setLowSeasonMonths] = useState([]); // 비수기 월
  const [overallRate, setOverallRate] = useState(0); // 전체 가동률

  useEffect(() => {
    fetchOccupancyData();
  }, [selectedMonth]);

  const fetchOccupancyData = async () => {
    setLoading(true);
    try {
      // 선택한 월의 연도와 월 추출
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = getDaysInMonth(year, month);

      // 해당 월의 시작일과 종료일
      const monthStart = `${selectedMonth}-01`;
      const monthEnd = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;

      // 과거 12개월 데이터 가져오기 (월별 추이 분석용)
      const monthsToFetch = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const lastDay = getDaysInMonth(y, m);
        monthsToFetch.push({
          label: `${m}월`,
          year: y,
          month: m,
          start: `${y}-${String(m).padStart(2, '0')}-01`,
          end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
          days: lastDay
        });
      }

      // 과거 12개월간의 예약 데이터 가져오기
      // ★ 중요: arrival 기준으로 조회 (체크인 날짜 기준)
      const oldestMonth = monthsToFetch[0];
      const latestMonth = monthsToFetch[monthsToFetch.length - 1];

      const q = query(
        collection(db, "reservations"),
        where("status", "==", "confirmed"),
        where("arrival", "<=", latestMonth.end)  // arrival 기준으로 변경
      );

      const snapshot = await getDocs(q);
      const allReservations = snapshot.docs.map(d => d.data());

      // 디버깅: 조회된 예약 데이터 확인
      console.log(`📊 가동률 계산: 총 ${allReservations.length}건의 예약 데이터 조회됨`);
      console.log(`📅 조회 기간: ${oldestMonth.start} ~ ${latestMonth.end}`);

      // 아라키초A 201호의 12월 예약만 필터링해서 확인
      const [selYear, selMonth] = selectedMonth.split('-').map(Number);
      const selDays = getDaysInMonth(selYear, selMonth);
      const selMonthEnd = `${selectedMonth}-${String(selDays).padStart(2, '0')}`;

      const testRoom = allReservations.filter(r =>
        r.building === "아라키초A" &&
        r.room === "201호" &&
        r.arrival <= selMonthEnd &&
        r.departure >= `${selectedMonth}-01`
      );
      console.log(`🏠 아라키초A 201호 (${selectedMonth}): ${testRoom.length}건`, testRoom);

      // 아라키초A 201호의 실제 점유 날짜 계산
      const testOccupiedDays = getOccupiedDaysSet(testRoom, `${selectedMonth}-01`, selMonthEnd);
      console.log(`📅 아라키초A 201호 점유일수: ${testOccupiedDays}일 / ${selDays}일 (가동률: ${(testOccupiedDays/selDays*100).toFixed(1)}%)`);
      console.log(`🔍 공실일수: ${selDays - testOccupiedDays}일`);

      // ===== 월별 가동률 계산 =====
      const monthlyRates = monthsToFetch.map(m => {
        let totalOccupiedDays = 0;
        let totalAvailableDays = 0;

        Object.keys(BUILDING_ROOMS).forEach(building => {
          const rooms = BUILDING_ROOMS[building];
          rooms.forEach(room => {
            // 이 객실의 해당 월 예약 필터링
            const roomReservations = allReservations.filter(r =>
              r.building === building &&
              r.room === room &&
              r.arrival <= m.end &&
              r.departure >= m.start
            );

            // 겹침을 제거한 실제 예약된 일수 계산
            const occupiedDays = getOccupiedDaysSet(roomReservations, m.start, m.end);

            totalOccupiedDays += occupiedDays;
            totalAvailableDays += m.days;
          });
        });

        const rate = totalAvailableDays > 0 ? (totalOccupiedDays / totalAvailableDays * 100) : 0;
        return {
          month: m.label,
          rate: parseFloat(rate.toFixed(1)),
          occupiedDays: totalOccupiedDays,
          availableDays: totalAvailableDays
        };
      });

      setMonthlyData(monthlyRates);

      // 비수기 판단 (가동률 60% 미만인 월)
      const lowSeasons = monthlyRates.filter(m => m.rate < 60);
      setLowSeasonMonths(lowSeasons);

      // ===== 선택한 월의 건물별/객실별 가동률 계산 =====
      const buildingRates = [];
      const roomDetails = {};

      Object.keys(BUILDING_ROOMS).forEach(building => {
        const rooms = BUILDING_ROOMS[building];
        let buildingOccupiedDays = 0;
        let buildingAvailableDays = 0;

        roomDetails[building] = {};

        rooms.forEach(room => {
          const roomReservations = allReservations.filter(r =>
            r.building === building &&
            r.room === room &&
            r.arrival <= monthEnd &&
            r.departure >= monthStart
          );

          // 겹침을 제거한 실제 예약된 일수 계산
          const occupiedDays = getOccupiedDaysSet(roomReservations, monthStart, monthEnd);

          const availableDays = daysInMonth;
          const vacantDays = availableDays - occupiedDays;
          const rate = availableDays > 0 ? (occupiedDays / availableDays * 100) : 0;

          roomDetails[building][room] = {
            occupiedDays,
            vacantDays,
            availableDays,
            rate: parseFloat(rate.toFixed(1)),
            reservationCount: roomReservations.length
          };

          buildingOccupiedDays += occupiedDays;
          buildingAvailableDays += availableDays;
        });

        const buildingRate = buildingAvailableDays > 0
          ? (buildingOccupiedDays / buildingAvailableDays * 100)
          : 0;

        buildingRates.push({
          name: building,
          rate: parseFloat(buildingRate.toFixed(1)),
          occupiedDays: buildingOccupiedDays,
          availableDays: buildingAvailableDays
        });
      });

      // 건물 정렬
      buildingRates.sort((a, b) => {
        const indexA = BUILDING_ORDER.indexOf(a.name);
        const indexB = BUILDING_ORDER.indexOf(b.name);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      });

      setBuildingData(buildingRates);
      setRoomData(roomDetails);

      // 전체 평균 가동률
      const totalOccupied = buildingRates.reduce((sum, b) => sum + b.occupiedDays, 0);
      const totalAvailable = buildingRates.reduce((sum, b) => sum + b.availableDays, 0);
      const overall = totalAvailable > 0 ? (totalOccupied / totalAvailable * 100) : 0;
      setOverallRate(parseFloat(overall.toFixed(1)));

    } catch (error) {
      console.error("가동률 데이터 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  // 가동률에 따른 색상 결정
  const getRateColor = (rate) => {
    if (rate >= 80) return "#34C759"; // 높음 (녹색)
    if (rate >= 60) return "#FF9500"; // 보통 (주황)
    return "#FF3B30"; // 낮음 (빨강)
  };

  // 가동률 등급
  const getRateGrade = (rate) => {
    if (rate >= 80) return "우수";
    if (rate >= 60) return "양호";
    if (rate >= 40) return "보통";
    return "저조";
  };

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title" style={{ color: "#FF9500" }}>📊 객실 가동률 대시보드</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#86868B" }}>조회 월:</span>
          <input
            type="month"
            className="form-select"
            style={{ width: "auto", marginBottom: 0 }}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px", color: "#999" }}>
          📊 가동률 데이터 분석 중...<br />
          <span style={{ fontSize: '12px' }}>(예약 데이터를 기반으로 계산하고 있습니다)</span>
        </div>
      ) : (
        <>
          {/* KPI 카드 */}
          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderLeft: `5px solid ${getRateColor(overallRate)}` }}>
              <div className="kpi-label">전체 평균 가동률</div>
              <div className="kpi-value" style={{ color: getRateColor(overallRate) }}>
                {overallRate}%
              </div>
              <div className="kpi-sub">{getRateGrade(overallRate)}</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: "5px solid #0071E3" }}>
              <div className="kpi-label">총 건물 수</div>
              <div className="kpi-value" style={{ color: "#0071E3" }}>
                {buildingData.length}개
              </div>
              <div className="kpi-sub">관리 대상</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: "5px solid #5856D6" }}>
              <div className="kpi-label">총 객실 수</div>
              <div className="kpi-value" style={{ color: "#5856D6" }}>
                {Object.values(BUILDING_ROOMS).flat().length}개
              </div>
              <div className="kpi-sub">전체 객실</div>
            </div>

            {lowSeasonMonths.length > 0 && (
              <div className="kpi-card" style={{ borderLeft: "5px solid #FF3B30" }}>
                <div className="kpi-label">비수기 월 (60% 미만)</div>
                <div className="kpi-value" style={{ color: "#FF3B30" }}>
                  {lowSeasonMonths.length}개월
                </div>
                <div className="kpi-sub" style={{ fontSize: "11px" }}>
                  {lowSeasonMonths.map(m => m.month).join(', ')}
                </div>
              </div>
            )}
          </div>

          {/* 월별 가동률 추이 차트 (최근 12개월) */}
          <div className="chart-card">
            <div className="chart-title">📈 월별 가동률 추이 (최근 12개월)</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "rate") return [`${value}%`, "가동률"];
                    return [value, name];
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="가동률"
                  stroke="#FF9500"
                  strokeWidth={3}
                  activeDot={{ r: 8 }}
                />
                {/* 60% 기준선 */}
                <Line
                  type="monotone"
                  dataKey={() => 60}
                  name="비수기 기준 (60%)"
                  stroke="#FF3B30"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <div style={{
              fontSize: "12px",
              color: "#86868B",
              marginTop: "10px",
              textAlign: "center"
            }}>
              💡 가동률 60% 미만인 월은 비수기로 분류됩니다
            </div>
          </div>

          {/* 건물별 가동률 차트 */}
          <div className="chart-card">
            <div className="chart-title">🏢 건물별 가동률 ({selectedMonth})</div>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={buildingData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "rate") return [`${value}%`, "가동률"];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar
                  dataKey="rate"
                  name="가동률"
                  fill="#FF9500"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 건물별 상세 가동률 (객실별) */}
          {BUILDING_ORDER.filter(bName => roomData[bName]).map(bName => {
            const building = buildingData.find(b => b.name === bName);
            if (!building) return null;

            const rooms = Object.keys(roomData[bName] || {}).sort();
            if (rooms.length === 0) return null;

            return (
              <div key={bName} className="building-section">
                <div className="building-title" style={{
                  color: "#FF9500",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span>🏢 {bName}</span>
                  <span style={{ fontSize: "14px", fontWeight: "normal" }}>
                    평균 가동률: {' '}
                    <span style={{
                      color: getRateColor(building.rate),
                      fontWeight: "bold",
                      fontSize: "16px"
                    }}>
                      {building.rate}%
                    </span>
                    {' '}({getRateGrade(building.rate)})
                  </span>
                </div>
                <div className="table-card">
                  <table className="table-full">
                    <thead>
                      <tr>
                        <th className="text-left" style={{ width: "20%" }}>객실명</th>
                        <th className="text-right">예약 건수</th>
                        <th className="text-right">가동 일수</th>
                        <th className="text-right">공실 일수</th>
                        <th className="text-right">가동률</th>
                        <th className="text-right">등급</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rooms.map(rName => {
                        const rData = roomData[bName][rName];

                        return (
                          <tr key={rName}>
                            <td className="text-left" style={{ fontWeight: "600" }}>{rName}</td>
                            <td className="text-right" style={{ color: "#0071E3" }}>
                              {rData.reservationCount}건
                            </td>
                            <td className="text-right" style={{ color: "#34C759", fontWeight: "600" }}>
                              {rData.occupiedDays}일
                            </td>
                            <td className="text-right" style={{
                              color: rData.vacantDays > 15 ? "#FF3B30" : "#86868B",
                              fontWeight: rData.vacantDays > 15 ? "bold" : "normal"
                            }}>
                              {rData.vacantDays}일
                            </td>
                            <td className="text-right" style={{
                              color: getRateColor(rData.rate),
                              fontWeight: "bold",
                              fontSize: "15px"
                            }}>
                              {rData.rate}%
                            </td>
                            <td className="text-right">
                              <span style={{
                                background: getRateColor(rData.rate),
                                color: "white",
                                padding: "4px 10px",
                                borderRadius: "10px",
                                fontSize: "12px",
                                fontWeight: "600"
                              }}>
                                {getRateGrade(rData.rate)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {/* 건물 합계 */}
                      <tr style={{ background: "#F5F5F7", fontWeight: "bold" }}>
                        <td className="text-left">건물 평균</td>
                        <td className="text-right" style={{ color: "#0071E3" }}>
                          {rooms.reduce((sum, r) => sum + roomData[bName][r].reservationCount, 0)}건
                        </td>
                        <td className="text-right" style={{ color: "#34C759" }}>
                          {building.occupiedDays}일
                        </td>
                        <td className="text-right" style={{ color: "#86868B" }}>
                          {building.availableDays - building.occupiedDays}일
                        </td>
                        <td className="text-right" style={{ color: getRateColor(building.rate) }}>
                          {building.rate}%
                        </td>
                        <td className="text-right">
                          <span style={{
                            background: getRateColor(building.rate),
                            color: "white",
                            padding: "4px 10px",
                            borderRadius: "10px",
                            fontSize: "12px",
                            fontWeight: "600"
                          }}>
                            {getRateGrade(building.rate)}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* 가동률 등급 설명 */}
          <div style={{
            marginTop: "20px",
            padding: "15px 20px",
            background: "#F5F5F7",
            borderRadius: "12px",
            fontSize: "13px",
            color: "#666"
          }}>
            <strong>가동률 등급 기준:</strong>
            <span style={{ marginLeft: "20px", color: "#34C759" }}>● 우수 (80% 이상)</span>
            <span style={{ marginLeft: "15px", color: "#FF9500" }}>● 양호 (60~80%)</span>
            <span style={{ marginLeft: "15px", color: "#FF9500" }}>● 보통 (40~60%)</span>
            <span style={{ marginLeft: "15px", color: "#FF3B30" }}>● 저조 (40% 미만)</span>
            <br />
            <strong style={{ marginTop: "8px", display: "inline-block" }}>공실 일수:</strong>
            <span style={{ marginLeft: "20px" }}>15일 초과 시 빨간색으로 표시되어 주의가 필요합니다</span>
          </div>
        </>
      )}
    </div>
  );
};

export default OccupancyRateDashboard;
