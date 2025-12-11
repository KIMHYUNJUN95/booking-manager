// src/components/CleaningDashboard.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, setDoc, orderBy, limit } from "firebase/firestore";
import { db } from '../firebase';

// 기본 체크아웃/체크인 시간
const DEFAULT_CHECKOUT_TIME = "10:00";
const DEFAULT_CHECKIN_TIME = "16:00";

// 건물 정렬 순서
const BUILDING_ORDER = [
  "아라키초A", "아라키초B", "다이쿄초", "가부키초",
  "다카다노바바", "오쿠보A동", "오쿠보B동", "오쿠보C동", "사노시"
];

// 건물 순서대로 정렬
const sortByBuildingOrder = (list) => {
  return [...list].sort((a, b) => {
    const indexA = BUILDING_ORDER.indexOf(a.building);
    const indexB = BUILDING_ORDER.indexOf(b.building);
    const orderA = indexA === -1 ? 999 : indexA;
    const orderB = indexB === -1 ? 999 : indexB;
    if (orderA !== orderB) return orderA - orderB;
    // 같은 건물이면 객실명으로 정렬
    return (a.room || "").localeCompare(b.room || "");
  });
};

// 긴급도 계산
const getUrgencyLevel = (nextCheckinTime) => {
  if (!nextCheckinTime) return { level: "none", label: "여유", color: "#34C759" };

  const now = new Date();
  const checkinDate = new Date();
  const [hours, minutes] = nextCheckinTime.split(":").map(Number);
  checkinDate.setHours(hours, minutes, 0, 0);

  const diffMs = checkinDate - now;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) return { level: "overdue", label: "지남", color: "#FF3B30" };
  if (diffHours < 2) return { level: "urgent", label: "긴급", color: "#FF3B30" };
  if (diffHours < 4) return { level: "warning", label: "주의", color: "#FF9500" };
  return { level: "normal", label: "여유", color: "#34C759" };
};

// 청소 상태 정의
const CLEANING_STATUS = {
  pending: { label: "대기중", color: "#FF9500", icon: "⏳" },
  in_progress: { label: "청소중", color: "#0071E3", icon: "🔄" },
  completed: { label: "완료", color: "#34C759", icon: "✅" }
};

