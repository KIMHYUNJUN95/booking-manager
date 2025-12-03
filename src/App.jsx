import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, orderBy, updateDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// --- [1] 디자인 (Apple Style CSS + Modal) ---
const styles = `
  * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
  body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "San Francisco", "Helvetica Neue", sans-serif;
    background-color: #F5F5F7; color: #1D1D1F;
    height: 100vh; overflow: hidden;
  }

  /* 로그인 */
  .login-container { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; display: flex; justify-content: center; align-items: center; background: #F5F5F7; z-index: 9999; }
  .login-card { background: white; width: 100%; max-width: 400px; padding: 40px; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); text-align: center; }
  .login-logo { font-size: 48px; margin-bottom: 20px; display: block; }
  .login-title { font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #1D1D1F; }
  .login-subtitle { font-size: 15px; color: #86868B; margin-bottom: 32px; }

  /* 레이아웃 */
  .dashboard-layout { display: flex; height: 100vh; width: 100vw; }
  .sidebar { width: 260px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px); border-right: 1px solid rgba(0,0,0,0.05); padding: 30px 20px; display: flex; flex-direction: column; justify-content: space-between; }
  .logo-area { font-size: 20px; font-weight: 800; color: #1D1D1F; margin-bottom: 40px; padding-left: 10px; display: flex; align-items: center; gap: 10px; }
  .nav-menu { display: flex; flex-direction: column; gap: 8px; }
  .nav-item { text-decoration: none; padding: 12px 16px; border-radius: 12px; color: #86868B; font-weight: 600; font-size: 15px; transition: all 0.2s ease; display: flex; align-items: center; gap: 12px; }
  .nav-item:hover { background-color: rgba(0,0,0,0.03); color: #1D1D1F; }
  .nav-item.active { background-color: #0071E3; color: white; box-shadow: 0 4px 12px rgba(0, 113, 227, 0.3); }
  .nav-item.active-purple { background-color: #5856D6; color: white; box-shadow: 0 4px 12px rgba(88, 86, 214, 0.3); }
  .nav-item.active-red { background-color: #FF3B30; color: white; box-shadow: 0 4px 12px rgba(255, 59, 48, 0.3); }

  .logout-btn { margin-top: auto; background: none; border: none; padding: 12px 16px; color: #FF3B30; font-weight: 600; font-size: 15px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 12px; border-radius: 12px; }
  .logout-btn:hover { background-color: rgba(255, 59, 48, 0.1); }

  .main-content { flex: 1; overflow-y: auto; padding: 40px; }
  .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
  .page-title { font-size: 28px; font-weight: 700; }

  /* 카드 & 차트 */
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
  .kpi-card { background: white; padding: 24px; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); display: flex; flex-direction: column; }
  .kpi-label { font-size: 13px; font-weight: 600; color: #86868B; margin-bottom: 8px; }
  .kpi-value { font-size: 32px; font-weight: 700; color: #1D1D1F; }
  .kpi-sub { font-size: 13px; margin-top: 4px; }
  .trend-up { color: #34C759; } .trend-down { color: #FF3B30; }

  .charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 30px; }
  .chart-card { background: white; padding: 24px; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); min-height: 350px; }
  .chart-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; }

  /* 테이블 */
  .building-section { margin-bottom: 40px; }
  .building-title { font-size: 20px; font-weight: 700; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
  .table-card { background: white; border-radius: 20px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); overflow: hidden; }
  .table-full { width: 100%; border-collapse: collapse; text-align: center; }
  .table-full th { padding: 16px; color: #86868B; font-size: 13px; border-bottom: 1px solid #F5F5F7; font-weight: 600; }
  .table-full td { padding: 16px; border-bottom: 1px solid #F5F5F7; font-size: 15px; vertical-align: middle; }
  .table-full tr:last-child td { border-bottom: none; }
  .text-left { text-align: left; }

  /* 태그 & 뱃지 */
  .tag { display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
  .tag-fire { color: #FF2D55; background-color: rgba(255, 45, 85, 0.1); }
  .tag-good { color: #34C759; background-color: rgba(52, 199, 89, 0.1); }
  .tag-warn { color: #FF9F0A; background-color: rgba(255, 159, 10, 0.1); }
  .tag-cancel { color: #86868B; background-color: #F2F2F7; }
  .pf-text-airbnb { color: #FF5A5F; font-weight: 600; }
  .pf-text-booking { color: #003580; font-weight: 600; }

  .btn-delete { background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; color: #FF3B30; transition: background 0.2s; }
  .btn-delete:hover { background-color: rgba(255, 59, 48, 0.1); }

  /* 폼 */
  .form-wrapper { background: white; max-width: 600px; margin: 0 auto; padding: 40px; border-radius: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.04); }
  .input-field { width: 100%; padding: 16px; margin-top: 8px; margin-bottom: 20px; background: #F2F2F7; border: none; border-radius: 12px; font-size: 16px; }
  .btn-primary { width: 100%; padding: 18px; background: #0071E3; color: white; border: none; border-radius: 14px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.1s; }
  .btn-primary:active { transform: scale(0.98); }
  .btn-danger { background: #FF3B30; }
  .month-select { padding: 10px 16px; border-radius: 10px; border: 1px solid #E5E5EA; background: white; font-size: 15px; font-weight: 500; cursor: pointer; }

  /* ★ 모달 스타일 (팝업창) */
  .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); display: flex; justify-content: center; align-items: center; z-index: 20000; backdrop-filter: blur(5px); }
  .modal-content { background: white; padding: 30px; border-radius: 24px; width: 90%; max-width: 450px; max-height: 70vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.15); animation: popIn 0.2s ease; }
  @keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #f5f5f5; padding-bottom: 15px; }
  .modal-title { font-size: 18px; font-weight: 700; color: #1D1D1F; }
  .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #86868B; }
  .modal-list-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f5f5f7; font-size: 15px; }
  .modal-date-label { color: #86868B; font-size: 13px; margin-bottom: 4px; }
  
  /* 클릭 가능한 숫자 스타일 */
  .clickable-number { cursor: pointer; text-decoration: underline; text-underline-offset: 4px; transition: opacity 0.2s; }
  .clickable-number:hover { opacity: 0.6; }
`;

