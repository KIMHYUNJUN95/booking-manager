// src/components/CleaningDashboard.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from '../firebase';

// 건물 정렬 순서
const BUILDING_ORDER = [
  "아라키초A", "아라키초B", "다이쿄초", "가부키초",
  "다카다노바바", "오쿠보A동", "오쿠보B동", "오쿠보C동", "사노시"
];

// 로컬 시간 기준 날짜 문자열 반환 (YYYY-MM-DD)
const getLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 건물 순서대로 정렬
const sortByBuildingOrder = (list) => {
  return [...list].sort((a, b) => {
    const indexA = BUILDING_ORDER.indexOf(a.building);
    const indexB = BUILDING_ORDER.indexOf(b.building);
    const orderA = indexA === -1 ? 999 : indexA;
    const orderB = indexB === -1 ? 999 : indexB;
    if (orderA !== orderB) return orderA - orderB;
    return (a.room || "").localeCompare(b.room || "");
  });
};

const CleaningDashboard = () => {
  // 로컬 시간 기준으로 오늘 날짜 초기화
  const [selectedDate, setSelectedDate] = useState(getLocalDate());
  const [loading, setLoading] = useState(false);
  const [scheduleList, setScheduleList] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. 오늘 퇴실(Departure) 조회 (Confirmed 상태만)
      const departuresSnap = await getDocs(
        query(
          collection(db, "reservations"),
          where("status", "==", "confirmed"),
          where("departure", "==", selectedDate)
        )
      );
      const departures = departuresSnap.docs.map(d => ({ ...d.data(), id: d.id }));

      // 2. 오늘 입실(Arrival) 조회 (Confirmed 상태만)
      const arrivalsSnap = await getDocs(
        query(
          collection(db, "reservations"),
          where("status", "==", "confirmed"),
          where("arrival", "==", selectedDate)
        )
      );
      const arrivals = arrivalsSnap.docs.map(d => ({ ...d.data(), id: d.id }));

      // 3. 데이터 병합
      const tasksMap = {};

      const getTask = (building, room) => {
        const key = `${building}_${room}`;
        if (!tasksMap[key]) {
          tasksMap[key] = {
            id: key,
            building,
            room,
            // 퇴실 정보
            hasCheckout: false,
            checkoutGuestName: null,
            checkoutNumAdult: 0,
            checkoutNumChild: 0,
            // 입실 정보
            hasNextCheckin: false,
            isSameDayCheckin: false,
            nextCheckinDate: null,
            nextCheckinGuestName: null,
            nextCheckinNumAdult: 0,
            nextCheckinNumChild: 0
          };
        }
        return tasksMap[key];
      };

      // 퇴실 데이터 처리
      departures.forEach(res => {
        const task = getTask(res.building, res.room);
        task.hasCheckout = true;
        task.checkoutGuestName = res.guestName;
        task.checkoutNumAdult = res.numAdult || 0;
        task.checkoutNumChild = res.numChild || 0;
      });

      // 입실 데이터 처리
      arrivals.forEach(res => {
        const task = getTask(res.building, res.room);
        task.hasNextCheckin = true;
        task.isSameDayCheckin = true;
        task.nextCheckinDate = res.arrival;
        task.nextCheckinGuestName = res.guestName;
        task.nextCheckinNumAdult = res.numAdult || 0;
        task.nextCheckinNumChild = res.numChild || 0;
      });

      // 4. 퇴실만 있는 경우 -> 미래 입실 정보 추가 조회
      const allTasks = Object.values(tasksMap);
      
      const finalTasks = await Promise.all(allTasks.map(async (task) => {
        if (task.hasNextCheckin) return task; // 이미 입실 정보 있으면 패스

        // 퇴실은 있는데 오늘 입실이 없는 경우 -> 가장 가까운 미래 예약 조회
        if (task.hasCheckout) {
          const nextCheckinSnap = await getDocs(
            query(
              collection(db, "reservations"),
              where("status", "==", "confirmed"),
              where("building", "==", task.building),
              where("room", "==", task.room),
              where("arrival", ">", selectedDate),
              orderBy("arrival", "asc"),
              limit(1)
            )
          );
          
          const nextRes = nextCheckinSnap.docs.length > 0 ? nextCheckinSnap.docs[0].data() : null;
          
          if (nextRes) {
            task.hasNextCheckin = true;
            task.isSameDayCheckin = false;
            task.nextCheckinDate = nextRes.arrival;
            task.nextCheckinGuestName = nextRes.guestName;
            task.nextCheckinNumAdult = nextRes.numAdult || 0;
            task.nextCheckinNumChild = nextRes.numChild || 0;
          }
        }
        return task;
      }));

      setScheduleList(sortByBuildingOrder(finalTasks));
    } catch (error) {
      console.error("데이터 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <h2 className="page-title" style={{ color: "#5856D6" }}>🧹 입/퇴실 통합 스케줄</h2>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            type="date"
            className="form-input"
            style={{ marginBottom: 0, width: "160px", fontWeight: "bold" }}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button
            className="btn-primary"
            style={{ width: "auto", padding: "10px 20px" }}
            onClick={fetchData}
          >
            🔄 새로고침
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card" style={{ borderLeft: "5px solid #5856D6" }}>
          <div className="kpi-label">체크리스트</div>
          <div className="kpi-value" style={{ color: "#5856D6" }}>{scheduleList.length}건</div>
          <div className="kpi-sub">오늘 활동(입/퇴실) 객실</div>
        </div>
      </div>

      <div style={{
        background: "#F5F5F7",
        padding: "12px 20px",
        borderRadius: "12px",
        marginBottom: "20px",
        fontSize: "13px",
        color: "#666"
      }}>
        <span>💡 <strong>안내:</strong> 이 목록은 <strong>오늘 퇴실</strong>하거나 <strong>오늘 입실</strong>하는 모든 객실을 보여줍니다.</span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px", color: "#888" }}>데이터 로딩 중...</div>
      ) : scheduleList.length === 0 ? (
        <div className="table-card" style={{ textAlign: "center", padding: "50px", color: "#888" }}>
          {selectedDate}에는 예정된 입실이나 퇴실이 없습니다.
        </div>
      ) : (
        <div className="table-card">
          <table className="table-full">
            <thead>
              <tr>
                <th style={{ width: "20%" }}>객실</th>
                <th style={{ width: "40%" }}>퇴실 정보 (Checkout)</th>
                <th style={{ width: "40%" }}>입실 정보 (Checkin)</th>
              </tr>
            </thead>
            <tbody>
              {scheduleList.map((task) => {
                return (
                  <tr key={task.id}>
                    {/* 객실 */}
                    <td style={{ fontWeight: "bold" }}>
                      {task.building}<br/>
                      <span style={{ color: "#666", fontSize: "13px" }}>{task.room}</span>
                    </td>

                    {/* 퇴실 게스트 */}
                    <td style={{ fontSize: "14px", verticalAlign: "middle" }}>
                      {task.hasCheckout ? (
                        <>
                          <div style={{fontWeight:'600', color:'#333', marginBottom: '4px'}}>
                            {task.checkoutGuestName}
                          </div>
                          <div style={{ color: "#888", fontSize: "12px" }}>
                            성인 {task.checkoutNumAdult}, 아동 {task.checkoutNumChild}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#aaa" }}>- (공실)</span>
                      )}
                    </td>

                    {/* 입실 게스트 */}
                    <td style={{ fontSize: "14px", verticalAlign: "middle" }}>
                      {task.hasNextCheckin ? (
                        <>
                          <div style={{ marginBottom: "4px" }}>
                            {task.isSameDayCheckin ? (
                              <span style={{ color: "#FF3B30", fontWeight: "bold" }}>당일 입실</span>
                            ) : (
                              <span style={{ color: "#0071E3", fontWeight: "bold" }}>{task.nextCheckinDate} 입실</span>
                            )}
                          </div>
                          <div style={{ color: "#333", fontWeight: "600", marginBottom: "2px" }}>
                            {task.nextCheckinGuestName}
                          </div>
                          <div style={{ color: "#888", fontSize: "12px" }}>
                            성인 {task.nextCheckinNumAdult}, 아동 {task.nextCheckinNumChild}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#999" }}>예약 없음</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CleaningDashboard;