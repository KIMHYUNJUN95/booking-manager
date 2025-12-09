import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from './firebase'; 
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const RevenueDashboard = () => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  
  const [monthlyData, setMonthlyData] = useState([]);
  const [buildingData, setBuildingData] = useState([]);
  const [roomData, setRoomData] = useState({});
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [lastYearRevenue, setLastYearRevenue] = useState(0);

  useEffect(() => {
    fetchRevenueData();
  }, [selectedYear]);

  const fetchRevenueData = async () => {
    setLoading(true);
    
    // 1. 데이터 조회 범위 설정
    // 월 걸침 예약을 고려하여, 앞뒤로 넉넉하게 가져온 뒤 JS에서 필터링합니다.
    const lastYear = selectedYear - 1;
    
    // 올해 데이터 쿼리
    const qCurrent = query(
      collection(db, "reservations"),
      where("stayMonth", ">=", `${selectedYear}-01`),
      where("stayMonth", "<=", `${selectedYear}-12`),
      where("status", "==", "confirmed")
    );

    // 작년 데이터 쿼리
    const qLast = query(
      collection(db, "reservations"),
      where("stayMonth", ">=", `${lastYear}-01`),
      where("stayMonth", "<=", `${lastYear}-12`),
      where("status", "==", "confirmed")
    );

    try {
        const [snapCurrent, snapLast] = await Promise.all([getDocs(qCurrent), getDocs(qLast)]);
        
        const currentDocs = snapCurrent.docs.map(d => d.data());
        const lastDocs = snapLast.docs.map(d => d.data());
        
        // 병합된 데이터 리스트 (작년 + 올해)
        const allDocs = [...currentDocs, ...lastDocs];

        // --- [Beds24 기준 핵심 로직: nights 배열 기반 집계] ---
        
        // 1. 초기화 (1월~12월)
        const monthlyMap = {};
        for(let i=1; i<=12; i++) {
          const monthKey = String(i).padStart(2, '0');
          monthlyMap[monthKey] = { month: `${i}월`, current: 0, last: 0 };
        }

        // 집계 변수
        let calcCurrentTotal = 0;
        let calcLastTotal = 0;
        const bMap = {}; // 건물별
        const rMap = {}; // 객실별

        // 2. 모든 예약 건을 순회
        allDocs.forEach(doc => {
          // nights 배열이 없으면(구버전 데이터) price를 사용, 있으면 nights 사용
          // ★ 우리가 만든 Backend 코드는 무조건 nights를 생성하므로 정확함
          if (doc.nights && Array.isArray(doc.nights) && doc.nights.length > 0) {
            
            doc.nights.forEach(night => {
              // night.date 형태: "2024-12-25"
              const nDate = night.date;
              const nYear = parseInt(nDate.slice(0, 4));
              const nMonth = nDate.slice(5, 7); // "12"
              const amount = Number(night.amount) || 0;

              // [올해 매출 처리]
              if (nYear === selectedYear) {
                if (monthlyMap[nMonth]) {
                  monthlyMap[nMonth].current += amount;
                  calcCurrentTotal += amount;
                }

                // 건물/객실 통계는 '올해' 것만 집계
                const bName = doc.building || "Unknown";
                const rName = doc.room || "Unknown";
                
                bMap[bName] = (bMap[bName] || 0) + amount;
                if (!rMap[bName]) rMap[bName] = {};
                rMap[bName][rName] = (rMap[bName][rName] || 0) + amount;
              }

              // [작년 매출 처리] (비교용)
              if (nYear === lastYear) {
                if (monthlyMap[nMonth]) {
                  monthlyMap[nMonth].last += amount;
                  calcLastTotal += amount;
                }
              }
            });

          } else {
            // [Fallback] nights 배열이 없는 옛날 데이터 처리 (기존 로직 유지)
            // stayMonth 기준으로 통째로 더함 (오차 발생 가능성 있음)
            if (!doc.stayMonth) return;
            const sYear = parseInt(doc.stayMonth.slice(0, 4));
            const sMonth = doc.stayMonth.slice(5, 7);
            const price = Number(doc.price) || 0;

            if (sYear === selectedYear) {
              if (monthlyMap[sMonth]) {
                monthlyMap[sMonth].current += price;
                calcCurrentTotal += price;
              }
              const bName = doc.building || "Unknown";
              const rName = doc.room || "Unknown";
              bMap[bName] = (bMap[bName] || 0) + price;
              if (!rMap[bName]) rMap[bName] = {};
              rMap[bName][rName] = (rMap[bName][rName] || 0) + price;
            } else if (sYear === lastYear) {
               if (monthlyMap[sMonth]) {
                monthlyMap[sMonth].last += price;
                calcLastTotal += price;
              }
            }
          }
        });

        // 3. 차트용 배열 변환
        const chartData = Object.values(monthlyMap);

        // 4. 건물별 랭킹 정렬
        const buildingChartData = Object.keys(bMap)
          .map(key => ({ name: key, value: bMap[key] }))
          .sort((a, b) => b.value - a.value);

        setMonthlyData(chartData);
        setBuildingData(buildingChartData);
        setRoomData(rMap);
        setTotalRevenue(calcCurrentTotal);
        setLastYearRevenue(calcLastTotal);

    } catch (error) {
        console.error("매출 데이터 로딩 실패:", error);
    } finally {
        setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return "¥ " + Math.floor(val).toLocaleString();
  };

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title" style={{ color: "#2E7D32" }}>💰 매출 대시보드 (Beds24 연동)</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontWeight: "600", color: "#666" }}>조회 연도:</span>
          <select 
            className="form-select" 
            style={{ width: "auto", marginBottom: 0, fontSize: "16px", fontWeight: "bold" }}
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            <option value={2023}>2023년</option>
            <option value={2024}>2024년</option>
            <option value={2025}>2025년</option>
            <option value={2026}>2026년</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px", color: "#999" }}>
           데이터 정밀 분석 중...<br/>
           <span style={{fontSize: '12px'}}>(일별 매출 분배 계산 중)</span>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderLeft: "5px solid #2E7D32" }}>
              <div className="kpi-label">{selectedYear}년 총 매출</div>
              <div className="kpi-value" style={{ color: "#2E7D32" }}>{formatCurrency(totalRevenue)}</div>
              <div className="kpi-sub">Gross 매출 (박수별 분배 적용됨)</div>
            </div>
            
            <div className="kpi-card" style={{ borderLeft: "5px solid #999" }}>
              <div className="kpi-label">{selectedYear - 1}년 총 매출 (비교용)</div>
              <div className="kpi-value" style={{ color: "#666" }}>{formatCurrency(lastYearRevenue)}</div>
              <div className="kpi-sub">
                {totalRevenue > lastYearRevenue 
                  ? <span style={{color: "red"}}>▲ 작년 대비 상승</span>
                  : <span style={{color: "blue"}}>▼ 작년 대비 하락</span>
                }
              </div>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-title">📅 월별 매출 비교 ({selectedYear} vs {selectedYear-1})</div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(val) => `¥${val/10000}만`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="current" name={`${selectedYear}년`} stroke="#2E7D32" strokeWidth={3} activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey="last" name={`${selectedYear-1}년`} stroke="#999" strokeWidth={2} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
             

