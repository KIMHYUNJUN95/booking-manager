import React, { useState } from 'react';
// 파이어베이스 및 데이터 관련 기능을 파일 내부에서 직접 정의하여 경로 오류 해결
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

// --- 1. 파이어베이스 설정 (경로 오류 방지를 위한 인라인 포함) ---
const firebaseConfig = {
  apiKey: "AIzaSyBHI6d4mDDBEIB77GVQj5Rz1EbMyPaCjgA",
  authDomain: "my-booking-app-3f0e7.firebaseapp.com",
  projectId: "my-booking-app-3f0e7",
  storageBucket: "my-booking-app-3f0e7.firebasestorage.app",
  messagingSenderId: "1008418095386",
  appId: "1:1008418095386:web:99eddb1ec872d0b1906ca3",
  measurementId: "G-KKNJ5P1KFD"
};

// 앱이 이미 초기화되었는지 확인 후 초기화 (중복 방지)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// --- 2. 건물 데이터 (경로 오류 방지를 위한 인라인 포함) ---
const BUILDING_DATA = {
  "아라키초A": [
    "201호", "202호", "301호", "302호", "401호", "402호",
    "501호", "502호", "602호", "701호", "702호"
  ],
  "아라키초B": [
    "101호", "102호", "201호", "202호", "301호", "302호", "401호", "402호"
  ],
  "다이쿄초": [
    "B01호", "B02호", "101호", "102호", "201호", "202호", "302호"
  ],
  "가부키초": [
    "202호", "203호", "302호", "303호", "402호", "403호",
    "502호", "603호", "802호", "803호"
  ],
  "다카다노바바": [
    "2층", "3층", "4층", "5층", "6층", "7층", "8층", "9층"
  ],
  "오쿠보": [
    "A동", "B동", "C동"
  ],
  "사노시": [
    "독채"
  ]
};

function StatsAnalysis() {
  const [targetMonth, setTargetMonth] = useState(new Date().toISOString().slice(0, 7)); // 이번달 기본값 (YYYY-MM)
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const calculateStats = async () => {
    setLoading(true);
    setStats(null);

    // 1. 선택한 달의 데이터 쿼리
    const q = query(
      collection(db, "reservations"),
      where("date", ">=", `${targetMonth}-01`),
      where("date", "<=", `${targetMonth}-31`)
    );

    try {
      const snapshot = await getDocs(q);
      const reservations = snapshot.docs.map(doc => doc.data());

      // 2. 데이터 집계 구조 만들기
      const report = {};
      Object.keys(BUILDING_DATA).forEach(b => {
        report[b] = { total: 0, rooms: {} };
        BUILDING_DATA[b].forEach(r => {
          report[b].rooms[r] = { total: 0, cancelled: 0 };
        });
      });

      // 3. 카운팅
      reservations.forEach(r => {
        const { building, room, status } = r;
        
        // 데이터 무결성 체크 (혹시 삭제된 객실 데이터가 있을 경우 무시)
        if (report[building] && report[building].rooms[room]) {
          report[building].total += 1; // 건물 전체 건수
          report[building].rooms[room].total += 1; // 객실 전체 건수 (취소 포함)
          
          if (status === 'cancelled') {
            report[building].rooms[room].cancelled += 1;
          }
        }
      });

      setStats(report);
    } catch (error) {
      console.error(error);
      alert("데이터를 불러오는데 실패했습니다.");
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>📊 월별 성과 분석</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="month" 
            value={targetMonth} 
            onChange={(e) => setTargetMonth(e.target.value)}
            style={{ padding: '8px', fontSize: '16px' }}
          />
          <button 
            onClick={calculateStats}
            style={{ padding: '8px 15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
          >
            조회하기
          </button>
        </div>
      </div>

      {loading && <p>데이터 분석 중...</p>}

      {!loading && stats && Object.keys(stats).map(building => (
        <div key={building} style={{ border: '1px solid #ddd', borderRadius: '10px', marginBottom: '30px', overflow: 'hidden' }}>
          <div style={{ backgroundColor: '#f1f1f1', padding: '10px 15px', fontWeight: 'bold', borderBottom: '1px solid #ddd' }}>
            🏢 {building} (총 {stats[building].total}건 접수)
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '14px' }}>
            <thead style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #eee' }}>
              <tr>
                <th style={{ padding: '10px' }}>객실</th>
                <th>총 접수</th>
                <th>예약 비중(%)</th>
                <th>취소</th>
                <th>취소율(%)</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(stats[building].rooms).map(room => {
                const data = stats[building].rooms[room];
                
                // 인기 비중: (이 방 예약수 / 건물 전체 예약수) * 100
                const share = stats[building].total === 0 ? 0 
                  : ((data.total / stats[building].total) * 100).toFixed(1);
                  
                // 취소율: (취소 건수 / 이 방 총 접수) * 100
                const cancelRate = data.total === 0 ? 0 
                  : ((data.cancelled / data.total) * 100).toFixed(1);

                // 스타일링 로직
                const isHighShare = Number(share) >= 15; // 비중 15% 이상이면 인기
                const isHighCancel = Number(cancelRate) >= 30; // 취소율 30% 이상이면 주의

                return (
                  <tr key={room} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}>{room}</td>
                    <td>{data.total}</td>
                    <td style={{ color: isHighShare ? '#d9534f' : 'black', fontWeight: isHighShare ? 'bold' : 'normal' }}>
                      {share}% {isHighShare && '🔥'}
                    </td>
                    <td>{data.cancelled}</td>
                    <td style={{ color: isHighCancel ? 'blue' : 'black' }}>
                      {cancelRate}% {isHighCancel && '⚠️'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export default StatsAnalysis;