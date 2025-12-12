import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from './firebase';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// ★ 기수 정의 (7기 = 2025.07 ~ 2026.06)
const FISCAL_PERIODS = [
  { period: 8, label: "8기", startYear: 2026, startMonth: 7, endYear: 2027, endMonth: 6 },
  { period: 7, label: "7기", startYear: 2025, startMonth: 7, endYear: 2026, endMonth: 6 },
  { period: 6, label: "6기", startYear: 2024, startMonth: 7, endYear: 2025, endMonth: 6 },
  { period: 5, label: "5기", startYear: 2023, startMonth: 7, endYear: 2024, endMonth: 6 },
  { period: 4, label: "4기", startYear: 2022, startMonth: 7, endYear: 2023, endMonth: 6 },
];

// 현재 날짜 기준으로 현재 기수 찾기
const getCurrentPeriod = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  for (const fp of FISCAL_PERIODS) {
    // 시작일과 종료일 체크
    const startDate = new Date(fp.startYear, fp.startMonth - 1, 1);
    const endDate = new Date(fp.endYear, fp.endMonth, 0); // 해당 월의 마지막 날

    if (now >= startDate && now <= endDate) {
      return fp.period;
    }
  }
  return 7; // 기본값
};

// 기수 정보 가져오기
const getPeriodInfo = (periodNum) => {
  return FISCAL_PERIODS.find(p => p.period === periodNum) || FISCAL_PERIODS[1]; // 기본 7기
};

// 건물 정렬 순서
const BUILDING_ORDER = [
  "아라키초A", "아라키초B", "다이쿄초", "가부키초",
  "다카다노바바", "오쿠보A동", "오쿠보B동", "오쿠보C동", "사노시"
];

