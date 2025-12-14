import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from '../firebase';

const TodaySummaryDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [todayData, setTodayData] = useState({
    checkins: 0,
    checkouts: 0,
    revenue: 0,
    newBookings: 0,
    cancellations: 0
  });

  useEffect(() => {
    fetchTodayData();
  }, []);

  const fetchTodayData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // 1. 오늘 입실 (arrival = today)
      const checkinQuery = query(
        collection(db, "reservations"),
        where("arrival", "==", today),
        where("status", "==", "confirmed")
      );
      const checkinSnapshot = await getDocs(checkinQuery);
      const checkins = checkinSnapshot.size;

      // 2. 오늘 퇴실 (departure = today)
      const checkoutQuery = query(
        collection(db, "reservations"),
        where("departure", "==", today),
        where("status", "==", "confirmed")
      );
      const checkoutSnapshot = await getDocs(checkoutQuery);
      const checkouts = checkoutSnapshot.size;

      // 3. 오늘 예약 접수 (bookDate = today)
      const bookingQuery = query(
        collection(db, "reservations"),
        where("bookDate", "==", today),
        where("status", "==", "confirmed")
      );
      const bookingSnapshot = await getDocs(bookingQuery);
      const newBookings = bookingSnapshot.size;

      // 4. 오늘 취소 (bookDate = today, status = cancelled)
      const cancelQuery = query(
        collection(db, "reservations"),
        where("bookDate", "==", today),
        where("status", "==", "cancelled")
      );
      const cancelSnapshot = await getDocs(cancelQuery);
      const cancellations = cancelSnapshot.size;

      // 5. 오늘 매출 (오늘 입실한 예약의 1박당 금액)
      let todayRevenue = 0;
      checkinSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const totalPrice = Number(data.totalPrice || data.price) || 0;

        // 총 박수 계산
        const arrivalDate = new Date(data.arrival);
        const departureDate = new Date(data.departure);
        const totalNights = Math.floor((departureDate - arrivalDate) / (1000 * 60 * 60 * 24));

        if (totalNights > 0) {
          // 오늘 하루치 매출 (1박당 금액)
          const pricePerNight = totalPrice / totalNights;
          todayRevenue += pricePerNight;
        }
      });

      setTodayData({
        checkins,
        checkouts,
        revenue: Math.round(todayRevenue),
        newBookings,
        cancellations
      });

    } catch (error) {
      console.error("오늘의 요약 데이터 로딩 실패:", error);
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
        <h2 className="page-title" style={{ color: "#FF9500" }}>📅 오늘의 요약</h2>
        <div style={{ fontSize: "14px", color: "#86868B" }}>
          {new Date().toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
          })}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px", color: "#999" }}>
          데이터 로딩 중...
        </div>
      ) : (
        <>
          {/* 메인 KPI 카드 (2x3 그리드) */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "20px",
            marginBottom: "30px"
          }}>
            {/* 입실 */}
            <div className="kpi-card" style={{
              borderLeft: "5px solid #34C759",
              background: "linear-gradient(135deg, #ffffff 0%, #f0fff4 100%)"
            }}>
              <div className="kpi-label">오늘 입실</div>
              <div className="kpi-value" style={{ color: "#34C759", fontSize: "48px" }}>
                {todayData.checkins}
              </div>
              <div className="kpi-sub">Check-in</div>
            </div>

            {/* 퇴실 */}
            <div className="kpi-card" style={{
              borderLeft: "5px solid #0071E3",
              background: "linear-gradient(135deg, #ffffff 0%, #f0f8ff 100%)"
            }}>
              <div className="kpi-label">오늘 퇴실</div>
              <div className="kpi-value" style={{ color: "#0071E3", fontSize: "48px" }}>
                {todayData.checkouts}
              </div>
              <div className="kpi-sub">Check-out</div>
            </div>

            {/* 오늘 매출 */}
            <div className="kpi-card" style={{
              borderLeft: "5px solid #FF9500",
              background: "linear-gradient(135deg, #ffffff 0%, #fff8f0 100%)"
            }}>
              <div className="kpi-label">오늘 매출 (입실 기준)</div>
              <div className="kpi-value" style={{ color: "#FF9500", fontSize: "36px" }}>
                {formatCurrency(todayData.revenue)}
              </div>
              <div className="kpi-sub">Today's Revenue</div>
            </div>

            {/* 신규 예약 */}
            <div className="kpi-card" style={{
              borderLeft: "5px solid #5856D6",
              background: "linear-gradient(135deg, #ffffff 0%, #f5f4ff 100%)"
            }}>
              <div className="kpi-label">신규 예약</div>
              <div className="kpi-value" style={{ color: "#5856D6", fontSize: "48px" }}>
                {todayData.newBookings}
              </div>
              <div className="kpi-sub">New Bookings</div>
            </div>

            {/* 취소 */}
            <div className="kpi-card" style={{
              borderLeft: "5px solid #FF3B30",
              background: "linear-gradient(135deg, #ffffff 0%, #fff5f5 100%)"
            }}>
              <div className="kpi-label">취소</div>
              <div className="kpi-value" style={{ color: "#FF3B30", fontSize: "48px" }}>
                {todayData.cancellations}
              </div>
              <div className="kpi-sub">Cancellations</div>
            </div>

            {/* 순 예약 (신규 - 취소) */}
            <div className="kpi-card" style={{
              borderLeft: `5px solid ${todayData.newBookings - todayData.cancellations >= 0 ? "#34C759" : "#FF3B30"}`,
              background: todayData.newBookings - todayData.cancellations >= 0
                ? "linear-gradient(135deg, #ffffff 0%, #f0fff4 100%)"
                : "linear-gradient(135deg, #ffffff 0%, #fff5f5 100%)"
            }}>
              <div className="kpi-label">순 예약</div>
              <div className="kpi-value" style={{
                color: todayData.newBookings - todayData.cancellations >= 0 ? "#34C759" : "#FF3B30",
                fontSize: "48px"
              }}>
                {todayData.newBookings - todayData.cancellations >= 0 ? '+' : ''}
                {todayData.newBookings - todayData.cancellations}
              </div>
              <div className="kpi-sub">Net Bookings</div>
            </div>
          </div>

          {/* 요약 메시지 */}
          <div style={{
            background: "#F5F5F7",
            borderRadius: "12px",
            padding: "20px",
            textAlign: "center",
            fontSize: "16px",
            color: "#333",
            lineHeight: "1.8"
          }}>
            {todayData.checkins === 0 && todayData.checkouts === 0 && todayData.newBookings === 0 ? (
              <div>
                오늘은 아직 활동이 없습니다.
              </div>
            ) : (
              <div>
                <strong>오늘은</strong> 총 <strong style={{color: "#34C759"}}>{todayData.checkins}건</strong>의 입실과{' '}
                <strong style={{color: "#0071E3"}}>{todayData.checkouts}건</strong>의 퇴실이 있습니다.
                <br/>
                신규 예약은 <strong style={{color: "#5856D6"}}>{todayData.newBookings}건</strong>,
                취소는 <strong style={{color: "#FF3B30"}}>{todayData.cancellations}건</strong>이며,
                오늘 예상 매출은 <strong style={{color: "#FF9500"}}>{formatCurrency(todayData.revenue)}</strong>입니다.
              </div>
            )}
          </div>

          {/* 도움말 */}
          <div style={{
            marginTop: "20px",
            padding: "15px 20px",
            background: "#F5F5F7",
            borderRadius: "12px",
            fontSize: "13px",
            color: "#666"
          }}>
            <strong>💡 참고:</strong>
            <ul style={{ marginTop: "10px", paddingLeft: "20px", lineHeight: "1.8" }}>
              <li><strong>오늘 입실/퇴실</strong>: 오늘 날짜에 체크인/체크아웃하는 게스트 수</li>
              <li><strong>오늘 매출</strong>: 오늘 입실한 게스트들의 첫날 숙박 매출 (1박당 금액 기준)</li>
              <li><strong>신규 예약</strong>: 오늘 접수된 확정 예약 건수</li>
              <li><strong>취소</strong>: 오늘 취소 처리된 예약 건수</li>
              <li><strong>순 예약</strong>: 신규 예약 - 취소 (양수면 증가, 음수면 감소)</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default TodaySummaryDashboard;