// --- [2] 파이어베이스 설정 ---
const firebaseConfig = {
  apiKey: "AIzaSyBHI6d4mDDBEIB77GVQj5Rz1EbMyPaCjgA",
  authDomain: "my-booking-app-3f0e7.firebaseapp.com",
  projectId: "my-booking-app-3f0e7",
  storageBucket: "my-booking-app-3f0e7.firebasestorage.app",
  messagingSenderId: "1008418095386",
  appId: "1:1008418095386:web:99eddb1ec872d0b1906ca3",
  measurementId: "G-KKNJ5P1KFD"
};
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

// --- [3] 데이터 ---
const BUILDING_DATA = {
  "아라키초A": ["201호", "202호", "301호", "302호", "401호", "402호", "501호", "502호", "602호", "701호", "702호"],
  "아라키초B": ["101호", "102호", "201호", "202호", "301호", "302호", "401호", "402호"],
  "다이쿄초": ["B01호", "B02호", "101호", "102호", "201호", "202호", "302호"],
  "가부키초": ["202호", "203호", "302호", "303호", "402호", "403호", "502호", "603호", "802호", "803호"],
  "다카다노바바": ["2층", "3층", "4층", "5층", "6층", "7층", "8층", "9층"],
  "오쿠보A동": ["독채"],
  "오쿠보B동": ["독채"],
  "오쿠보C동": ["독채"],
  "사노시": ["독채"]
};

const isSingleUnitBuilding = (b) => b.startsWith("오쿠보") || b === "사노시";

// --- [4] 컴포넌트 ---
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <span className="login-logo">🏠</span>
        <h1 className="login-title">Booking Manager</h1>
        <p className="login-subtitle">관리자 로그인</p>
        <form onSubmit={handleLogin}>
          <input className="input-field" type="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="input-field" type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} />
          {error && <p style={{ color: '#FF3B30', fontSize: '13px' }}>{error}</p>}
          <button className="btn-primary" type="submit">로그인</button>
        </form>
      </div>
    </div>
  );
}