const RevenueDashboard = () => {
  // 현재 기수를 기본값으로 설정
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
  const [comparePeriod, setComparePeriod] = useState(getCurrentPeriod() - 1);
  const [loading, setLoading] = useState(true);

  // 커스텀 날짜 검색
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // 데이터 상태
  const [monthlyData, setMonthlyData] = useState([]);
  const [buildingData, setBuildingData] = useState([]);
  const [buildingCompareData, setBuildingCompareData] = useState([]); // 건물별 비교 데이터
  const [roomData, setRoomData] = useState({});
  const [roomCompareData, setRoomCompareData] = useState({}); // 객실별 비교 데이터
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [compareRevenue, setCompareRevenue] = useState(0);

  useEffect(() => {
    fetchRevenueData();
  }, [selectedPeriod, comparePeriod, useCustomDate, customStartDate, customEndDate]);

  // 기수 또는 커스텀 날짜에 해당하는 날짜 범위 반환
  const getDateRange = (periodNum, isCompare = false) => {
    if (useCustomDate && customStartDate && customEndDate && !isCompare) {
      return {
        startDate: customStartDate,
        endDate: customEndDate
      };
    }

    // 커스텀 날짜 비교용 (1년 전 동일 기간)
    if (useCustomDate && customStartDate && customEndDate && isCompare) {
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      start.setFullYear(start.getFullYear() - 1);
      end.setFullYear(end.getFullYear() - 1);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10)
      };
    }

    const period = getPeriodInfo(periodNum);
    return {
      startDate: `${period.startYear}-${String(period.startMonth).padStart(2, '0')}-01`,
      endDate: `${period.endYear}-${String(period.endMonth).padStart(2, '0')}-${period.endMonth === 6 ? '30' : '31'}`
    };
  };

  // 월 라벨 생성 (7월~6월 순서)
  const getMonthLabels = () => {
    if (useCustomDate && customStartDate && customEndDate) {
      // 커스텀 날짜일 때는 해당 범위의 월만 표시
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      const labels = [];

      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        labels.push({
          key: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
          label: `${current.getMonth() + 1}월`
        });
        current.setMonth(current.getMonth() + 1);
      }
      return labels;
    }

    // 기수 기준: 7월~12월, 1월~6월
    return [
      { key: '07', label: '7월' },
      { key: '08', label: '8월' },
      { key: '09', label: '9월' },
      { key: '10', label: '10월' },
      { key: '11', label: '11월' },
      { key: '12', label: '12월' },
      { key: '01', label: '1월' },
      { key: '02', label: '2월' },
      { key: '03', label: '3월' },
      { key: '04', label: '4월' },
      { key: '05', label: '5월' },
      { key: '06', label: '6월' },
    ];
  };

  const fetchRevenueData = async () => {
    setLoading(true);

    try {
      const currentRange = getDateRange(selectedPeriod, false);
      const compareRange = getDateRange(comparePeriod, !useCustomDate ? false : true);

      // 전체 데이터 가져오기 (2023년부터)
      const q = query(
        collection(db, "reservations"),
        where("status", "==", "confirmed")
      );

      const snapshot = await getDocs(q);
      const allDocs = snapshot.docs.map(d => d.data());

      // 날짜가 범위 내인지 확인하는 함수
      const isInRange = (dateStr, start, end) => {
        if (!dateStr) return false;
        return dateStr >= start && dateStr <= end;
      };

      // 월별 데이터 초기화
      const monthLabels = getMonthLabels();
      const monthlyMap = {};

      if (useCustomDate) {
        monthLabels.forEach(m => {
          monthlyMap[m.key] = { month: m.label, current: 0, compare: 0 };
        });
      } else {
        monthLabels.forEach(m => {
          monthlyMap[m.key] = { month: m.label, current: 0, compare: 0 };
        });
      }

      // 집계 변수
      let calcCurrentTotal = 0;
      let calcCompareTotal = 0;
      const bMapCurrent = {};
      const bMapCompare = {};
      const rMapCurrent = {};
      const rMapCompare = {};

      // 현재 기수 정보
      const currentPeriodInfo = getPeriodInfo(selectedPeriod);
      const comparePeriodInfo = getPeriodInfo(comparePeriod);

      // ★ totalPrice 기준으로 매출 집계 (입실/퇴실 대시보드와 동일한 금액)
      // arrival(체크인일) 기준으로 해당 기수/기간에 포함되는지 판단
      allDocs.forEach(doc => {
        if (!doc.arrival) return;

        // totalPrice 사용 (Beds24 invoiceItems 합계 = 실제 예약 금액)
        const price = Number(doc.totalPrice || doc.price) || 0;
        const bName = doc.building || "Unknown";
        const rName = doc.room || "Unknown";
        const arrivalMonth = doc.arrival.slice(5, 7); // "01" ~ "12"

        // 현재 기수/커스텀 범위 체크
        if (isInRange(doc.arrival, currentRange.startDate, currentRange.endDate)) {
          const monthKey = useCustomDate ? doc.arrival.slice(0, 7) : arrivalMonth;
          if (monthlyMap[monthKey]) {
            monthlyMap[monthKey].current += price;
          }
          calcCurrentTotal += price;

          bMapCurrent[bName] = (bMapCurrent[bName] || 0) + price;
          if (!rMapCurrent[bName]) rMapCurrent[bName] = {};
          rMapCurrent[bName][rName] = (rMapCurrent[bName][rName] || 0) + price;
        }

        // 비교 기수/범위 체크
        if (isInRange(doc.arrival, compareRange.startDate, compareRange.endDate)) {
          const monthKey = useCustomDate
            ? `${parseInt(doc.arrival.slice(0, 4)) + 1}-${arrivalMonth}`
            : arrivalMonth;
          if (monthlyMap[monthKey]) {
            monthlyMap[monthKey].compare += price;
          } else if (monthlyMap[arrivalMonth]) {
            monthlyMap[arrivalMonth].compare += price;
          }
          calcCompareTotal += price;

          bMapCompare[bName] = (bMapCompare[bName] || 0) + price;
          if (!rMapCompare[bName]) rMapCompare[bName] = {};
          rMapCompare[bName][rName] = (rMapCompare[bName][rName] || 0) + price;
        }
      });

      // 차트용 배열 변환
      const chartData = Object.entries(monthlyMap).map(([key, val]) => val);

      // 건물별 데이터 (정렬)
      const buildingChartData = BUILDING_ORDER
        .filter(name => bMapCurrent[name] || bMapCompare[name])
        .map(name => ({
          name,
          current: bMapCurrent[name] || 0,
          compare: bMapCompare[name] || 0
        }));

      // 다른 건물들 추가
      Object.keys(bMapCurrent).forEach(name => {
        if (!BUILDING_ORDER.includes(name)) {
          buildingChartData.push({
            name,
            current: bMapCurrent[name] || 0,
            compare: bMapCompare[name] || 0
          });
        }
      });

      setMonthlyData(chartData);
      setBuildingData(buildingChartData.map(b => ({ name: b.name, value: b.current })));
      setBuildingCompareData(buildingChartData);
      setRoomData(rMapCurrent);
      setRoomCompareData(rMapCompare);
      setTotalRevenue(calcCurrentTotal);
      setCompareRevenue(calcCompareTotal);

    } catch (error) {
      console.error("매출 데이터 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return "¥ " + Math.floor(val).toLocaleString();
  };

  const getGrowthRate = (current, compare) => {
    if (!compare || compare === 0) return null;
    return ((current - compare) / compare * 100).toFixed(1);
  };

  const currentPeriodInfo = getPeriodInfo(selectedPeriod);
  const comparePeriodInfo = getPeriodInfo(comparePeriod);

  // 표시용 라벨
  const currentLabel = useCustomDate
    ? `${customStartDate} ~ ${customEndDate}`
    : `${currentPeriodInfo.label} (${currentPeriodInfo.startYear}.${currentPeriodInfo.startMonth}~${currentPeriodInfo.endYear}.${currentPeriodInfo.endMonth})`;

  const compareLabel = useCustomDate
    ? `전년 동기간`
    : `${comparePeriodInfo.label} (${comparePeriodInfo.startYear}.${comparePeriodInfo.startMonth}~${comparePeriodInfo.endYear}.${comparePeriodInfo.endMonth})`;

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title" style={{ color: "#2E7D32" }}>💰 매출 대시보드</h2>
      </div>

      {/* 기수 선택 및 날짜 검색 영역 */}
      <div style={{
        background: "white",
        padding: "20px",
        borderRadius: "16px",
        marginBottom: "20px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
      }}>
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "flex-end" }}>
          {/* 기수 선택 */}
          <div>
            <label style={{ fontSize: "13px", color: "#666", display: "block", marginBottom: "6px" }}>조회 기수</label>
            <select
              className="form-select"
              style={{ width: "160px", marginBottom: 0 }}
              value={selectedPeriod}
              onChange={(e) => {
                setSelectedPeriod(Number(e.target.value));
                setUseCustomDate(false);
              }}
              disabled={useCustomDate}
            >
              {FISCAL_PERIODS.map(p => (
                <option key={p.period} value={p.period}>
                  {p.label} ({p.startYear}.{p.startMonth}~{p.endYear}.{p.endMonth})
                </option>
              ))}
            </select>
          </div>

          {/* 비교 기수 선택 */}
          <div>
            <label style={{ fontSize: "13px", color: "#666", display: "block", marginBottom: "6px" }}>비교 기수</label>
            <select
              className="form-select"
              style={{ width: "160px", marginBottom: 0 }}
              value={comparePeriod}
              onChange={(e) => setComparePeriod(Number(e.target.value))}
              disabled={useCustomDate}
            >
              {FISCAL_PERIODS.map(p => (
                <option key={p.period} value={p.period}>
                  {p.label} ({p.startYear}.{p.startMonth}~{p.endYear}.{p.endMonth})
                </option>
              ))}
            </select>
          </div>

          <div style={{ borderLeft: "1px solid #E5E5EA", paddingLeft: "20px" }}>
            <label style={{ fontSize: "13px", color: "#666", display: "block", marginBottom: "6px" }}>
              <input
                type="checkbox"
                checked={useCustomDate}
                onChange={(e) => setUseCustomDate(e.target.checked)}
                style={{ marginRight: "6px" }}
              />
              직접 날짜 선택
            </label>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                type="date"
                className="form-input"
                style={{ width: "150px", marginBottom: 0 }}
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                disabled={!useCustomDate}
              />
              <span>~</span>
              <input
                type="date"
                className="form-input"
                style={{ width: "150px", marginBottom: 0 }}
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                disabled={!useCustomDate}
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px", color: "#999" }}>
           데이터 정밀 분석 중...<br/>
           <span style={{fontSize: '12px'}}>(일별 매출 분배 계산 중)</span>
        </div>
      ) : (
        <>
          {/* KPI 카드 */}
          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderLeft: "5px solid #2E7D32" }}>
              <div className="kpi-label">{currentLabel}</div>
              <div className="kpi-value" style={{ color: "#2E7D32" }}>{formatCurrency(totalRevenue)}</div>
              <div className="kpi-sub">총 매출</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: "5px solid #999" }}>
              <div className="kpi-label">{compareLabel}</div>
              <div className="kpi-value" style={{ color: "#666" }}>{formatCurrency(compareRevenue)}</div>
              <div className="kpi-sub">비교 매출</div>
            </div>

            <div className="kpi-card" style={{ borderLeft: "5px solid #0071E3" }}>
              <div className="kpi-label">전기 대비 성장률</div>
              <div className="kpi-value" style={{
                color: getGrowthRate(totalRevenue, compareRevenue) >= 0 ? "#FF3B30" : "#0071E3"
              }}>
                {getGrowthRate(totalRevenue, compareRevenue) !== null
                  ? `${getGrowthRate(totalRevenue, compareRevenue) >= 0 ? '+' : ''}${getGrowthRate(totalRevenue, compareRevenue)}%`
                  : '-'
                }
              </div>
              <div className="kpi-sub">
                {getGrowthRate(totalRevenue, compareRevenue) >= 0
                  ? <span style={{color: "#FF3B30"}}>▲ 상승</span>
                  : <span style={{color: "#0071E3"}}>▼ 하락</span>
                }
              </div>
            </div>
          </div>

          {/* 월별 매출 비교 차트 */}
          <div className="chart-card">
            <div className="chart-title">📅 월별 매출 비교</div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(val) => `¥${(val/10000).toFixed(0)}만`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="current"
                  name={useCustomDate ? "선택 기간" : currentPeriodInfo.label}
                  stroke="#2E7D32"
                  strokeWidth={3}
                  activeDot={{ r: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="compare"
                  name={useCustomDate ? "전년 동기" : comparePeriodInfo.label}
                  stroke="#999"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 건물별 매출 비교 차트 */}
          <div className="chart-card">
            <div className="chart-title">🏢 건물별 매출 비교 ({useCustomDate ? "선택기간 vs 전년" : `${currentPeriodInfo.label} vs ${comparePeriodInfo.label}`})</div>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={buildingCompareData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{fontSize: 11}} />
                <YAxis tickFormatter={(val) => `¥${(val/10000).toFixed(0)}만`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar
                  dataKey="current"
                  name={useCustomDate ? "선택 기간" : currentPeriodInfo.label}
                  fill="#4CAF50"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="compare"
                  name={useCustomDate ? "전년 동기" : comparePeriodInfo.label}
                  fill="#BDBDBD"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 건물별 상세 매출 (객실별 비교 포함) */}
          {BUILDING_ORDER.filter(bName => roomData[bName] || roomCompareData[bName]).map(bName => {
            const currentTotal = buildingCompareData.find(b => b.name === bName)?.current || 0;
            const compareTotal = buildingCompareData.find(b => b.name === bName)?.compare || 0;
            const growthRate = getGrowthRate(currentTotal, compareTotal);

            // 객실 목록 (현재 + 비교 기수 합친 유니크 목록)
            const allRooms = [...new Set([
              ...Object.keys(roomData[bName] || {}),
              ...Object.keys(roomCompareData[bName] || {})
            ])].sort();

            if (allRooms.length === 0) return null;

            return (
              <div key={bName} className="building-section">
                <div className="building-title" style={{
                  color: "#2E7D32",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span>🏢 {bName}</span>
                  <span style={{ fontSize: "14px", fontWeight: "normal" }}>
                    {formatCurrency(currentTotal)}
                    {growthRate !== null && (
                      <span style={{
                        marginLeft: "10px",
                        color: growthRate >= 0 ? "#FF3B30" : "#0071E3",
                        fontSize: "13px"
                      }}>
                        ({growthRate >= 0 ? '+' : ''}{growthRate}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="table-card">
                  <table className="table-full">
                    <thead>
                      <tr>
                        <th className="text-left" style={{ width: "20%" }}>객실명</th>
                        <th className="text-right">{useCustomDate ? "선택기간" : currentPeriodInfo.label}</th>
                        <th className="text-right">{useCustomDate ? "전년동기" : comparePeriodInfo.label}</th>
                        <th className="text-right">증감</th>
                        <th className="text-right">성장률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRooms.map(rName => {
                        const currentVal = roomData[bName]?.[rName] || 0;
                        const compareVal = roomCompareData[bName]?.[rName] || 0;
                        const diff = currentVal - compareVal;
                        const roomGrowth = getGrowthRate(currentVal, compareVal);

                        return (
                          <tr key={rName}>
                            <td className="text-left" style={{fontWeight: "600"}}>{rName}</td>
                            <td className="text-right" style={{color: "#2E7D32", fontWeight: "600"}}>
                              {formatCurrency(currentVal)}
                            </td>
                            <td className="text-right" style={{color: "#888"}}>
                              {formatCurrency(compareVal)}
                            </td>
                            <td className="text-right" style={{
                              color: diff >= 0 ? "#FF3B30" : "#0071E3",
                              fontWeight: "500"
                            }}>
                              {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                            </td>
                            <td className="text-right" style={{
                              color: roomGrowth >= 0 ? "#FF3B30" : "#0071E3"
                            }}>
                              {roomGrowth !== null
                                ? `${roomGrowth >= 0 ? '+' : ''}${roomGrowth}%`
                                : '-'
                              }
                            </td>
                          </tr>
                        );
                      })}
                      {/* 건물 합계 */}
                      <tr style={{ background: "#F5F5F7", fontWeight: "bold" }}>
                        <td className="text-left">합계</td>
                        <td className="text-right" style={{color: "#2E7D32"}}>{formatCurrency(currentTotal)}</td>
                        <td className="text-right" style={{color: "#666"}}>{formatCurrency(compareTotal)}</td>
                        <td className="text-right" style={{
                          color: currentTotal - compareTotal >= 0 ? "#FF3B30" : "#0071E3"
                        }}>
                          {currentTotal - compareTotal >= 0 ? '+' : ''}{formatCurrency(currentTotal - compareTotal)}
                        </td>
                        <td className="text-right" style={{
                          color: growthRate >= 0 ? "#FF3B30" : "#0071E3"
                        }}>
                          {growthRate !== null ? `${growthRate >= 0 ? '+' : ''}${growthRate}%` : '-'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

export default RevenueDashboard;