[Image of line chart comparing revenue across months]

          </div>

          <div className="chart-card">
            <div className="chart-title">🏢 건물별 매출 순위</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={buildingData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                <Tooltip formatter={(value) => formatCurrency(value)} cursor={{fill: 'transparent'}} />
                <Bar dataKey="value" fill="#4CAF50" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {Object.keys(roomData).sort().map(bName => (
            <div key={bName} className="building-section">
              <div className="building-title" style={{ color: "#2E7D32" }}>🏢 {bName} 상세 매출</div>
              <div className="table-card">
                <table className="table-full">
                  <thead>
                    <tr>
                      <th className="text-left">객실명</th>
                      <th className="text-right">매출액</th>
                      <th className="text-right">기여도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(roomData[bName])
                      .sort((a, b) => roomData[bName][b] - roomData[bName][a])
                      .map(rName => {
                        const val = roomData[bName][rName];
                        const buildingTotal = buildingData.find(x => x.name === bName)?.value || 1;
                        const share = ((val / buildingTotal) * 100).toFixed(1);
                        
                        return (
                          <tr key={rName}>
                            <td className="text-left" style={{fontWeight: "600"}}>{rName}</td>
                            <td className="text-right" style={{color: "#333"}}>{formatCurrency(val)}</td>
                            <td className="text-right" style={{color: "#888"}}>{share}%</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default RevenueDashboard;