const CleaningDashboard = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [cleaningTasks, setCleaningTasks] = useState([]);
  const [reservations, setReservations] = useState([]);

  // 예약 데이터 + 청소 태스크 조회
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. 선택한 날짜에 퇴실하는 예약 조회 (departure = selectedDate)
      const reservationsSnap = await getDocs(
        query(
          collection(db, "reservations"),
          where("status", "==", "confirmed"),
          where("departure", "==", selectedDate)
        )
      );

      const departureList = reservationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReservations(departureList);

      // 2. 각 퇴실 객실의 다음 입실 정보 조회
      const tasksWithNextCheckin = await Promise.all(
        departureList.map(async (res) => {
          // 같은 객실의 다음 입실 예약 찾기 (선택한 날짜 이후 가장 가까운 예약)
          const nextCheckinSnap = await getDocs(
            query(
              collection(db, "reservations"),
              where("status", "==", "confirmed"),
              where("building", "==", res.building),
              where("room", "==", res.room),
              where("arrival", ">=", selectedDate),
              orderBy("arrival", "asc"),
              limit(1)
            )
          );

          const nextCheckin = nextCheckinSnap.docs.length > 0
            ? nextCheckinSnap.docs[0].data()
            : null;

          // 3. 기존 청소 태스크 조회
          const taskId = `${selectedDate}_${res.building}_${res.room}`;
          const existingTaskSnap = await getDocs(
            query(
              collection(db, "cleaningTasks"),
              where("taskId", "==", taskId)
            )
          );

          const existingTask = existingTaskSnap.docs.length > 0
            ? existingTaskSnap.docs[0].data()
            : null;

          return {
            taskId,
            date: selectedDate,
            building: res.building,
            room: res.room,

            // 퇴실 정보
            checkoutBookingId: res.bookId || res.id,
            checkoutGuestName: res.guestName || "(이름없음)",
            checkoutTime: DEFAULT_CHECKOUT_TIME,

            // 다음 입실 정보
            hasNextCheckin: !!nextCheckin,
            nextCheckinBookingId: nextCheckin?.bookId || null,
            nextCheckinGuestName: nextCheckin?.guestName || null,
            nextCheckinTime: nextCheckin?.guestArrivalTime || DEFAULT_CHECKIN_TIME,

            // 청소 상태 (기존 태스크가 있으면 사용, 없으면 pending)
            status: existingTask?.status || "pending",
            assignedTo: existingTask?.assignedTo || "",
            completedAt: existingTask?.completedAt || null,
            notes: existingTask?.notes || ""
          };
        })
      );

      setCleaningTasks(sortByBuildingOrder(tasksWithNextCheckin));
    } catch (error) {
      console.error("청소 데이터 로딩 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  // 청소 상태 업데이트
  const updateTaskStatus = async (task, newStatus) => {
    try {
      const taskRef = doc(db, "cleaningTasks", task.taskId);
      const updateData = {
        taskId: task.taskId,
        date: task.date,
        building: task.building,
        room: task.room,
        status: newStatus,
        checkoutBookingId: task.checkoutBookingId,
        nextCheckinBookingId: task.nextCheckinBookingId,
        updatedAt: new Date()
      };

      if (newStatus === "completed") {
        updateData.completedAt = new Date();
      }

      await setDoc(taskRef, updateData, { merge: true });

      // 로컬 상태 업데이트
      setCleaningTasks(prev =>
        prev.map(t =>
          t.taskId === task.taskId
            ? { ...t, status: newStatus, completedAt: updateData.completedAt }
            : t
        )
      );
    } catch (error) {
      console.error("상태 업데이트 실패:", error);
      alert("상태 변경에 실패했습니다.");
    }
  };

  // 상태별 개수 계산
  const statusCounts = {
    pending: cleaningTasks.filter(t => t.status === "pending").length,
    in_progress: cleaningTasks.filter(t => t.status === "in_progress").length,
    completed: cleaningTasks.filter(t => t.status === "completed").length,
    total: cleaningTasks.length
  };

  return (
    <div className="dashboard-content">
      {/* 헤더 */}
      <div className="dashboard-header">
        <h2 className="page-title" style={{ color: "#5856D6" }}>🧹 청소 스케줄 관리</h2>
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

      {/* KPI 카드 */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ borderLeft: "5px solid #5856D6" }}>
          <div className="kpi-label">오늘 청소 전체</div>
          <div className="kpi-value" style={{ color: "#5856D6" }}>{statusCounts.total}건</div>
          <div className="kpi-sub">퇴실 객실 기준</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: "5px solid #FF9500" }}>
          <div className="kpi-label">⏳ 대기중</div>
          <div className="kpi-value" style={{ color: "#FF9500" }}>{statusCounts.pending}건</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: "5px solid #0071E3" }}>
          <div className="kpi-label">🔄 청소중</div>
          <div className="kpi-value" style={{ color: "#0071E3" }}>{statusCounts.in_progress}건</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: "5px solid #34C759" }}>
          <div className="kpi-label">✅ 완료</div>
          <div className="kpi-value" style={{ color: "#34C759" }}>{statusCounts.completed}건</div>
        </div>
      </div>

      {/* 시간 안내 */}
      <div style={{
        background: "#F5F5F7",
        padding: "12px 20px",
        borderRadius: "12px",
        marginBottom: "20px",
        display: "flex",
        gap: "30px",
        fontSize: "14px",
        color: "#666"
      }}>
        <span>🚪 기본 체크아웃: <strong>{DEFAULT_CHECKOUT_TIME}</strong></span>
        <span>🔑 기본 체크인: <strong>{DEFAULT_CHECKIN_TIME}</strong></span>
      </div>

      {/* 청소 목록 */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "50px", color: "#888" }}>
          청소 스케줄을 불러오는 중...
        </div>
      ) : cleaningTasks.length === 0 ? (
        <div className="table-card" style={{ textAlign: "center", padding: "50px", color: "#888" }}>
          {selectedDate} 퇴실 예정 객실이 없습니다.
        </div>
      ) : (
        <div className="table-card">
          <table className="table-full">
            <thead>
              <tr>
                <th style={{ width: "15%" }}>객실</th>
                <th style={{ width: "15%" }}>퇴실 게스트</th>
                <th style={{ width: "10%" }}>퇴실 시간</th>
                <th style={{ width: "15%" }}>다음 입실</th>
                <th style={{ width: "10%" }}>입실 시간</th>
                <th style={{ width: "10%" }}>긴급도</th>
                <th style={{ width: "12%" }}>상태</th>
                <th style={{ width: "13%" }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {cleaningTasks.map((task) => {
                const statusInfo = CLEANING_STATUS[task.status];
                const urgency = task.hasNextCheckin
                  ? getUrgencyLevel(task.nextCheckinTime)
                  : { level: "none", label: "-", color: "#999" };

                return (
                  <tr key={task.taskId}>
                    {/* 객실 */}
                    <td style={{ fontWeight: "bold" }}>
                      {task.building}<br/>
                      <span style={{ color: "#666", fontSize: "13px" }}>{task.room}</span>
                    </td>

                    {/* 퇴실 게스트 */}
                    <td style={{ fontSize: "13px" }}>
                      {task.checkoutGuestName}
                    </td>

                    {/* 퇴실 시간 */}
                    <td style={{ color: "#FF3B30", fontWeight: "600" }}>
                      {task.checkoutTime}
                    </td>

                    {/* 다음 입실 게스트 */}
                    <td style={{ fontSize: "13px" }}>
                      {task.hasNextCheckin ? (
                        <span style={{ color: "#0071E3" }}>{task.nextCheckinGuestName}</span>
                      ) : (
                        <span style={{ color: "#999" }}>-</span>
                      )}
                    </td>

                    {/* 입실 시간 */}
                    <td style={{ fontWeight: "600", color: task.hasNextCheckin ? "#0071E3" : "#999" }}>
                      {task.hasNextCheckin ? task.nextCheckinTime : "-"}
                    </td>

                    {/* 긴급도 */}
                    <td>
                      {task.hasNextCheckin ? (
                        <span style={{
                          background: urgency.color,
                          color: "white",
                          padding: "4px 10px",
                          borderRadius: "10px",
                          fontSize: "12px",
                          fontWeight: "600"
                        }}>
                          {urgency.label}
                        </span>
                      ) : (
                        <span style={{ color: "#999" }}>-</span>
                      )}
                    </td>

                    {/* 상태 */}
                    <td>
                      <span style={{
                        background: statusInfo.color,
                        color: "white",
                        padding: "4px 10px",
                        borderRadius: "10px",
                        fontSize: "12px",
                        fontWeight: "600"
                      }}>
                        {statusInfo.icon} {statusInfo.label}
                      </span>
                    </td>

                    {/* 액션 버튼 */}
                    <td>
                      {task.status === "pending" && (
                        <button
                          onClick={() => updateTaskStatus(task, "in_progress")}
                          style={{
                            background: "#0071E3",
                            color: "white",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "600"
                          }}
                        >
                          청소 시작
                        </button>
                      )}
                      {task.status === "in_progress" && (
                        <button
                          onClick={() => updateTaskStatus(task, "completed")}
                          style={{
                            background: "#34C759",
                            color: "white",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "600"
                          }}
                        >
                          완료 처리
                        </button>
                      )}
                      {task.status === "completed" && (
                        <button
                          onClick={() => updateTaskStatus(task, "pending")}
                          style={{
                            background: "#E5E5EA",
                            color: "#666",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontSize: "12px"
                          }}
                        >
                          되돌리기
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 범례 */}
      <div style={{
        marginTop: "20px",
        padding: "15px 20px",
        background: "#F5F5F7",
        borderRadius: "12px",
        fontSize: "13px",
        color: "#666"
      }}>
        <strong>상태 설명:</strong>
        <span style={{ marginLeft: "20px" }}>⏳ 대기중: 청소 시작 전</span>
        <span style={{ marginLeft: "20px" }}>🔄 청소중: 청소 진행 중</span>
        <span style={{ marginLeft: "20px" }}>✅ 완료: 청소 완료</span>
        <br style={{ marginTop: "8px" }}/>
        <strong style={{ marginTop: "8px", display: "inline-block" }}>긴급도:</strong>
        <span style={{ marginLeft: "20px", color: "#34C759" }}>● 여유 (4시간 이상)</span>
        <span style={{ marginLeft: "15px", color: "#FF9500" }}>● 주의 (2~4시간)</span>
        <span style={{ marginLeft: "15px", color: "#FF3B30" }}>● 긴급 (2시간 미만)</span>
      </div>
    </div>
  );
};

export default CleaningDashboard;
