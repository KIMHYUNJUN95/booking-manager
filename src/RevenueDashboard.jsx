import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from "firebase/firestore";
// ★ 중요: 직접 getFirestore() 하지 않고, firebase.js에서 가져옵니다.
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
    
    // 올해 데이터
    const qCurrent = query(
      collection(db, "reservations"),
      where("stayMonth", ">=", `${selectedYear}-01`),
      where("stayMonth", "<=", `${selectedYear}-12`),
      where("status", "==", "confirmed")
    );

    // 작년 데이터
    const lastYear = selectedYear - 1;
    const qLast = query(
      collection(db, "reservations"),
      where("stayMonth", ">=", `${lastYear}-01`),
      where("stayMonth", "<=", `${lastYear}-12`),
      where("status", "==", "confirmed")
    );

    try {
        const [snapCurrent, snapLast] = await Promise.all([getDocs(qCurrent), getDocs(qLast)]);
        
        const currentList = snapCurrent.docs.map(d => d.data());
        const lastList = snapLast.docs.map(d => d.data());

        // --- 데이터 가공 ---
        const monthlyMap = {};
        for(let i=1; i<=12; i++) {
        const monthStr = String(i).padStart(2, '0');
        monthlyMap[monthStr] = { month: `${i}월`, current: 0, last: 0 };
        }

        let currentTotal = 0;
        currentList.forEach(item => {
        if(item.stayMonth) {
            const month = item.stayMonth.slice(5, 7);
            const price = Number(item.price) || 0;
            if (monthlyMap[month]) {
            monthlyMap[month].current += price;
            currentTotal += price;
            }
        }
        });

        let lastTotal = 0;
        lastList.forEach(item => {
        if(item.stayMonth) {
            const month = item.stayMonth.slice(5, 7);
            const price = Number(item.price) || 0;
            if (monthlyMap[month]) {
            monthlyMap[month].last += price;
            lastTotal += price;
            }
        }
        });

        const chartData = Object.values(monthlyMap);

        const bMap = {};
        const rMap = {};

        currentList.forEach(item => {
        const bName = item.building || "Unknown";
        const rName = item.room || "Unknown";
        const price = Number(item.price) || 0;

        bMap[bName] = (bMap[bName] || 0) + price;

        if (!rMap[bName]) rMap[bName] = {};
        rMap[bName][rName] = (rMap[bName][rName] || 0) + price;
        });

        const buildingChartData = Object.keys(bMap)
        .map(key => ({ name: key, value: bMap[key] }))
        .sort((a, b) => b.value - a.value);

        setMonthlyData(chartData);
        setBuildingData(buildingChartData);
        setRoomData(rMap);
        setTotalRevenue(currentTotal);
        setLastYearRevenue(lastTotal);
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
        <h2 className="page-title" style={{ color: "#2E7D32" }}>💰 매출 대시보드</h2>
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
        <div style={{ textAlign: "center", padding: "50px", color: "#999" }}>데이터 분석 중...</div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderLeft: "5px solid #2E7D32" }}>
              <div className="kpi-label">{selectedYear}년 총 매출</div>
              <div className="kpi-value" style={{ color: "#2E7D32" }}>{formatCurrency(totalRevenue)}</div>
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