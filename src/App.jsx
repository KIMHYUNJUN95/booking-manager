import React, { useState, useEffect } from 'react';
// 깃허브 배포를 위해 HashRouter 사용
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, orderBy } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// --- [1] 디자인 (Apple Style CSS) ---
const styles = `
  * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
  body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "San Francisco", "Helvetica Neue", sans-serif;
    background-color: #F5F5F7; color: #1D1D1F;
    height: 100vh; overflow: hidden;
  }

  /* 로그인 화면 */
  .login-container {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    display: flex; justify-content: center; align-items: center;
    background: #F5F5F7; z-index: 9999;
  }
  .login-card {
    background: white; width: 100%; max-width: 400px; padding: 40px;
    border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); text-align: center;
  }
  .login-logo { font-size: 48px; margin-bottom: 20px; display: block; }
  .login-title { font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #1D1D1F; }
  .login-subtitle { font-size: 15px; color: #86868B; margin-bottom: 32px; }

  /* 대시보드 레이아웃 */
  .dashboard-layout { display: flex; height: 100vh; width: 100vw; }
  
  /* 사이드바 */
  .sidebar {
    width: 260px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px);
    border-right: 1px solid rgba(0,0,0,0.05); padding: 30px 20px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .logo-area {
    font-size: 20px; font-weight: 800; color: #1D1D1F;
    margin-bottom: 40px; padding-left: 10px; display: flex; align-items: center; gap: 10px;
  }
  .nav-menu { display: flex; flex-direction: column; gap: 8px; }
  .nav-item {
    text-decoration: none; padding: 12px 16px; border-radius: 12px;
    color: #86868B; font-weight: 600; font-size: 15px; transition: all 0.2s ease;
    display: flex; align-items: center; gap: 12px;
  }
  .nav-item:hover { background-color: rgba(0,0,0,0.03); color: #1D1D1F; }
  .nav-item.active { background-color: #0071E3; color: white; box-shadow: 0 4px 12px rgba(0, 113, 227, 0.3); }
  
  .logout-btn {
    margin-top: auto; background: none; border: none; padding: 12px 16px;
    color: #FF3B30; font-weight: 600; font-size: 15px; cursor: pointer;
    text-align: left; display: flex; align-items: center; gap: 12px; border-radius: 12px;
  }
  .logout-btn:hover { background-color: rgba(255, 59, 48, 0.1); }

  /* 메인 콘텐츠 */
  .main-content { flex: 1; overflow-y: auto; padding: 40px; }
  .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
  .page-title { font-size: 28px; font-weight: 700; }

  /* 카드 그리드 */
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
  .kpi-card {
    background: white; padding: 24px; border-radius: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.02); display: flex; flex-direction: column;
  }
  .kpi-label { font-size: 13px; font-weight: 600; color: #86868B; margin-bottom: 8px; }
  .kpi-value { font-size: 32px; font-weight: 700; color: #1D1D1F; }
  .kpi-sub { font-size: 13px; margin-top: 4px; }
  .trend-up { color: #34C759; }

  /* 차트 그리드 */
  .charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 30px; }
  .chart-card {
    background: white; padding: 24px; border-radius: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.02); min-height: 350px;
  }
  .chart-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; }

  /* 테이블 스타일 */
  .building-section { margin-bottom: 40px; }
  .building-title { font-size: 20px; font-weight: 700; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
  .table-card {
    background: white; border-radius: 20px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); overflow: hidden;
  }
  .table-full { width: 100%; border-collapse: collapse; }
  .table-full th { text-align: left; padding: 16px; color: #86868B; font-size: 13px; border-bottom: 1px solid #F5F5F7; }
  .table-full td { padding: 16px; border-bottom: 1px solid #F5F5F7; font-size: 15px; vertical-align: middle; }
  .table-full tr:last-child td { border-bottom: none; }

  /* 상태 태그 */
  .tag { display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
  .tag-fire { color: #FF2D55; background-color: rgba(255, 45, 85, 0.1); }
  .tag-good { color: #34C759; background-color: rgba(52, 199, 89, 0.1); }
  .tag-warn { color: #FF9F0A; background-color: rgba(255, 159, 10, 0.1); }
  .tag-cancel { color: #86868B; background-color: #F2F2F7; }

  /* 삭제 버튼 */
  .btn-delete {
    background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px;
    color: #FF3B30; transition: background 0.2s;
  }
  .btn-delete:hover { background-color: rgba(255, 59, 48, 0.1); }

  /* 입력 폼 */
  .form-wrapper {
    background: white; max-width: 600px; margin: 0 auto; padding: 40px;
    border-radius: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.04);
  }
  .input-field {
    width: 100%; padding: 16px; margin-top: 8px; margin-bottom: 20px;
    background: #F2F2F7; border: none; border-radius: 12px; font-size: 16px;
  }
  .btn-primary {
    width: 100%; padding: 18px; background: #0071E3; color: white;
    border: none; border-radius: 14px; font-size: 16px; font-weight: 600; cursor: pointer;
    transition: transform 0.1s;
  }
  .btn-primary:active { transform: scale(0.98); }
  .btn-danger { background: #FF3B30; }
  
  .month-select { padding: 10px 16px; border-radius: 10px; border: 1px solid #E5E5EA; background: white; font-size: 15px; font-weight: 500; cursor: pointer; }
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

// --- [3] 데이터 (오쿠보 분리됨) ---
const BUILDING_DATA = {
  "아라키초A": ["201호", "202호", "301호", "302호", "401호", "402호", "501호", "502호", "602호", "701호", "702호"],
  "아라키초B": ["101호", "102호", "201호", "202호", "301호", "302호", "401호", "402호"],
  "다이쿄초": ["B01호", "B02호", "101호", "102호", "201호", "202호", "302호"],
  "가부키초": ["202호", "203호", "302호", "303호", "402호", "403호", "502호", "603호", "802호", "803호"],
  "다카다노바바": ["2층", "3층", "4층", "5층", "6층", "7층", "8층", "9층"],
  // 오쿠보 분리 (주택이라 독채로 설정)
  "오쿠보A동": ["독채"],
  "오쿠보B동": ["독채"],
  "오쿠보C동": ["독채"],
  "사노시": ["독채"]
};

// --- [4] 컴포넌트 ---
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (err) { setError("이메일 또는 비밀번호가 올바르지 않습니다."); }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <span className="login-logo">🏠</span>
        <h1 className="login-title">Booking Manager</h1>
        <p className="login-subtitle">관리자 계정으로 로그인하세요</p>
        <form onSubmit={handleLogin}>
          <input className="input-field" type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input-field" type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p style={{color: '#FF3B30', fontSize: '13px', marginBottom: '15px'}}>{error}</p>}
          <button className="btn-primary" type="submit">로그인</button>
        </form>
      </div>
    </div>
  );
}

function Sidebar() {
  const location = useLocation();
  const menuItems = [
    { path: "/", label: "대시보드", icon: "📊" },
    { path: "/list", label: "예약 관리 (삭제)", icon: "📋" },
    { path: "/add", label: "예약 입력", icon: "➕" },
    { path: "/cancel", label: "취소 입력", icon: "❌" },
  ];
  const handleLogout = () => { if(window.confirm("로그아웃 하시겠습니까?")) signOut(auth); };

  return (
    <div className="sidebar">
      <div>
        <div className="logo-area"><span>🏠</span> Booking Manager</div>
        <nav className="nav-menu">
          {menuItems.map((item) => (
            <Link key={item.path} to={item.path} className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}>
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

// 예약 리스트 및 삭제 컴포넌트
function ReservationList() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [targetMonth, setTargetMonth] = useState(new Date().toISOString().slice(0, 7));

  const fetchReservations = async () => {
    setLoading(true);
    const q = query(
      collection(db, "reservations"),
      where("date", ">=", `${targetMonth}-01`),
      where("date", "<=", `${targetMonth}-31`),
      orderBy("date", "desc")
    );
    const snapshot = await getDocs(q);
    setReservations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setLoading(false);
  };

  useEffect(() => { fetchReservations(); }, [targetMonth]);

  const handleDelete = async (id) => {
    if (!window.confirm("정말 이 기록을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "reservations", id));
      alert("삭제되었습니다.");
      fetchReservations();
    } catch (error) {
      alert("삭제 실패: " + error.message);
    }
  };

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title">예약 관리 (기록 삭제)</h2>
        <input type="month" className="month-select" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
      </div>

      <div className="table-card">
        <table className="table-full">
          <thead>
            <tr>
              <th>날짜</th>
              <th>건물</th>
              <th>객실</th>
              <th>플랫폼</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan="6" style={{textAlign:'center', padding:'20px'}}>로딩 중...</td></tr> : 
             reservations.map((res) => (
              <tr key={res.id}>
                <td>{res.date}</td>
                <td>{res.building}</td>
                <td style={{fontWeight:'bold'}}>{res.room}</td>
                <td>
                  <span style={{color: res.platform === 'Airbnb' ? '#FF5A5F' : '#003580', fontWeight:'600'}}>
                    {res.platform}
                  </span>
                </td>
                <td>
                  {res.status === 'cancelled' 
                    ? <span className="tag tag-cancel">취소됨</span> 
                    : <span className="tag tag-good">예약됨</span>}
                </td>
                <td>
                  <button onClick={() => handleDelete(res.id)} className="btn-delete" title="삭제">
                    🗑️ 삭제
                  </button>
                </td>
              </tr>
            ))}
            {!loading && reservations.length === 0 && <tr><td colSpan="6" style={{textAlign:'center', padding:'40px'}}>데이터가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatsAnalysis() {
  const [targetMonth, setTargetMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState({ total: 0, cancelled: 0, buildings: [], platforms: [], roomStats: {} });

  const fetchData = async () => {
    const q = query(collection(db, "reservations"), where("date", ">=", `${targetMonth}-01`), where("date", "<=", `${targetMonth}-31`));
    const snapshot = await getDocs(q);
    const reservations = snapshot.docs.map(doc => doc.data());

    let total = 0; let cancelled = 0; 
    const bCount = {}; 
    const pCount = { Airbnb: 0, Booking: 0 };
    const rStats = {}; 

    // 초기화
    Object.keys(BUILDING_DATA).forEach(b => {
      rStats[b] = {};
      BUILDING_DATA[b].forEach(r => {
        rStats[b][r] = { total: 0, cancelled: 0 };
      });
    });

    reservations.forEach(r => {
      if (rStats[r.building] && rStats[r.building][r.room]) {
        if (r.status === 'cancelled') { 
          cancelled++;
          rStats[r.building][r.room].cancelled++;
        } else { 
          total++; 
          bCount[r.building] = (bCount[r.building] || 0) + 1; 
          if (pCount[r.platform] !== undefined) pCount[r.platform]++;
          rStats[r.building][r.room].total++;
        }
      }
    });

    const buildingChartData = Object.keys(bCount).map(key => ({ name: key, count: bCount[key] })).sort((a, b) => b.count - a.count);
    const platformChartData = [{ name: 'Airbnb', value: pCount.Airbnb }, { name: 'Booking', value: pCount.Booking }];
    
    setData({ total, cancelled, buildings: buildingChartData, platforms: platformChartData, roomStats: rStats });
  };

  useEffect(() => { fetchData(); }, [targetMonth]);
  const PIE_COLORS = ['#FF5A5F', '#003580'];

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title">월별 성과 분석</h2>
        <input type="month" className="month-select" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
      </div>
      
      {/* KPI & Charts */}
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">총 예약 건수</div><div className="kpi-value">{data.total}건</div><div className="kpi-sub trend-up">↗ 증가 추세</div></div>
        <div className="kpi-card"><div className="kpi-label">취소율</div><div className="kpi-value">{data.total + data.cancelled === 0 ? 0 : ((data.cancelled / (data.total + data.cancelled)) * 100).toFixed(1)}%</div><div className="kpi-sub">안정적</div></div>
        <div className="kpi-card"><div className="kpi-label">가동률 Top</div><div className="kpi-value" style={{fontSize:'24px'}}>{data.buildings.length > 0 ? data.buildings[0].name : '-'}</div><div className="kpi-sub trend-up">1위</div></div>
      </div>
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">🏢 건물별 예약 현황</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.buildings}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:'#86868B',fontSize:12}} /><YAxis axisLine={false} tickLine={false} tick={{fill:'#86868B',fontSize:12}} /><Tooltip cursor={{fill:'rgba(0,0,0,0.05)'}} /><Bar dataKey="count" fill="#0071E3" radius={[6,6,0,0]} barSize={40} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title">⚖️ 플랫폼 점유율</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart><Pie data={data.platforms} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">{data.platforms.map((entry, index) => (<Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />))}</Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
          <div style={{display:'flex',justifyContent:'center',gap:'15px',marginTop:'10px',fontSize:'13px',color:'#666'}}><span style={{color:'#FF5A5F'}}>● Airbnb</span><span style={{color:'#003580'}}>● Booking</span></div>
        </div>
      </div>

      {/* 건물별 객실 상세 현황 */}
      {Object.keys(data.roomStats).map((building) => {
        const buildingTotal = Object.values(data.roomStats[building]).reduce((sum, r) => sum + r.total, 0);
        if (buildingTotal === 0 && Object.values(data.roomStats[building]).every(r => r.cancelled === 0)) return null;

        return (
          <div key={building} className="building-section">
            <div className="building-title">🏢 {building} <span style={{fontSize:'14px', fontWeight:'normal', color:'#86868B'}}>(총 {buildingTotal}건)</span></div>
            <div className="table-card">
              <table className="table-full">
                <thead>
                  <tr>
                    <th style={{width:'30%'}}>객실명</th>
                    <th>예약 건수</th>
                    <th>예약 비중(%)</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(data.roomStats[building])
                    .sort((a, b) => data.roomStats[building][b].total - data.roomStats[building][a].total)
                    .map((room) => {
                      const rData = data.roomStats[building][room];
                      const share = buildingTotal === 0 ? 0 : ((rData.total / buildingTotal) * 100).toFixed(1);
                      const isHot = Number(share) >= 15;
                      const isLow = rData.total === 0;

                      return (
                        <tr key={room}>
                          <td style={{fontWeight:'600'}}>{room}</td>
                          <td>{rData.total}건</td>
                          <td>{share}%</td>
                          <td>
                            {isHot && <span className="tag tag-fire">🔥 인기 객실</span>}
                            {isLow && <span className="tag tag-warn">📉 예약 저조</span>}
                            {!isHot && !isLow && <span className="tag tag-good">보통</span>}
                          </td>
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

function AddReservation() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedBuilding, setSelectedBuilding] = useState("아라키초A");
  const [selectedRoom, setSelectedRoom] = useState(BUILDING_DATA["아라키초A"][0]);
  const [platform, setPlatform] = useState('Airbnb');
  const handleSubmit = async (e) => {
    e.preventDefault(); if(!window.confirm("저장하시겠습니까?")) return;
    try { await addDoc(collection(db, "reservations"), { date, building: selectedBuilding, room: selectedRoom, platform, status: "confirmed", createdAt: new Date() }); alert("완료!"); } catch (error) { alert("오류"); }
  };
  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100%'}}>
      <div className="form-wrapper"><h2 style={{textAlign:'center',marginBottom:'30px'}}>새 예약 등록</h2>
        <form onSubmit={handleSubmit}>
          <label style={{fontWeight:'600',fontSize:'13px',color:'#86868B'}}>날짜</label><input className="input-field" type="date" value={date} onChange={e=>setDate(e.target.value)} />
          <label style={{fontWeight:'600',fontSize:'13px',color:'#86868B'}}>건물</label><select className="input-field" value={selectedBuilding} onChange={e=>{setSelectedBuilding(e.target.value);setSelectedRoom(BUILDING_DATA[e.target.value][0]);}}>{Object.keys(BUILDING_DATA).map(b=><option key={b} value={b}>{b}</option>)}</select>
          <label style={{fontWeight:'600',fontSize:'13px',color:'#86868B'}}>객실</label><select className="input-field" value={selectedRoom} onChange={e=>setSelectedRoom(e.target.value)}>{BUILDING_DATA[selectedBuilding].map(r=><option key={r} value={r}>{r}</option>)}</select>
          <label style={{fontWeight:'600',fontSize:'13px',color:'#86868B'}}>플랫폼</label><select className="input-field" value={platform} onChange={e=>setPlatform(e.target.value)}><option value="Airbnb">Airbnb</option><option value="Booking">Booking.com</option></select>
          <button className="btn-primary" type="submit">저장하기</button>
        </form>
      </div>
    </div>
  );
}

function AddCancellation() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedBuilding, setSelectedBuilding] = useState("아라키초A");
  const [selectedRoom, setSelectedRoom] = useState(BUILDING_DATA["아라키초A"][0]);
  const handleSubmit = async (e) => {
    e.preventDefault(); if(!window.confirm("취소 처리 하시겠습니까?")) return;
    try { await addDoc(collection(db, "reservations"), { date, building: selectedBuilding, room: selectedRoom, status: "cancelled", createdAt: new Date() }); alert("취소 등록 완료"); } catch (error) { alert("오류"); }
  };
  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100%'}}>
      <div className="form-wrapper"><h2 style={{textAlign:'center',marginBottom:'30px',color:'#FF3B30'}}>취소 기록</h2>
        <form onSubmit={handleSubmit}>
          <label style={{fontWeight:'600',fontSize:'13px',color:'#86868B'}}>날짜</label><input className="input-field" type="date" value={date} onChange={e=>setDate(e.target.value)} />
          <label style={{fontWeight:'600',fontSize:'13px',color:'#86868B'}}>건물</label><select className="input-field" value={selectedBuilding} onChange={e=>{setSelectedBuilding(e.target.value);setSelectedRoom(BUILDING_DATA[e.target.value][0]);}}>{Object.keys(BUILDING_DATA).map(b=><option key={b} value={b}>{b}</option>)}</select>
          <label style={{fontWeight:'600',fontSize:'13px',color:'#86868B'}}>객실</label><select className="input-field" value={selectedRoom} onChange={e=>setSelectedRoom(e.target.value)}>{BUILDING_DATA[selectedBuilding].map(r=><option key={r} value={r}>{r}</option>)}</select>
          <button className="btn-primary btn-danger" type="submit">취소 등록</button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }); return () => unsubscribe(); }, []);
  if (loading) return <div style={{height:'100vh',display:'flex',justifyContent:'center',alignItems:'center'}}>로딩 중...</div>;
  if (!user) return <><style>{styles}</style><Login /></>;
  return (
    <>
      <style>{styles}</style>
      <Router>
        <div className="dashboard-layout"><Sidebar /><main className="main-content"><Routes><Route path="/" element={<StatsAnalysis />} /><Route path="/list" element={<ReservationList />} /><Route path="/add" element={<AddReservation />} /><Route path="/cancel" element={<AddCancellation />} /></Routes></main></div>
      </Router>
    </>
  );
}

export default App;