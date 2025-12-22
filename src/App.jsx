import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { collection, getDocs, query, where, doc } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ★ 핵심: firebase.js 에서 db, auth 가져오기
import { db, auth } from './firebase';
import RevenueDashboard from './RevenueDashboard.jsx';
import CleaningDashboard from './components/CleaningDashboard.jsx';
import OccupancyRateDashboard from './components/OccupancyRateDashboard.jsx';
import TodaySummaryDashboard from './components/TodaySummaryDashboard.jsx';
import CountryOccupancyDashboard from './components/CountryOccupancyDashboard.jsx';
import AiChatbot from './components/AiChatbot';
import BuildingCalendar from './components/BuildingCalendar.jsx';

// ★★★ 서버 주소 ★★★
const GET_ARRIVALS_URL = "https://us-central1-my-booking-app-3f0e7.cloudfunctions.net/getTodayArrivals";
const SYNC_BEDS24_URL = "https://us-central1-my-booking-app-3f0e7.cloudfunctions.net/syncBeds24";
const SYNC_BEDS24_FULL_URL = "https://us-central1-my-booking-app-3f0e7.cloudfunctions.net/syncBeds24Full";

// --- [1] 디자인 (Apple Style CSS) ---
const styles = `
  * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "San Francisco", "Helvetica Neue", sans-serif; background-color: #F5F5F7; height: 100vh; overflow: hidden; }

  /* 애니메이션 */
  @keyframes slideUp {
    from {
      transform: translate(-50%, 20px);
      opacity: 0;
    }
    to {
      transform: translate(-50%, 0);
      opacity: 1;
    }
  }

  /* 로그인 */
  .login-container { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; display: flex; justify-content: center; align-items: center; background: #F5F5F7; z-index: 9999; }
  .login-card { background: white; width: 100%; max-width: 400px; padding: 40px; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); text-align: center; }
  .login-logo { font-size: 48px; margin-bottom: 20px; display: block; }
  .login-title { font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #1D1D1F; }
  .login-subtitle { font-size: 15px; color: #86868B; margin-bottom: 32px; }

  /* 레이아웃 */
  .dashboard-layout { display: flex; height: 100vh; width: 100vw; }
  .sidebar { width: 280px; background: rgba(255, 255, 255, 0.95); border-right: 1px solid rgba(0,0,0,0.05); padding: 24px; display: flex; flex-direction: column; justify-content: space-between; z-index: 10; }
  .logo-area { font-size: 20px; font-weight: 800; color: #1D1D1F; margin-bottom: 40px; padding-left: 10px; display: flex; align-items: center; gap: 10px; }
  .nav-menu { display: flex; flex-direction: column; gap: 8px; }
  .nav-item { text-decoration: none; padding: 12px 16px; border-radius: 12px; color: #86868B; font-weight: 600; font-size: 15px; transition: all 0.2s ease; display: flex; align-items: center; gap: 12px; cursor: pointer; }
  .nav-item:hover { background-color: rgba(0,0,0,0.03); color: #1D1D1F; }
  .nav-item.active { background-color: #0071E3; color: white; box-shadow: 0 4px 12px rgba(0, 113, 227, 0.3); }
  .nav-item.active-purple { background-color: #5856D6; color: white; box-shadow: 0 4px 12px rgba(88, 86, 214, 0.3); }
  .nav-item.active-red { background-color: #FF3B30; color: white; box-shadow: 0 4px 12px rgba(255, 59, 48, 0.3); }

  .logout-btn { margin-top: auto; background: none; border: none; padding: 12px 16px; color: #FF3B30; font-weight: 600; font-size: 15px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 12px; border-radius: 12px; }
  .logout-btn:hover { background-color: rgba(255, 59, 48, 0.1); }
  .sync-btn { width: 100%; padding: 10px; margin-bottom: 20px; background-color: #E5E5EA; border: none; border-radius: 10px; color: #1D1D1F; font-weight: 600; cursor: pointer; transition: 0.2s; }
  .sync-btn:hover { background-color: #D1D1D6; }

  .main-content { flex: 1; overflow-y: auto; padding: 40px; }
  .dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
  .page-title { font-size: 28px; font-weight: 700; }
`;
const moreStyles = `
  /* 테이블 */
  .table-card { background: white; border-radius: 16px; padding: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); margin-bottom: 20px; overflow-x: auto; }
  .table-full { width: 100%; border-collapse: collapse; }
  .table-full th { text-align: left; padding: 12px; background: #F2F2F7; font-size: 14px; color: #6E6E73; font-weight: 600; }
  .table-full td { padding: 12px; font-size: 14px; border-bottom: 1px solid #E5E5EA; }

  /* KPI Grid */
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
  .kpi-card { background: white; padding: 24px; border-radius: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); display: flex; flex-direction: column; justify-content: center; }
  .kpi-label { font-size: 14px; color: #86868B; font-weight: 600; margin-bottom: 8px; }
  .kpi-value { font-size: 32px; font-weight: 700; color: #1D1D1F; }
  .kpi-sub { font-size: 13px; margin-top: 6px; color: #86868B; }

  /* 입력폼 */
  .input-card { background: white; padding: 24px; border-radius: 20px; box-shadow: 0 10px 20px rgba(0,0,0,0.05); margin-bottom: 24px; }
  .form-wrapper { background: white; padding: 40px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); width: 100%; max-width: 500px; }
  .form-label, .input-label { font-size: 15px; font-weight: 600; margin-bottom: 6px; display: block; color: #1D1D1F; }
  .form-input, .form-select, .input-field { width: 100%; padding: 12px; border-radius: 12px; border: 1px solid #D1D1D6; font-size: 15px; margin-bottom: 16px; }
  .form-button, .btn-primary { width: 100%; padding: 14px; background-color: #0071E3; border-radius: 12px; border: none; color: white; font-size: 16px; font-weight: 600; cursor: pointer; transition: 0.2s; }
  .form-button:hover, .btn-primary:hover { background-color: #005BB5; }
  .btn-danger { background-color: #FF3B30; }
  .btn-danger:hover { background-color: #D70015; }
  .tag-success { color: white; background: #34C759; padding: 4px 10px; border-radius: 10px; font-size: 12px; }
  .tag-cancel { color: white; background: #FF3B30; padding: 4px 10px; border-radius: 10px; font-size: 12px; }
  .tag-good { color: white; background: #0071E3; padding: 4px 10px; border-radius: 10px; font-size: 12px; }
  .tag-pending { color: white; background: #FF9500; padding: 4px 10px; border-radius: 10px; font-size: 12px; }
  .switch-container { display: flex; background: #E5E5EA; padding: 4px; border-radius: 12px; gap: 4px; }
  .switch-btn { border: none; background: none; padding: 8px 16px; border-radius: 9px; font-weight: 600; font-size: 14px; color: #86868B; cursor: pointer; transition: 0.2s; }
  .switch-btn.active { background: white; color: #0071E3; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .switch-btn.active-red { background: white; color: #FF3B30; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }

  /* 차트 카드 */
  .chart-card { background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); margin-bottom: 30px; }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
  .chart-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #1D1D1F; }
  
  /* Modal */
  .modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.4); display: flex; justify-content: center; align-items: center; z-index: 1000; }
  .modal-content { background: white; padding: 24px; border-radius: 24px; width: 100%; max-width: 500px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #E5E5EA; padding-bottom: 10px; }
  .modal-title { font-size: 20px; font-weight: 700; }
  .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #86868B; }
  .modal-list-item { display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #F5F5F7; }
  .modal-date-label { font-size: 12px; color: #86868B; margin-bottom: 2px; }

  /* Recent List */
  .recent-box { flex: 0 0 300px; background: white; padding: 24px; border-radius: 24px; height: fit-content; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
  .recent-title { font-size: 16px; font-weight: 700; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .recent-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #F5F5F7; }
  .recent-info { display: flex; flex-direction: column; }
  .recent-main { font-weight: 600; font-size: 14px; }
  .recent-sub { font-size: 12px; color: #86868B; margin-top: 2px; }

  /* Platform Colors */
  .pf-text-airbnb { color: #FF5A5F; font-weight: 600; }
  .pf-text-booking { color: #003580; font-weight: 600; }
  .clickable-number { text-decoration: underline; cursor: pointer; }
  
  .btn-edit { background: #E5E5EA; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; margin-right: 6px; font-size: 12px; }
  .btn-delete { background: #FFE5E5; color: #FF3B30; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; }

  /* ========================================== */
  /* 모바일 반응형 CSS (768px 이하) - 대기업 수준 UI/UX */
  /* ========================================== */
  @media (max-width: 768px) {
    body {
      overflow: auto;
      height: auto;
      background-color: #F2F2F7;
    }

    /* 레이아웃 변경 */
    .dashboard-layout {
      flex-direction: column;
      height: auto;
      min-height: 100vh;
    }

    /* 사이드바 -> 하단 고정 네비게이션 (iOS 스타일) */
    .sidebar {
      width: 100%;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      top: auto !important;
      height: 82px !important;
      min-height: 82px !important;
      max-height: 82px !important;
      padding: 0 !important;
      padding-bottom: env(safe-area-inset-bottom) !important;
      border-right: none;
      border-top: 0.5px solid rgba(60,60,67,0.12);
      background: rgba(255,255,255,0.9);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      z-index: 1000;
      display: flex;
      flex-direction: row !important;
      justify-content: center !important;
      align-items: stretch !important;
      box-shadow: 0 -1px 0 0 rgba(0,0,0,0.05);
    }

    .logo-area { display: none !important; }
    .sync-btn { display: none !important; }
    .logout-btn { display: none !important; }

    .nav-menu {
      display: flex !important;
      flex-direction: row !important;
      justify-content: space-evenly !important;
      align-items: stretch !important;
      width: 100%;
      max-width: 500px;
      gap: 0;
      padding: 0;
      margin: 0 auto;
    }

    /* 모바일 하단 탭바 아이템 (iOS 스타일) */
    .nav-item {
      display: none !important;
    }

    .nav-item:nth-child(1),
    .nav-item:nth-child(3),
    .nav-item:nth-child(4),
    .nav-item:nth-child(8),
    .nav-item:nth-child(9) {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      padding-top: 4px !important;
      font-size: 10px !important;
      font-weight: 500 !important;
      gap: 4px !important;
      min-width: 0 !important;
      flex: 1 !important;
      text-align: center !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      color: #8E8E93 !important;
      transition: all 0.2s ease !important;
      letter-spacing: -0.2px !important;
    }

    .nav-item.active:nth-child(1),
    .nav-item.active:nth-child(3),
    .nav-item.active:nth-child(4),
    .nav-item.active:nth-child(8),
    .nav-item.active:nth-child(9) {
      background: transparent !important;
      color: #007AFF !important;
      box-shadow: none !important;
      font-weight: 600 !important;
    }

    .nav-item.active-purple {
      color: #5856D6 !important;
    }

    .nav-item.active-red {
      color: #FF3B30 !important;
    }

    .nav-item span:first-child {
      font-size: 24px !important;
      line-height: 1 !important;
      margin-bottom: 2px !important;
      filter: none !important;
    }

    /* 메인 콘텐츠 (상단 여백 추가, 하단 탭바 공간 확보) */
    .main-content {
      padding: 12px !important;
      padding-top: 16px !important;
      padding-bottom: 100px !important;
      width: 100%;
      margin-left: 0 !important;
      background: #F2F2F7 !important;
    }

    .dashboard-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;
      background: white;
      padding: 16px;
      margin-left: -12px;
      margin-right: -12px;
      margin-top: -16px;
      border-bottom: 0.5px solid rgba(60,60,67,0.12);
    }

    .page-title {
      font-size: 28px !important;
      font-weight: 700 !important;
      letter-spacing: -0.5px;
    }

    /* KPI 그리드 (2열 레이아웃, 카드 간격 개선) */
    .kpi-grid {
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }

    .kpi-card {
      padding: 16px !important;
      border-radius: 16px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04) !important;
      border: 0.5px solid rgba(0,0,0,0.04);
    }

    .kpi-value {
      font-size: 28px !important;
      font-weight: 700 !important;
      letter-spacing: -0.5px;
    }

    .kpi-label {
      font-size: 13px !important;
      font-weight: 500 !important;
      color: #8E8E93 !important;
    }

    .kpi-sub {
      font-size: 12px !important;
      color: #8E8E93 !important;
    }

    /* 차트 카드 (단일 열 레이아웃, 높이 증가) */
    .charts-grid {
      grid-template-columns: 1fr !important;
      gap: 12px !important;
    }

    .chart-card {
      padding: 16px !important;
      margin-bottom: 12px !important;
      border-radius: 16px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04) !important;
      border: 0.5px solid rgba(0,0,0,0.04);
    }

    .chart-title {
      font-size: 17px !important;
      font-weight: 600 !important;
      margin-bottom: 16px !important;
      color: #1D1D1F !important;
      letter-spacing: -0.3px;
    }

    /* Recharts 차트 크기 조정 */
    .recharts-wrapper {
      min-height: 280px !important;
    }

    .recharts-surface {
      overflow: visible !important;
    }

    /* 차트 텍스트 가독성 향상 */
    .recharts-text {
      font-size: 12px !important;
      font-weight: 500 !important;
      fill: #1D1D1F !important;
    }

    .recharts-label {
      font-size: 11px !important;
      font-weight: 600 !important;
    }

    /* 테이블 카드 */
    .table-card {
      padding: 16px !important;
      margin-bottom: 12px !important;
      border-radius: 16px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04) !important;
      border: 0.5px solid rgba(0,0,0,0.04);
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .table-full th {
      padding: 10px 8px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      color: #8E8E93 !important;
      background: #F2F2F7 !important;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .table-full td {
      padding: 12px 8px !important;
      font-size: 14px !important;
      color: #1D1D1F !important;
      border-bottom: 0.5px solid rgba(60,60,67,0.12) !important;
    }

    .table-full {
      min-width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }

    .text-left {
      text-align: left !important;
    }

    .text-right {
      text-align: right !important;
    }

    /* 모달 (iOS 스타일) */
    .modal-content {
      margin: 20px;
      max-width: calc(100vw - 40px);
      max-height: 80vh;
      overflow-y: auto;
      padding: 20px;
      border-radius: 20px !important;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3) !important;
    }

    .modal-title {
      font-size: 20px !important;
      font-weight: 700 !important;
      letter-spacing: -0.3px;
    }

    /* 로그인 */
    .login-card {
      margin: 20px;
      padding: 32px 24px;
      max-width: calc(100vw - 40px);
      border-radius: 20px !important;
    }

    .login-title {
      font-size: 28px !important;
      font-weight: 700 !important;
      letter-spacing: -0.5px;
    }

    /* 폼 */
    .form-wrapper {
      padding: 24px;
      max-width: 100%;
      border-radius: 20px !important;
    }

    .form-input, .form-select, .input-field {
      padding: 12px 16px !important;
      font-size: 16px !important;
      border-radius: 12px !important;
      border: 0.5px solid rgba(60,60,67,0.29) !important;
      background: #FFFFFF !important;
    }

    .form-input:focus, .form-select:focus, .input-field:focus {
      border-color: #007AFF !important;
      box-shadow: 0 0 0 4px rgba(0,122,255,0.1) !important;
    }

    .form-button, .btn-primary {
      padding: 16px !important;
      font-size: 17px !important;
      font-weight: 600 !important;
      border-radius: 12px !important;
      letter-spacing: -0.3px;
    }

    /* 스위치 버튼 */
    .switch-container {
      width: 100%;
      justify-content: center;
      padding: 3px;
      background: #E5E5EA;
      border-radius: 10px;
    }

    .switch-btn {
      padding: 10px 16px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      border-radius: 8px !important;
    }

    /* Recent Box 숨김 */
    .recent-box { display: none !important; }

    /* 건물 섹션 */
    .building-section {
      margin-bottom: 16px !important;
      background: white;
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      border: 0.5px solid rgba(0,0,0,0.04);
    }

    .building-title {
      font-size: 17px !important;
      font-weight: 600 !important;
      letter-spacing: -0.3px;
    }

    /* 태그 */
    .tag-good, .tag-pending, .tag-cancel, .tag-success {
      font-size: 11px !important;
      padding: 4px 8px !important;
      font-weight: 600 !important;
      border-radius: 6px !important;
    }
  }

  /* 아주 작은 화면 (480px 이하) */
  @media (max-width: 480px) {
    .sidebar { height: 65px !important; min-height: 65px !important; max-height: 65px !important; }

    .nav-item span:first-child { font-size: 20px !important; }
    .nav-item:nth-child(1),
    .nav-item:nth-child(3),
    .nav-item:nth-child(4),
    .nav-item:nth-child(8),
    .nav-item:nth-child(9) {
      font-size: 8px !important;
    }

    .main-content { padding: 12px; padding-bottom: 80px !important; }
    .page-title { font-size: 18px; }
    .kpi-value { font-size: 20px; }
    .kpi-grid { grid-template-columns: 1fr; }

    .dashboard-header > div {
      width: 100%;
      flex-wrap: wrap;
      gap: 8px;
    }

    .form-input, .form-select { width: 100% !important; }
  }
`;