function Sidebar() {
  const location = useLocation();
  const menuItems = [
    { path: "/", label: "접수 실적 (Booking)", icon: "📊" },
    { path: "/occupancy", label: "숙박 현황 (Stay)", icon: "🛏️" },
    { path: "/cancellations", label: "취소 현황", icon: "📉" },
    { path: "/list", label: "전체 기록 관리", icon: "📋" },
    { path: "/add", label: "예약 입력", icon: "➕" },
    { path: "/add-cancel", label: "취소 입력", icon: "❌" },
  ];

  const handleLogout = () => {
    if (window.confirm("로그아웃 하시겠습니까?")) signOut(auth);
  };

  const getActiveClass = (path) => {
    if (location.pathname === path) {
      if (path === '/occupancy') return 'active-purple';
      if (path === '/cancellations' || path === '/add-cancel') return 'active-red';
      return 'active';
    }
    return '';
  };

  return (
    <div className="sidebar">
      <div>
        <div className="logo-area"><span>🏠</span> Booking Manager</div>
        <nav className="nav-menu">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${getActiveClass(item.path)}`}
            >
              <span>{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div>
        <button onClick={handleLogout} className="logout-btn"><span>🔓</span> 로그아웃</button>
      </div>
    </div>
  );
}

// ★ 상세 내역 모달 컴포넌트 (NEW)
function DetailModal({ title, data, onClose }) {
  if (!data) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {data.length === 0 ? <p style={{textAlign:'center', color:'#999'}}>데이터가 없습니다.</p> : 
           data.map((item, idx) => (
            <div key={idx} className="modal-list-item">
              <div>
                <div className="modal-date-label">숙박 예정 월</div>
                <div style={{fontWeight:'bold', color:'#5856D6'}}>{item.stayMonth}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="modal-date-label">접수일</div>
                <div>{item.date}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 1. [접수 실적 대시보드] - 팝업 기능 추가
function PerformanceDashboard({ targetMonth, setTargetMonth }) {
  const [data, setData] = useState({ total: 0, buildings: [], platforms: [], roomStats: {}, okuboTotal: 0 });
  // 팝업용 상태
  const [modalData, setModalData] = useState(null);
  const [modalTitle, setModalTitle] = useState("");

  const fetchData = async () => {
    const q = query(
      collection(db, "reservations"), 
      where("date", ">=", `${targetMonth}-01`), 
      where("date", "<=", `${targetMonth}-31`), 
      where("status", "==", "confirmed")
    );
    const snapshot = await getDocs(q);
    const reservations = snapshot.docs.map(doc => doc.data());

    let total = 0;
    const bCount = {}; 
    const pCount = { Airbnb: 0, Booking: 0 };
    const rStats = {}; 

    Object.keys(BUILDING_DATA).forEach(b => {
      rStats[b] = {};
      BUILDING_DATA[b].forEach(r => { 
        rStats[b][r] = { 
          total: 0, airbnb: 0, booking: 0, 
          airbnbList: [], bookingList: [] // 리스트 저장용 배열 추가
        }; 
      });
    });

    reservations.forEach(r => {
      if (rStats[r.building] && rStats[r.building][r.room]) {
        total++;
        bCount[r.building] = (bCount[r.building] || 0) + 1;
        if (pCount[r.platform] !== undefined) pCount[r.platform]++;
        rStats[r.building][r.room].total++;
        
        if (r.platform === 'Airbnb') {
          rStats[r.building][r.room].airbnb++;
          rStats[r.building][r.room].airbnbList.push(r); // 데이터 저장
        } else if (r.platform === 'Booking') {
          rStats[r.building][r.room].booking++;
          rStats[r.building][r.room].bookingList.push(r); // 데이터 저장
        }
      }
    });

    const okuboTotal = (bCount["오쿠보A동"] || 0) + (bCount["오쿠보B동"] || 0) + (bCount["오쿠보C동"] || 0);
    const buildingChartData = Object.keys(bCount).map(key => ({ name: key, count: bCount[key] })).sort((a, b) => b.count - a.count);
    const platformChartData = [{ name: 'Airbnb', value: pCount.Airbnb }, { name: 'Booking', value: pCount.Booking }];
    setData({ total, buildings: buildingChartData, platforms: platformChartData, roomStats: rStats, okuboTotal });
  };

  useEffect(() => { fetchData(); }, [targetMonth]);
  const PIE_COLORS = ['#FF5A5F', '#003580'];

  // 클릭 핸들러
  const handleNumberClick = (title, list) => {
    if (list && list.length > 0) {
      setModalTitle(title);
      setModalData(list);
    }
  };

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title">📅 접수 실적 (Booking Date)</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#86868B' }}>조회할 접수 월:</span>
          <input type="month" className="month-select" value={targetMonth} onChange={e => setTargetMonth(e.target.value)} />
        </div>
      </div>
      
      {/* 팝업창 */}
      {modalData && <DetailModal title={modalTitle} data={modalData} onClose={() => setModalData(null)} />}

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">이번 달 총 접수</div><div className="kpi-value">{data.total}건</div><div className="kpi-sub trend-up">순수 예약</div></div>
        <div className="kpi-card"><div className="kpi-label">Airbnb 접수</div><div className="kpi-value" style={{ color: '#FF5A5F' }}>{data.platforms[0]?.value}건</div></div>
        <div className="kpi-card"><div className="kpi-label">Booking 접수</div><div className="kpi-value" style={{ color: '#003580' }}>{data.platforms[1]?.value}건</div></div>
      </div>
      <div className="charts-grid">
        <div className="chart-card"><div className="chart-title">🏢 건물별 접수량</div><ResponsiveContainer width="100%" height={300}><BarChart data={data.buildings}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#86868B', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#86868B', fontSize: 12 }} /><Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} /><Bar dataKey="count" fill="#0071E3" radius={[6, 6, 0, 0]} barSize={40} /></BarChart></ResponsiveContainer></div>
        <div className="chart-card"><div className="chart-title">⚖️ 플랫폼 점유율</div><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={data.platforms} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">{data.platforms.map((entry, index) => (<Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />))}</Pie><Tooltip /></PieChart></ResponsiveContainer><div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '10px', fontSize: '13px', color: '#666' }}><span style={{ color: '#FF5A5F' }}>● Airbnb</span><span style={{ color: '#003580' }}>● Booking</span></div></div>
      </div>

      {Object.keys(data.roomStats).map((building) => {
        const buildingTotal = Object.values(data.roomStats[building]).reduce((sum, r) => sum + r.total, 0);
        if (buildingTotal === 0) return null;

        let shareDenominator = buildingTotal;
        let shareLabel = "건물내 비중";

        if (building.startsWith("오쿠보")) {
          shareDenominator = data.okuboTotal;
          shareLabel = "오쿠보 전체 비중";
        } else if (building === "사노시") {
          shareDenominator = data.total;
          shareLabel = "전체 비중";
        }

        return (
          <div key={building} className="building-section">
            <div className="building-title">🏢 {building} <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#86868B' }}>(접수 {buildingTotal}건)</span></div>
            <div className="table-card">
              <table className="table-full">
                <thead><tr><th className="text-left" style={{ width: '30%' }}>객실명</th><th>Airbnb</th><th>Booking</th><th>합계</th><th>{shareLabel}(%)</th></tr></thead>
                <tbody>
                  {Object.keys(data.roomStats[building]).sort((a, b) => data.roomStats[building][b].total - data.roomStats[building][a].total).map((room) => {
                    const rData = data.roomStats[building][room];
                    const share = shareDenominator === 0 ? 0 : ((rData.total / shareDenominator) * 100).toFixed(1);
                    return (
                      <tr key={room}>
                        <td className="text-left" style={{ fontWeight: '600' }}>{room}</td>
                        {/* ★ 클릭하면 팝업 뜨게 수정됨 */}
                        <td>
                          <span 
                            className={rData.airbnb > 0 ? "pf-text-airbnb clickable-number" : "pf-text-airbnb"}
                            onClick={() => handleNumberClick(`${building} ${room} - Airbnb 내역`, rData.airbnbList)}
                          >
                            {rData.airbnb}
                          </span>
                        </td>
                        <td>
                          <span 
                            className={rData.booking > 0 ? "pf-text-booking clickable-number" : "pf-text-booking"}
                            onClick={() => handleNumberClick(`${building} ${room} - Booking 내역`, rData.bookingList)}
                          >
                            {rData.booking}
                          </span>
                        </td>
                        <td><strong>{rData.total}</strong></td>
                        <td>{share}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 2. [숙박 현황 대시보드] - 기준: 숙박월(stayMonth)
function OccupancyDashboard({ targetMonth, setTargetMonth }) {
  const [data, setData] = useState({ total: 0, buildings: [], platforms: [], roomStats: {}, okuboTotal: 0 });

  const fetchData = async () => {
    const q = query(
      collection(db, "reservations"), 
      where("stayMonth", "==", targetMonth), 
      where("status", "==", "confirmed")
    );
    const snapshot = await getDocs(q);
    const reservations = snapshot.docs.map(doc => doc.data());

    let total = 0;
    const bCount = {}; 
    const pCount = { Airbnb: 0, Booking: 0 };
    const rStats = {}; 

    Object.keys(BUILDING_DATA).forEach(b => {
      rStats[b] = {};
      BUILDING_DATA[b].forEach(r => { rStats[b][r] = { total: 0, airbnb: 0, booking: 0 }; });
    });

    reservations.forEach(r => {
      if (rStats[r.building] && rStats[r.building][r.room]) {
        total++;
        bCount[r.building] = (bCount[r.building] || 0) + 1;
        if (pCount[r.platform] !== undefined) pCount[r.platform]++;
        rStats[r.building][r.room].total++;
        if (r.platform === 'Airbnb') rStats[r.building][r.room].airbnb++;
        else if (r.platform === 'Booking') rStats[r.building][r.room].booking++;
      }
    });

    const okuboTotal = (bCount["오쿠보A동"] || 0) + (bCount["오쿠보B동"] || 0) + (bCount["오쿠보C동"] || 0);
    setData({ total, buildings: [], platforms: [], roomStats: rStats, okuboTotal });
  };

  useEffect(() => { fetchData(); }, [targetMonth]);

  return (
    <div className="dashboard-content">
      <div className="dashboard-header"><h2 className="page-title" style={{ color: '#5856D6' }}>🛏️ 숙박 현황 (Stay Month)</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#86868B' }}>조회할 숙박 월:</span>
          <input type="month" className="month-select" value={targetMonth} onChange={e => setTargetMonth(e.target.value)} />
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">해당 월 총 숙박 예약</div><div className="kpi-value" style={{ color: '#5856D6' }}>{data.total}건</div><div className="kpi-sub">미래 예약 확인용</div></div>
      </div>

      {Object.keys(data.roomStats).map((building) => {
        const buildingTotal = Object.values(data.roomStats[building]).reduce((sum, r) => sum + r.total, 0);
        if (buildingTotal === 0) return null;

        let shareDenominator = buildingTotal;
        let shareLabel = "건물내 비중";
        if (building.startsWith("오쿠보")) {
          shareDenominator = data.okuboTotal;
          shareLabel = "오쿠보내 비중";
        } else if (building === "사노시") {
          shareDenominator = data.total;
          shareLabel = "전체 비중";
        }

        return (
          <div key={building} className="building-section">
            <div className="building-title">🏢 {building} <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#86868B' }}>(숙박 {buildingTotal}건)</span></div>
            <div className="table-card">
              <table className="table-full">
                <thead><tr><th className="text-left" style={{ width: '30%' }}>객실명</th><th>Airbnb</th><th>Booking</th><th>합계</th><th>{shareLabel}(%)</th></tr></thead>
                <tbody>
                  {Object.keys(data.roomStats[building]).sort((a, b) => data.roomStats[building][b].total - data.roomStats[building][a].total).map((room) => {
                    const rData = data.roomStats[building][room];
                    const share = shareDenominator === 0 ? 0 : ((rData.total / shareDenominator) * 100).toFixed(1);
                    return (
                      <tr key={room}>
                        <td className="text-left" style={{ fontWeight: '600' }}>{room}</td>
                        <td><span className="pf-text-airbnb">{rData.airbnb}</span></td>
                        <td><span className="pf-text-booking">{rData.booking}</span></td>
                        <td><strong>{rData.total}</strong></td>
                        <td>{share}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 3. [취소 현황 대시보드]
function CancellationDashboard({ targetMonth, setTargetMonth }) {
  const [data, setData] = useState({ total: 0, buildings: [], roomStats: {} });

  const fetchData = async () => {
    const q = query(
      collection(db, "reservations"), 
      where("stayMonth", "==", targetMonth), 
      where("status", "==", "cancelled")
    );
    const snapshot = await getDocs(q);
    const cancellations = snapshot.docs.map(doc => doc.data());

    let total = 0;
    const bCount = {};
    const rStats = {};

    Object.keys(BUILDING_DATA).forEach(b => {
      rStats[b] = {};
      BUILDING_DATA[b].forEach(r => { rStats[b][r] = 0; });
    });

    cancellations.forEach(r => {
      if (rStats[r.building] && rStats[r.building][r.room] !== undefined) {
        total++;
        bCount[r.building] = (bCount[r.building] || 0) + 1;
        rStats[r.building][r.room]++;
      }
    });

    const buildingChartData = Object.keys(bCount).map(key => ({ name: key, count: bCount[key] })).sort((a, b) => b.count - a.count);
    setData({ total, buildings: buildingChartData, roomStats: rStats });
  };

  useEffect(() => { fetchData(); }, [targetMonth]);

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title" style={{ color: '#FF3B30' }}>취소 현황 (분석)</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#86868B' }}>조회할 숙박 월:</span>
          <input type="month" className="month-select" value={targetMonth} onChange={e => setTargetMonth(e.target.value)} />
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">총 취소 건수</div><div className="kpi-value" style={{ color: '#FF3B30' }}>{data.total}건</div><div className="kpi-sub">해당 월 예약 취소</div></div>
        <div className="kpi-card"><div className="kpi-label">취소 1위 건물</div><div className="kpi-value">{data.buildings.length > 0 ? data.buildings[0].name : '-'}</div></div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">📉 건물별 취소 발생</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.buildings}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#86868B', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#86868B', fontSize: 12 }} /><Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
              <Bar dataKey="count" fill="#FF3B30" radius={[6, 6, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {Object.keys(data.roomStats).map((building) => {
        const buildingTotal = Object.values(data.roomStats[building]).reduce((sum, val) => sum + val, 0);
        if (buildingTotal === 0) return null;

        return (
          <div key={building} className="building-section">
            <div className="building-title">🏢 {building} <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#FF3B30' }}>(취소 {buildingTotal}건)</span></div>
            <div className="table-card">
              <table className="table-full">
                <thead><tr><th className="text-left">객실명</th><th>취소 건수</th><th>상태</th></tr></thead>
                <tbody>
                  {Object.keys(data.roomStats[building]).filter(r => data.roomStats[building][r] > 0).map((room) => (
                    <tr key={room}>
                      <td className="text-left" style={{ fontWeight: '600' }}>{room}</td>
                      <td><span style={{ color: '#FF3B30', fontWeight: 'bold' }}>{data.roomStats[building][room]}건</span></td>
                      <td><span className="tag tag-cancel">취소 발생</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 4. 기록 관리 리스트
function RecordList({ targetMonth, setTargetMonth }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState("전체");
  const [selectedRoom, setSelectedRoom] = useState("전체");

  const fetchRecords = async () => {
    setLoading(true);
    const q = query(
      collection(db, "reservations"), 
      where("date", ">=", `${targetMonth}-01`), 
      where("date", "<=", `${targetMonth}-31`),
      orderBy("date", "desc")
    );
    const snapshot = await getDocs(q);
    setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setLoading(false);
  };
  useEffect(() => { fetchRecords(); }, [targetMonth]);

  const handleDelete = async (id) => { if (window.confirm("삭제하시겠습니까?")) { await deleteDoc(doc(db, "reservations", id)); fetchRecords(); } };

  const filteredRecords = records.filter((res) => {
    if (selectedBuilding !== "전체" && res.building !== selectedBuilding) return false;
    if (selectedRoom !== "전체" && res.room !== selectedRoom) return false;
    return true;
  });

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title">전체 기록 관리</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select 
            className="month-select" 
            value={selectedBuilding} 
            onChange={(e) => {
              setSelectedBuilding(e.target.value);
              setSelectedRoom("전체");
            }}
          >
            <option value="전체">전체 건물</option>
            {Object.keys(BUILDING_DATA).map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          {selectedBuilding !== "전체" && (
            <select 
              className="month-select" 
              value={selectedRoom} 
              onChange={(e) => setSelectedRoom(e.target.value)}
            >
              <option value="전체">전체 객실</option>
              {BUILDING_DATA[selectedBuilding].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          <span style={{ fontSize: '14px', fontWeight: '600', color: '#86868B', marginLeft: '10px' }}>조회할 접수 월:</span>
          <input type="month" className="month-select" value={targetMonth} onChange={e => setTargetMonth(e.target.value)} />
        </div>
      </div>
      <div className="table-card">
        <table className="table-full">
          <thead><tr><th className="text-left">접수일</th><th className="text-left">숙박월</th><th>건물/객실</th><th>플랫폼</th><th>구분</th><th>관리</th></tr></thead>
          <tbody>
            {filteredRecords.map(res => (
              <tr key={res.id}>
                <td className="text-left">{res.date}</td>
                <td className="text-left" style={{ fontWeight: 'bold', color: '#5856D6' }}>{res.stayMonth}</td>
                <td>{res.building} {res.room}</td>
                <td><span className={res.platform === 'Airbnb' ? 'pf-text-airbnb' : 'pf-text-booking'}>{res.platform}</span></td>
                <td>{res.status === 'cancelled' ? <span className="tag tag-cancel">취소기록</span> : <span className="tag tag-good">예약확정</span>}</td>
                <td><button onClick={() => handleDelete(res.id)} className="btn-delete">🗑️ 삭제</button></td>
              </tr>
            ))}
            {filteredRecords.length === 0 && (
              <tr><td colSpan="6" style={{textAlign: 'center', padding: '40px', color: '#86868B'}}>검색 결과가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 5. 입력 화면들
function AddReservation({ initialMonth }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stayMonth, setStayMonth] = useState(initialMonth);
  const [selectedBuilding, setSelectedBuilding] = useState("아라키초A");
  const [selectedRoom, setSelectedRoom] = useState(BUILDING_DATA["아라키초A"][0]);
  const [platform, setPlatform] = useState('Airbnb');
  const [count, setCount] = useState(1);

  const handleSubmit = async (e) => {
    e.preventDefault(); if (!window.confirm("저장하시겠습니까?")) return;
    try {
      const promises = [];
      for (let i = 0; i < count; i++) promises.push(addDoc(collection(db, "reservations"), {
        date,
        stayMonth,
        building: selectedBuilding,
        room: selectedRoom,
        platform,
        status: "confirmed",
        createdAt: new Date()
      }));
      await Promise.all(promises); alert("완료!");
    } catch { alert("오류"); }
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <div className="form-wrapper"><h2 style={{ textAlign: 'center', marginBottom: '30px' }}>새 예약 등록</h2>
        <form onSubmit={handleSubmit}>
          <label className="input-label">접수일 (오늘 날짜)</label><input className="input-field" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <label className="input-label">숙박 월 (체크인)</label><input className="input-field" type="month" value={stayMonth} onChange={e => setStayMonth(e.target.value)} style={{ border: '2px solid #0071E3' }} />
          <label className="input-label">건물</label><select className="input-field" value={selectedBuilding} onChange={e => { setSelectedBuilding(e.target.value); setSelectedRoom(BUILDING_DATA[e.target.value][0]); }}>{Object.keys(BUILDING_DATA).map(b => <option key={b} value={b}>{b}</option>)}</select>
          <label className="input-label">객실</label><select className="input-field" value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}>{BUILDING_DATA[selectedBuilding].map(r => <option key={r} value={r}>{r}</option>)}</select>
          <label className="input-label">플랫폼</label><select className="input-field" value={platform} onChange={e => setPlatform(e.target.value)}><option value="Airbnb">Airbnb</option><option value="Booking">Booking.com</option></select>
          <label className="input-label">예약 건수 (동시)</label><input className="input-field" type="number" min="1" value={count} onChange={e => setCount(parseInt(e.target.value))} />
          <button className="btn-primary" type="submit">저장하기</button>
        </form>
      </div>
    </div>
  );
}

function AddCancellation({ initialMonth }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stayMonth, setStayMonth] = useState(initialMonth);
  const [selectedBuilding, setSelectedBuilding] = useState("아라키초A");
  const [selectedRoom, setSelectedRoom] = useState(BUILDING_DATA["아라키초A"][0]);
  const [platform, setPlatform] = useState('Airbnb');
  const [count, setCount] = useState(1);
  const handleSubmit = async (e) => {
    e.preventDefault(); if (!window.confirm("취소 기록을 등록하시겠습니까?")) return;
    try {
      const promises = [];
      for (let i = 0; i < count; i++) promises.push(addDoc(collection(db, "reservations"), {
        date,
        stayMonth,
        building: selectedBuilding,
        room: selectedRoom,
        platform,
        status: "cancelled",
        createdAt: new Date()
      }));
      await Promise.all(promises); alert("등록 완료");
    } catch { alert("오류"); }
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <div className="form-wrapper"><h2 style={{ textAlign: 'center', marginBottom: '30px', color: '#FF3B30' }}>취소 기록 등록</h2>
        <form onSubmit={handleSubmit}>
          <label className="input-label">취소 접수일</label><input className="input-field" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <label className="input-label">취소된 예약의 숙박 월</label><input className="input-field" type="month" value={stayMonth} onChange={e => setStayMonth(e.target.value)} style={{ border: '2px solid #FF3B30' }} />
          <label className="input-label">건물</label><select className="input-field" value={selectedBuilding} onChange={e => { setSelectedBuilding(e.target.value); setSelectedRoom(BUILDING_DATA[e.target.value][0]); }}>{Object.keys(BUILDING_DATA).map(b => <option key={b} value={b}>{b}</option>)}</select>
          <label className="input-label">객실</label><select className="input-field" value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}>{BUILDING_DATA[selectedBuilding].map(r => <option key={r} value={r}>{r}</option>)}</select>
          <label className="input-label">플랫폼</label><select className="input-field" value={platform} onChange={e => setPlatform(e.target.value)}><option value="Airbnb">Airbnb</option><option value="Booking">Booking.com</option></select>
          <label className="input-label">취소 건수</label><input className="input-field" type="number" min="1" value={count} onChange={e => setCount(parseInt(e.target.value))} />
          <button className="btn-primary btn-danger" type="submit">취소 등록</button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [globalMonth, setGlobalMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => { const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }); return () => unsubscribe(); }, []);
  if (loading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>로딩 중...</div>;
  if (!user) return <><style>{styles}</style><Login /></>;

  return (
    <>
      <style>{styles}</style>
      <Router>
        <div className="dashboard-layout">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<PerformanceDashboard targetMonth={globalMonth} setTargetMonth={setGlobalMonth} />} />
              <Route path="/occupancy" element={<OccupancyDashboard targetMonth={globalMonth} setTargetMonth={setGlobalMonth} />} />
              <Route path="/cancellations" element={<CancellationDashboard targetMonth={globalMonth} setTargetMonth={setGlobalMonth} />} />
              <Route path="/list" element={<RecordList targetMonth={globalMonth} setTargetMonth={setGlobalMonth} />} />

              <Route path="/add" element={<AddReservation initialMonth={globalMonth} />} />
              <Route path="/add-cancel" element={<AddCancellation initialMonth={globalMonth} />} />
            </Routes>
          </main>
        </div>
      </Router>
    </>
  );
}

export default App;