// --- Inject both style blocks ---
const styleSheet = document.createElement("style");
styleSheet.innerText = styles + moreStyles;
document.head.appendChild(styleSheet);

// ==============================
// 건물·객실 데이터
// ==============================
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

// ==============================
// 로그인 컴포넌트
// ==============================
function LoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, pw);
    } catch (err) {
      setError("로그인 실패: " + err.message);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <span className="login-logo">🏨</span>
        <div className="login-title">HARU Dashboard</div>
        <div className="login-subtitle">로그인이 필요합니다</div>

        <input
          className="form-input"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="form-input"
          type="password"
          placeholder="비밀번호"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button className="form-button" onClick={login}>
          로그인
        </button>
      </div>
    </div>
  );
}

// ==============================
// Sidebar 컴포넌트
// ==============================
function Sidebar({ onSync }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const menu = [
    { path: "/", label: "오늘의 요약", icon: "📅" },
    { path: "/performance", label: "예약 접수 대시보드", icon: "📊" },
    { path: "/revenue", label: "매출 대시보드", icon: "💰" },
    { path: "/calendar", label: "객실 캘린더", icon: "🗓️" },
    { path: "/occupancy", label: "숙박 현황 (Stay)", icon: "🛏️" },
    { path: "/occupancy-rate", label: "객실 가동률", icon: "📈" },
    { path: "/country", label: "국가별 점유율", icon: "🌍" },
    { path: "/arrivals", label: "입실 / 퇴실 대시보드", icon: "🚪" },
    { path: "/cleaning", label: "청소 스케줄 관리", icon: "🧹" },
    { path: "/ai-assistant", label: "AI 브리핑", icon: "📡" },
  ];

  const logout = () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      signOut(auth);
    }
  };

  return (
    <div className="sidebar">
      <div>
        <div className="logo-area">
          <span>🏨</span> HARU Dashboard
        </div>

        <button className="sync-btn" onClick={() => onSync(false)}>
          🔄 빠른 동기화
        </button>
        <button className="sync-btn" onClick={() => onSync(true)} style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8 }}>
          📦 전체 동기화 (2023~)
        </button>

        <nav className="nav-menu">
          {menu.map((item) => (
            <div
              key={item.path}
              onClick={() => navigate(item.path)}
              className={
                "nav-item " + (currentPath === item.path ? "active" : "")
              }
            >
              <span>{item.icon}</span> {item.label}
            </div>
          ))}
        </nav>
      </div>

      <div>
        <button className="logout-btn" onClick={logout}>
          🔓 로그아웃
        </button>
      </div>
    </div>
  );
}

// ==============================
// 상세 모달
// ==============================
function DetailModal({ title, data, onClose }) {
  if (!data) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {data.length === 0 ? (
            <p style={{ textAlign: "center", color: "#999" }}>데이터 없음</p>
          ) : (
            data.map((item, idx) => (
              <div key={idx} className="modal-list-item">
                <div>
                  <div className="modal-date-label">숙박 예정 월</div>
                  <div style={{ fontWeight: "bold", color: "#5856D6" }}>{item.stayMonth}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="modal-date-label">접수일</div>
                  <div>{item.bookDate || item.date}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ==============================
// 고객 상세 정보 모달
// ==============================
function GuestDetailModal({ guest, onClose }) {
  if (!guest) return null;

  const formatPrice = (price) => {
    if (!price) return "¥0";
    const num = parseFloat(String(price).replace(/[^0-9.-]+/g,""));
    if (isNaN(num)) return "¥0";
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(num);
  };

  const InfoRow = ({ label, value, icon }) => (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "14px 0",
      borderBottom: "1px solid #F2F2F7"
    }}>
      <span style={{ color: "#86868B", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span>{icon}</span> {label}
      </span>
      <span style={{ fontWeight: "600", fontSize: "14px", color: value ? "#1D1D1F" : "#CCC", maxWidth: "60%", textAlign: "right", wordBreak: "break-word" }}>
        {value || "정보 없음"}
      </span>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
        <div className="modal-header" style={{ borderBottom: "none", paddingBottom: "0" }}>
          <div>
            <div className="modal-title" style={{ fontSize: "22px" }}>고객 상세 정보</div>
            <div style={{ fontSize: "13px", color: "#86868B", marginTop: "4px" }}>{guest.building} {guest.room}</div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* 고객 기본 정보 카드 */}
        <div style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          borderRadius: "16px",
          padding: "20px",
          marginBottom: "20px",
          color: "white"
        }}>
          <div style={{ fontSize: "20px", fontWeight: "700", marginBottom: "8px" }}>
            {guest.guestName || "(이름 없음)"}
          </div>
          <div style={{ display: "flex", gap: "16px", fontSize: "13px", opacity: "0.9" }}>
            <span>성인 {guest.numAdult || 0}명</span>
            <span>아동 {guest.numChild || 0}명</span>
            <span>{guest.platform}</span>
          </div>
        </div>

        {/* 상세 정보 */}
        <div style={{ maxHeight: "350px", overflowY: "auto" }}>
          <InfoRow icon="📧" label="이메일" value={guest.guestEmail} />
          <InfoRow icon="📞" label="전화번호" value={guest.guestPhone} />
          <InfoRow icon="🌍" label="국가" value={guest.guestCountry} />
          <InfoRow icon="🏠" label="주소" value={guest.guestAddress ? `${guest.guestAddress}${guest.guestCity ? `, ${guest.guestCity}` : ""}` : ""} />
          <InfoRow icon="🕐" label="도착 예정 시간" value={guest.arrivalTime} />
          <InfoRow icon="📅" label="체크인" value={guest.arrival} />
          <InfoRow icon="📅" label="체크아웃" value={guest.departure} />
          <InfoRow icon="🌙" label="숙박일수" value={guest.nights ? `${guest.nights}박` : ""} />
          <InfoRow icon="💰" label="총 금액" value={formatPrice(guest.totalPrice || guest.price)} />

          {/* 고객 코멘트 */}
          <div style={{ marginTop: "16px" }}>
            <div style={{ color: "#86868B", fontSize: "14px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>💬</span> 고객 코멘트 / 메모
            </div>
            <div style={{
              background: "#F9F9F9",
              padding: "14px",
              borderRadius: "12px",
              fontSize: "14px",
              color: guest.guestComments ? "#1D1D1F" : "#CCC",
              minHeight: "60px",
              lineHeight: "1.5"
            }}>
              {guest.guestComments || "코멘트 없음"}
            </div>
          </div>
        </div>

        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "14px",
            marginTop: "20px",
            background: "#0071E3",
            color: "white",
            border: "none",
            borderRadius: "12px",
            fontSize: "16px",
            fontWeight: "600",
            cursor: "pointer"
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}

// ==============================
// 📊 Performance Dashboard (예약 접수 실적)
// ==============================
function PerformanceDashboard({ targetMonth, setTargetMonth }) {
  const [viewMode, setViewMode] = useState("confirmed"); 
  const [data, setData] = useState({ total: 0, buildings: [], platforms: [], roomStats: {}, okuboTotal: 0 });
  const [modalData, setModalData] = useState(null);
  const [modalTitle, setModalTitle] = useState("");

  const fetchData = async () => {
    console.log(`📊 Fetching Dashboard: ${targetMonth}, ${viewMode}`);

    // status 값은 "confirmed" 또는 "cancelled" (텍스트)
    const targetStatus = viewMode === "confirmed" ? "confirmed" : "cancelled";

    // Firestore 쿼리 최적화: status로 먼저 필터링
    const q = query(
      collection(db, "reservations"),
      where("status", "==", targetStatus)
    );

    const snapshot = await getDocs(q);
    console.log(`📦 Total ${targetStatus} reservations in Firestore: ${snapshot.docs.length}`);

    // 클라이언트에서 날짜 필터링
    const allReservations = snapshot.docs
      .map((doc) => doc.data())
      .filter((r) => {
        // 날짜 필터링: bookDate가 우선 (Firestore에 저장된 실제 필드명)
        const bookTime = r.bookDate || r.firstNight || '';

        // 해당 월에 속하는지 확인 (YYYY-MM 형식)
        if (bookTime && typeof bookTime === 'string') {
          return bookTime.startsWith(targetMonth);
        }
        return false;
      });

    console.log(`📅 ${targetMonth}월 필터링 결과: ${allReservations.length}건`);

    // Deduplicate by bookId (same reservation across multiple accounts)
    const uniqueReservations = new Map();
    allReservations.forEach((r) => {
      const key = r.bookId || r.refNum || `${r.guestName}_${r.firstNight}`;
      if (!uniqueReservations.has(key)) {
        uniqueReservations.set(key, r);
      }
    });
    const reservations = Array.from(uniqueReservations.values());

    console.log(`✅ 중복 제거 후 최종: ${reservations.length}건 (중복 ${allReservations.length - reservations.length}건 제거)`);

    let total = 0;
    const bCount = {};
    const pCount = { Airbnb: 0, Booking: 0 };
    const rStats = {};

    Object.keys(BUILDING_DATA).forEach((b) => {
      rStats[b] = {};
      BUILDING_DATA[b].forEach((r) => {
        rStats[b][r] = { total: 0, airbnb: 0, booking: 0, airbnbList: [], bookingList: [] };
      });
    });

    reservations.forEach((r) => {
      if (!rStats[r.building]) rStats[r.building] = {};
      if (!rStats[r.building][r.room])
        rStats[r.building][r.room] = { total: 0, airbnb: 0, booking: 0, airbnbList: [], bookingList: [] };

      total++;
      bCount[r.building] = (bCount[r.building] || 0) + 1;

      const platformName = r.platform ? r.platform.toLowerCase() : "";
      if (platformName.includes("booking")) {
         pCount.Booking++;
      } else {
         pCount.Airbnb++;
      }

      rStats[r.building][r.room].total++;

      if (platformName.includes("booking")) {
        rStats[r.building][r.room].booking++;
        rStats[r.building][r.room].bookingList.push(r);
      } else {
        rStats[r.building][r.room].airbnb++;
        rStats[r.building][r.room].airbnbList.push(r);
      }
    });

    const okuboTotal = (bCount["오쿠보A동"] || 0) + (bCount["오쿠보B동"] || 0) + (bCount["오쿠보C동"] || 0);

    const buildingChartData = Object.keys(bCount)
      .map((key) => ({ name: key, count: bCount[key] }))
      .sort((a, b) => b.count - a.count);

    const platformChartData = [
      { name: "Airbnb", value: pCount.Airbnb },
      { name: "Booking", value: pCount.Booking }
    ];

    setData({ total, buildings: buildingChartData, platforms: platformChartData, roomStats: rStats, okuboTotal });
  };

  useEffect(() => {
    fetchData();
  }, [targetMonth, viewMode]);

  const handleNumberClick = (title, list) => {
    if (list && list.length > 0) {
      setModalTitle(title);
      setModalData(list);
    }
  };

  const THEME_COLOR = viewMode === "confirmed" ? "#0071E3" : "#FF3B30";
  const PIE_COLORS = ["#FF5A5F", "#003580"];

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <h2 className="page-title" style={{ color: THEME_COLOR }}>
            {viewMode === "confirmed" ? "예약 접수 실적" : "취소 발생 실적"}
          </h2>
          <div className="switch-container">
            <button className={`switch-btn ${viewMode === "confirmed" ? "active" : ""}`} onClick={() => setViewMode("confirmed")}>예약 보기</button>
            <button className={`switch-btn ${viewMode === "cancelled" ? "active-red" : ""}`} onClick={() => setViewMode("cancelled")}>취소 보기</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#86868B" }}>조회할 접수 월:</span>
          <input type="month" className="form-select" style={{width: "auto", marginBottom: 0}} value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
        </div>
      </div>

      {modalData && <DetailModal title={modalTitle} data={modalData} onClose={() => setModalData(null)} />}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">총 {viewMode === "confirmed" ? "예약" : "취소"} 건수</div>
          <div className="kpi-value" style={{ color: THEME_COLOR }}>{data.total}건</div>
          <div className="kpi-sub trend-up">{viewMode === "confirmed" ? "순수 예약" : "발생 취소"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Airbnb</div>
          <div className="kpi-value" style={{ color: "#FF5A5F" }}>{data.platforms[0]?.value}건</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Booking</div>
          <div className="kpi-value" style={{ color: "#003580" }}>{data.platforms[1]?.value}건</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">🏢 건물별 {viewMode === "confirmed" ? "접수" : "취소"}량</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.buildings} margin={{ bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#86868B", fontSize: 11 }}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#86868B", fontSize: 12 }} />
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.05)" }} />
              <Bar dataKey="count" fill={THEME_COLOR} radius={[6, 6, 0, 0]} barSize={35} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title">⚖️ 플랫폼 점유율</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.platforms} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                {data.platforms.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: "15px", marginTop: "10px", fontSize: "13px", color: "#666" }}>
            <span style={{ color: "#FF5A5F" }}>● Airbnb</span>
            <span style={{ color: "#003580" }}>● Booking</span>
          </div>
        </div>
      </div>

      {Object.keys(data.roomStats).map((building) => {
        const buildingTotal = Object.values(data.roomStats[building]).reduce((sum, r) => sum + r.total, 0);
        if (buildingTotal === 0) return null;
        let shareDenominator = buildingTotal;
        let shareLabel = "건물내 비중";
        if (building.startsWith("오쿠보")) { shareDenominator = data.okuboTotal; shareLabel = "오쿠보 전체 비중"; }
        else if (building === "사노시") { shareDenominator = data.total; shareLabel = "전체 비중"; }

        return (
          <div key={building} className="building-section">
            <div className="building-title" style={{fontSize:'18px', fontWeight:'700', marginBottom:'10px'}}>
              🏢 {building}
              <span style={{ fontSize: "14px", fontWeight: "normal", color: "#86868B", marginLeft: "8px" }}>
                ({viewMode === "confirmed" ? "예약" : "취소"} {buildingTotal}건)
              </span>
            </div>
            <div className="table-card">
              <table className="table-full">
                <thead>
                  <tr>
                    <th className="text-left" style={{ width: "30%" }}>객실명</th>
                    <th>Airbnb</th>
                    <th>Booking</th>
                    <th>합계</th>
                    <th>{shareLabel}(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(data.roomStats[building]).sort((a, b) => data.roomStats[building][b].total - data.roomStats[building][a].total).map((room) => {
                    const rData = data.roomStats[building][room];
                    const share = shareDenominator === 0 ? 0 : ((rData.total / shareDenominator) * 100).toFixed(1);
                    return (
                      <tr key={room}>
                        <td className="text-left" style={{ fontWeight: "600" }}>{room}</td>
                        <td><span className={rData.airbnb > 0 ? "pf-text-airbnb clickable-number" : "pf-text-airbnb"} onClick={() => handleNumberClick(`${building} ${room} - Airbnb`, rData.airbnbList)}>{rData.airbnb}</span></td>
                        <td><span className={rData.booking > 0 ? "pf-text-booking clickable-number" : "pf-text-booking"} onClick={() => handleNumberClick(`${building} ${room} - Booking`, rData.bookingList)}>{rData.booking}</span></td>
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

// ==============================
// 🛏️ Occupancy Dashboard (숙박 현황)
// ==============================
function OccupancyDashboard({ targetMonth, setTargetMonth }) {
  const [data, setData] = useState({ total: 0, buildings: [], platforms: [], roomStats: {}, okuboTotal: 0 });

  const fetchData = async () => {
    // 숙박 현황은 'stayMonth' 기준
    const q = query(collection(db, "reservations"), where("stayMonth", "==", targetMonth), where("status", "==", "confirmed"));
    const snapshot = await getDocs(q);
    const reservations = snapshot.docs.map((doc) => doc.data());

    let total = 0;
    const rStats = {};
    const bCount = {};

    Object.keys(BUILDING_DATA).forEach((b) => {
      rStats[b] = {};
      BUILDING_DATA[b].forEach((r) => { rStats[b][r] = { total: 0, airbnb: 0, booking: 0 }; });
    });

    reservations.forEach((r) => {
      if (!rStats[r.building]) rStats[r.building] = {};
      if (!rStats[r.building][r.room]) rStats[r.building][r.room] = { total: 0, airbnb: 0, booking: 0 };

      if (rStats[r.building] && rStats[r.building][r.room]) {
        total++;
        bCount[r.building] = (bCount[r.building] || 0) + 1;
        rStats[r.building][r.room].total++;
        
        const platformName = r.platform ? r.platform.toLowerCase() : "";
        if (platformName.includes("booking")) {
          rStats[r.building][r.room].booking++;
        } else {
          rStats[r.building][r.room].airbnb++;
        }
      }
    });

    const okuboTotal = (bCount["오쿠보A동"] || 0) + (bCount["오쿠보B동"] || 0) + (bCount["오쿠보C동"] || 0);
    setData({ total, buildings: [], platforms: [], roomStats: rStats, okuboTotal });
  };

  useEffect(() => {
    fetchData();
  }, [targetMonth]);

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title" style={{ color: "#5856D6" }}>🛏️ 숙박 현황 (Stay Month)</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#86868B" }}>조회할 숙박 월:</span>
          <input type="month" className="form-select" style={{width: "auto", marginBottom: 0}} value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">해당 월 총 숙박</div>
          <div className="kpi-value" style={{ color: "#5856D6" }}>{data.total}건</div>
          <div className="kpi-sub">미래 예약 확인용</div>
        </div>
      </div>

      {Object.keys(data.roomStats).map((building) => {
        const buildingTotal = Object.values(data.roomStats[building]).reduce((sum, r) => sum + r.total, 0);
        if (buildingTotal === 0) return null;
        let shareDenominator = buildingTotal;
        let shareLabel = "건물내 비중";
        if (building.startsWith("오쿠보")) { shareDenominator = data.okuboTotal; shareLabel = "오쿠보 비중"; }
        else if (building === "사노시") { shareDenominator = data.total; shareLabel = "전체 비중"; }

        return (
          <div key={building} className="building-section">
            <div className="building-title" style={{fontSize:'18px', fontWeight:'700', marginBottom:'10px'}}>
              🏢 {building}
              <span style={{ fontSize: "14px", fontWeight: "normal", color: "#86868B", marginLeft: "8px" }}>(숙박 {buildingTotal}건)</span>
            </div>
            <div className="table-card">
              <table className="table-full">
                <thead>
                  <tr>
                    <th className="text-left" style={{ width: "30%" }}>객실명</th>
                    <th>Airbnb</th>
                    <th>Booking</th>
                    <th>합계</th>
                    <th>{shareLabel}(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(data.roomStats[building]).sort((a, b) => data.roomStats[building][b].total - data.roomStats[building][a].total).map((room) => {
                    const rData = data.roomStats[building][room];
                    const share = shareDenominator === 0 ? 0 : ((rData.total / shareDenominator) * 100).toFixed(1);
                    return (
                      <tr key={room}>
                        <td className="text-left" style={{ fontWeight: "600" }}>{room}</td>
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

// ==============================
// 🚪 ArrivalsDashboard (입/퇴실 대시보드)
// ==============================
// 건물 정렬 순서 정의
const BUILDING_ORDER = [
  "아라키초A", "아라키초B", "다이쿄초", "가부키초",
  "다카다노바바", "오쿠보A동", "오쿠보B동", "오쿠보C동"
];

// 건물 순서대로 정렬하는 함수
const sortByBuildingOrder = (list) => {
  return [...list].sort((a, b) => {
    const indexA = BUILDING_ORDER.indexOf(a.building);
    const indexB = BUILDING_ORDER.indexOf(b.building);
    // 목록에 없는 건물은 맨 뒤로
    const orderA = indexA === -1 ? 999 : indexA;
    const orderB = indexB === -1 ? 999 : indexB;
    return orderA - orderB;
  });
};

function ArrivalsDashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [guestList, setGuestList] = useState([]);
  const [error, setError] = useState("");
  const [selectedGuest, setSelectedGuest] = useState(null);  // 선택된 고객 (모달용)
  const [searchQuery, setSearchQuery] = useState("");  // 고객 이름 검색
  const [searchResults, setSearchResults] = useState([]);  // 검색 결과
  const [showSearchResults, setShowSearchResults] = useState(false);

  const formatPrice = (price) => {
    if (!price) return "¥0";
    const num = parseFloat(String(price).replace(/[^0-9.-]+/g,""));
    if (isNaN(num)) return "¥0";
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(num);
  };

  const getPlatformClass = (platformName) => {
    if (!platformName) return "pf-text-airbnb";
    const name = platformName.toLowerCase();
    if (name.includes("booking")) return "pf-text-booking";
    return "pf-text-airbnb";
  };

  const fetchTodayArrivals = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(GET_ARRIVALS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate })
      });
      const result = await response.json();
      
      console.log("Beds24 Raw Data:", result.data);

      if (result.success && Array.isArray(result.data)) {
        setGuestList(result.data);
      } else {
        setGuestList([]);
      }
    } catch (err) {
      console.error(err);
      setError("데이터 통신 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayArrivals();
  }, [selectedDate]);

  // 고객 이름 검색 함수 (1글자부터 자동 검색)
  const searchGuests = async (queryText) => {
    if (!queryText || queryText.trim().length < 1) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      // Firestore에서 모든 confirmed 예약을 가져와서 클라이언트에서 검색
      const q = query(
        collection(db, "reservations"),
        where("status", "==", "confirmed")
      );
      const snapshot = await getDocs(q);
      const allGuests = snapshot.docs.map(doc => doc.data());

      // 이름으로 필터링 (대소문자 무시)
      const searchLower = queryText.toLowerCase();
      const filtered = allGuests.filter(g =>
        g.guestName && g.guestName.toLowerCase().includes(searchLower)
      );

      // 도착일 기준 정렬 (최근 것 먼저)
      filtered.sort((a, b) => {
        if (!a.arrival) return 1;
        if (!b.arrival) return -1;
        return b.arrival.localeCompare(a.arrival);
      });

      setSearchResults(filtered.slice(0, 20)); // 최대 20개
      setShowSearchResults(true);
    } catch (err) {
      console.error("검색 오류:", err);
      setSearchResults([]);
    }
  };

  // 검색어 변경 시 디바운스 적용
  useEffect(() => {
    const timer = setTimeout(() => {
      searchGuests(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 선택한 날짜의 입실/퇴실 필터링 후 건물 순서대로 정렬
  const todayArrivals = sortByBuildingOrder(guestList.filter(guest => guest.arrival === selectedDate));
  const todayDepartures = sortByBuildingOrder(guestList.filter(guest => guest.departure === selectedDate));

  return (
    <div className="dashboard-content">
      {/* 고객 상세 모달 */}
      {selectedGuest && (
        <GuestDetailModal
          guest={selectedGuest}
          onClose={() => setSelectedGuest(null)}
        />
      )}

      <div className="dashboard-header">
        <h2 className="page-title">🚪 입/퇴실 관리</h2>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {/* 고객 검색 */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              className="form-input"
              placeholder="🔍 고객 이름 검색..."
              style={{ marginBottom: 0, width: "200px" }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setShowSearchResults(true)}
              onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
            />
            {/* 검색 결과 드롭다운 */}
            {showSearchResults && searchResults.length > 0 && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "white",
                borderRadius: "12px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                zIndex: 1000,
                maxHeight: "300px",
                overflowY: "auto",
                marginTop: "4px"
              }}>
                {searchResults.map((guest, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedGuest(guest);
                      setShowSearchResults(false);
                      setSearchQuery("");
                    }}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #F2F2F7",
                      cursor: "pointer",
                      transition: "background 0.2s"
                    }}
                    onMouseEnter={(e) => e.target.style.background = "#F5F5F7"}
                    onMouseLeave={(e) => e.target.style.background = "white"}
                  >
                    <div style={{ fontWeight: "600", fontSize: "14px" }}>{guest.guestName}</div>
                    <div style={{ fontSize: "12px", color: "#86868B" }}>
                      {guest.building} {guest.room} | {guest.arrival} ~ {guest.departure}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showSearchResults && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "white",
                borderRadius: "12px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                zIndex: 1000,
                padding: "20px",
                textAlign: "center",
                color: "#86868B",
                marginTop: "4px"
              }}>
                검색 결과가 없습니다
              </div>
            )}
          </div>
          <input type="date" className="form-input" style={{ marginBottom: 0, width: "160px", fontWeight: "bold" }} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          <button className="btn-primary" style={{ width: "auto", padding: "10px 20px" }} onClick={fetchTodayArrivals}>🔄 새로고침</button>
        </div>
      </div>

      {error && <div style={{ padding: "20px", background: "#FFE5E5", color: "#FF3B30", borderRadius: "12px", marginBottom: "20px" }}>🚨 {error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px", color: "#888" }}>데이터를 불러오는 중입니다...<br/><span style={{fontSize: '12px'}}>(Beds24 서버 상태에 따라 시간이 걸릴 수 있습니다)</span></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          
          {/* 입실 (Check-in) */}
          <div className="table-card" style={{ borderTop: "5px solid #0071E3" }}>
            <h3 style={{ margin: "0 0 15px 0", color: "#0071E3", display: "flex", alignItems: "center", gap: "8px" }}>
              📥 입실 예정 (Check-in) <span style={{ background: "#E8F2FF", padding: "4px 8px", borderRadius: "10px", fontSize: "14px" }}>{todayArrivals.length}건</span>
            </h3>
            {todayArrivals.length === 0 ? (
              <p style={{ textAlign: "center", color: "#aaa", padding: "20px" }}>{selectedDate} 입실 예정자가 없습니다.</p>
            ) : (
              <table className="table-full">
                <thead><tr><th>객실</th><th>게스트 이름</th><th>인원</th><th>플랫폼</th><th>숙박 기간</th><th>총 금액</th><th>상태</th></tr></thead>
                <tbody>
                  {todayArrivals.map((g, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: "bold" }}>{g.building} {g.room}</td>
                      <td>
                        <span
                          onClick={() => setSelectedGuest(g)}
                          style={{
                            cursor: "pointer",
                            color: "#0071E3",
                            textDecoration: "underline",
                            fontWeight: "500"
                          }}
                        >
                          {g.guestName || <span style={{color:'#ccc'}}>(이름없음)</span>}
                        </span>
                      </td>
                      <td style={{ fontSize: "13px" }}>성인 {g.numAdult || 0}, 아동 {g.numChild || 0}</td>
                      <td><span className={getPlatformClass(g.platform)}>{g.platform || "Unknown"}</span></td>
                      <td style={{ fontSize: "13px", color: "#666" }}>{g.arrival} ~ {g.departure}</td>
                      <td style={{ fontWeight: "bold" }}>{formatPrice(g.totalPrice || g.price)}</td>
                      <td><span className="tag-good">입실예정</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 퇴실 (Check-out) */}
          <div className="table-card" style={{ borderTop: "5px solid #FF3B30" }}>
            <h3 style={{ margin: "0 0 15px 0", color: "#FF3B30", display: "flex", alignItems: "center", gap: "8px" }}>
              📤 퇴실 예정 (Check-out) <span style={{ background: "#FFE5E5", padding: "4px 8px", borderRadius: "10px", fontSize: "14px" }}>{todayDepartures.length}건</span>
            </h3>
            {todayDepartures.length === 0 ? (
              <p style={{ textAlign: "center", color: "#aaa", padding: "20px" }}>{selectedDate} 퇴실 예정자가 없습니다.</p>
            ) : (
              <table className="table-full">
                <thead><tr><th>객실</th><th>게스트 이름</th><th>인원</th><th>체크인 날짜</th><th>플랫폼</th><th>총 금액</th><th>상태</th></tr></thead>
                <tbody>
                  {todayDepartures.map((g, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: "bold" }}>{g.building} {g.room}</td>
                      <td>
                        <span
                          onClick={() => setSelectedGuest(g)}
                          style={{
                            cursor: "pointer",
                            color: "#0071E3",
                            textDecoration: "underline",
                            fontWeight: "500"
                          }}
                        >
                          {g.guestName || <span style={{color:'#ccc'}}>(이름없음)</span>}
                        </span>
                      </td>
                      <td style={{ fontSize: "13px" }}>성인 {g.numAdult || 0}, 아동 {g.numChild || 0}</td>
                      <td style={{ color: "#0071E3", fontWeight: "600" }}>{g.arrival} (입실일)</td>
                      <td><span className={getPlatformClass(g.platform)}>{g.platform || "Unknown"}</span></td>
                      <td>{formatPrice(g.totalPrice || g.price)}</td>
                      <td><span className="tag-pending">퇴실대기</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// ==============================
// PWA 설치 프롬프트 컴포넌트
// ==============================
function InstallPrompt({ onClose }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 이미 설치된 경우 또는 이미 거절한 경우 표시하지 않음
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (dismissed || isStandalone) {
      onClose();
      return;
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS Safari 등 beforeinstallprompt를 지원하지 않는 브라우저에서도 표시
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS && !isStandalone) {
      setShowPrompt(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [onClose]);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
        onClose();
      }
      setDeferredPrompt(null);
    } else {
      // iOS Safari의 경우 안내 메시지 표시
      alert('iOS에서 설치하려면:\n\n1. 하단의 공유 버튼 (📤)을 탭하세요\n2. "홈 화면에 추가"를 선택하세요');
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', 'true');
    setShowPrompt(false);
    onClose();
  };

  if (!showPrompt) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '100px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '16px 24px',
      borderRadius: '16px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      maxWidth: '90vw',
      animation: 'slideUp 0.3s ease-out'
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(100px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
      <span style={{ fontSize: '32px' }}>🏨</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '4px' }}>
          HARU Dashboard 설치
        </div>
        <div style={{ fontSize: '13px', opacity: 0.9 }}>
          앱처럼 바로 접속할 수 있습니다
        </div>
      </div>
      <button
        onClick={handleInstall}
        style={{
          background: 'white',
          color: '#667eea',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '10px',
          fontWeight: '700',
          fontSize: '14px',
          cursor: 'pointer',
          whiteSpace: 'nowrap'
        }}
      >
        설치하기
      </button>
      <button
        onClick={handleDismiss}
        style={{
          background: 'transparent',
          color: 'white',
          border: 'none',
          fontSize: '20px',
          cursor: 'pointer',
          padding: '4px',
          opacity: 0.7
        }}
      >
        ×
      </button>
    </div>
  );
}

// ==============================
// 📱 PWA 설치 배너
// ==============================
function PWAInstallBanner({ onInstall, onDismiss }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10000,
      backgroundColor: '#0071E3',
      color: 'white',
      padding: '16px 24px',
      borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0, 113, 227, 0.4)',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      maxWidth: '90%',
      animation: 'slideUp 0.3s ease-out'
    }}>
      <div style={{ fontSize: '32px' }}>📱</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: '600', fontSize: '15px', marginBottom: '4px' }}>
          홈 화면에 추가하기
        </div>
        <div style={{ fontSize: '13px', opacity: 0.9 }}>
          앱처럼 빠르고 편리하게 사용하세요
        </div>
      </div>
      <button
        onClick={onInstall}
        style={{
          backgroundColor: 'white',
          color: '#0071E3',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '10px',
          fontWeight: '600',
          fontSize: '14px',
          cursor: 'pointer',
          whiteSpace: 'nowrap'
        }}
      >
        설치
      </button>
      <button
        onClick={onDismiss}
        style={{
          backgroundColor: 'transparent',
          color: 'white',
          border: 'none',
          fontSize: '24px',
          cursor: 'pointer',
          padding: '4px',
          opacity: 0.7,
          lineHeight: 1
        }}
      >
        ×
      </button>
    </div>
  );
}

// ==============================
// 🌐 App — 루트 컴포넌트
// ==============================
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [globalMonth, setGlobalMonth] = useState(new Date().toISOString().slice(0, 7));
  const [syncing, setSyncing] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPWABanner, setShowPWABanner] = useState(false);

  const handleSync = async (fullSync = false) => {
    const syncUrl = fullSync ? SYNC_BEDS24_FULL_URL : SYNC_BEDS24_URL;
    const syncType = fullSync ? "전체" : "빠른";
    const timeEstimate = fullSync ? "1~2분" : "5~10초";

    if (!window.confirm(`${syncType} 동기화를 실행하시겠습니까?\n\n` +
      (fullSync
        ? "• 전체 동기화: 2023년 1월부터 모든 예약 (느림)\n"
        : "• 빠른 동기화: 오늘 ~ 향후 5개월 (빠름)\n") +
      `• 예상 소요시간: ${timeEstimate}`)) return;

    setSyncing(true);
    try {
      const response = await fetch(syncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const result = await response.json();
      if (result.success) {
        alert(result.message || "동기화 완료!");
        window.location.reload();
      } else {
        alert("연동 실패: " + result.error + "\n\n디버그 로그:\n" + (result.details || []).join("\n"));
      }
    } catch (error) {
      console.error(error);
      alert("통신 오류: 함수 URL 혹은 네트워크 연결 확인 필요");
    }
    setSyncing(false);
  };

  // PWA 설치 핸들러
  const handlePWAInstall = async () => {
    if (!deferredPrompt) return;

    // 설치 프롬프트 표시
    deferredPrompt.prompt();

    // 사용자의 선택 대기
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA 설치 결과: ${outcome}`);

    // 이벤트 초기화
    setDeferredPrompt(null);
    setShowPWABanner(false);
  };

  // PWA 배너 닫기 핸들러
  const handlePWADismiss = () => {
    setShowPWABanner(false);
    // 7일 동안 다시 표시하지 않음
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
  };

  // PWA 설치 프롬프트 핸들러
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // 브라우저 기본 설치 배너 막기
      e.preventDefault();
      // 나중에 사용하기 위해 이벤트 저장
      setDeferredPrompt(e);

      // 로컬스토리지에서 이전에 닫았는지 확인
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      const dismissedDate = dismissed ? new Date(dismissed) : null;
      const now = new Date();

      // 7일이 지났거나 처음이면 배너 표시
      if (!dismissedDate || (now - dismissedDate) > 7 * 24 * 60 * 60 * 1000) {
        setShowPWABanner(true);
      }
    };

    // 이미 설치되어 있는지 확인
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone
      || document.referrer.includes('android-app://');

    if (!isStandalone) {
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>로딩 중...</div>;
  if (!user) return <><style>{styles}</style><LoginPage /></>;

  return (
    <>
      <style>{styles}</style>
      {/* PWA 설치 프롬프트 */}
      {showInstallPrompt && (
        <InstallPrompt onClose={() => setShowInstallPrompt(false)} />
      )}
      {/* PWA 설치 배너 */}
      {showPWABanner && (
        <PWAInstallBanner onInstall={handlePWAInstall} onDismiss={handlePWADismiss} />
      )}
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="dashboard-layout">
          <Sidebar onSync={handleSync} />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<TodaySummaryDashboard />} />
              <Route path="/ai-assistant" element={<AiChatbot />} />
              <Route path="/performance" element={<PerformanceDashboard targetMonth={globalMonth} setTargetMonth={setGlobalMonth} />} />
              <Route path="/revenue" element={<RevenueDashboard />} />
              <Route path="/calendar" element={<BuildingCalendar />} />
              <Route path="/occupancy" element={<OccupancyDashboard targetMonth={globalMonth} setTargetMonth={setGlobalMonth} />} />
              <Route path="/occupancy-rate" element={<OccupancyRateDashboard />} />
              <Route path="/country" element={<CountryOccupancyDashboard />} />
              <Route path="/arrivals" element={<ArrivalsDashboard />} />
              <Route path="/cleaning" element={<CleaningDashboard />} />
            </Routes>
          </main>
        </div>
      </Router>
    </>
  );
}

export default App;