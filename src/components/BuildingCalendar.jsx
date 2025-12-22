import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from '../firebase';

// 건물·객실 데이터
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

// 객실 ID 매핑 (Beds24 API용) - 백엔드와 동기화됨
const BUILDING_ROOMS = {
  "아라키초A": [
    { roomId: "383971", name: "201호" }, { roomId: "403542", name: "202호" },
    { roomId: "383972", name: "301호" }, { roomId: "383978", name: "302호" },
    { roomId: "440617", name: "401호" }, { roomId: "383974", name: "402호" },
    { roomId: "502229", name: "501호" }, { roomId: "383976", name: "502호" },
    { roomId: "537451", name: "602호" },
    { roomId: "383973", name: "701호" }, { roomId: "383977", name: "702호" }
  ],
  "아라키초B": [
    { roomId: "585734", name: "101호" }, { roomId: "585738", name: "102호" },
    { roomId: "585735", name: "201호" }, { roomId: "585739", name: "202호" },
    { roomId: "585736", name: "301호" }, { roomId: "585740", name: "302호" },
    { roomId: "585737", name: "401호" }, { roomId: "585741", name: "402호" }
  ],
  "다이쿄초": [
    { roomId: "440619", name: "B01호" }, { roomId: "440620", name: "B02호" },
    { roomId: "440621", name: "101호" }, { roomId: "440622", name: "102호" },
    { roomId: "440623", name: "201호" }, { roomId: "440624", name: "202호" },
    { roomId: "440625", name: "302호" }
  ],
  "가부키초": [
    { roomId: "383979", name: "202호" }, { roomId: "383980", name: "203호" },
    { roomId: "383981", name: "302호" }, { roomId: "383982", name: "303호" },
    { roomId: "383983", name: "402호" }, { roomId: "383984", name: "403호" },
    { roomId: "543189", name: "502호" }, { roomId: "383985", name: "603호" },
    { roomId: "441885", name: "802호" }, { roomId: "624198", name: "803호" }
  ],
  "오쿠보A동": [{ roomId: "437952", name: "오쿠보A" }],
  "오쿠보B동": [{ roomId: "615969", name: "오쿠보B" }],
  "오쿠보C동": [{ roomId: "450096", name: "오쿠보C" }],
  "사노시": [{ roomId: "481152", name: "사노" }],
  "다카다노바바": [
    { roomId: "513698", name: "201호" }, { roomId: "513699", name: "301호" },
    { roomId: "513700", name: "401호" }, { roomId: "513701", name: "501호" },
    { roomId: "513702", name: "601호" }, { roomId: "513703", name: "701호" },
    { roomId: "513704", name: "801호" }, { roomId: "513705", name: "901호" }
  ]
};

// Firebase Functions API URL
const API_BASE_URL = "https://us-central1-my-booking-app-3f0e7.cloudfunctions.net";

// 가격 설정 모달 (고급 버전)
function PriceSettingModal({ building, room, roomId, selectedDates, currentPrices, onClose, onSave }) {
  // 조정 모드: 'direct' (직접입력), 'percent' (퍼센트)
  const [adjustMode, setAdjustMode] = useState("direct");
  const [percentValue, setPercentValue] = useState("");
  const [priceAirbnb, setPriceAirbnb] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1); // 1: 입력, 2: 미리보기/확인

  // 선택된 날짜들의 현재 가격 정보
  const selectedPricesInfo = useMemo(() => {
    if (!selectedDates || !currentPrices) {
      console.log("No selectedDates or currentPrices:", { selectedDates, currentPrices });
      return [];
    }

    console.log("Processing prices - currentPrices:", currentPrices);
    console.log("Processing prices - currentPrices.dates:", currentPrices?.dates);

    return selectedDates.sort().map(dateStr => {
      const dateKey = dateStr.replace(/-/g, "");
      const priceData = currentPrices?.dates?.[dateKey];
      console.log(`Date ${dateStr} (key: ${dateKey}):`, priceData);
      return {
        date: dateStr,
        dateDisplay: dateStr.slice(5), // MM-DD
        // Airbnb = p1 또는 p3 (동일값, 기본가), Booking = p2, p4 = Agoda (무시)
        airbnbPrice: parseFloat(priceData?.p1) || parseFloat(priceData?.p3) || 0,
        bookingPrice: parseFloat(priceData?.p2) || 0
      };
    });
  }, [selectedDates, currentPrices]);

  // 평균 Airbnb 가격
  const avgAirbnbPrice = useMemo(() => {
    if (selectedPricesInfo.length === 0) return 0;
    const total = selectedPricesInfo.reduce((sum, p) => sum + (p.airbnbPrice || 0), 0);
    return Math.round(total / selectedPricesInfo.length);
  }, [selectedPricesInfo]);

  // 변경 후 가격 계산 (Airbnb만 - Booking은 자동 연동)
  const calculateNewPrices = useMemo(() => {
    if (adjustMode === "direct") {
      return selectedPricesInfo.map(p => ({
        ...p,
        newAirbnbPrice: priceAirbnb ? parseInt(priceAirbnb) : p.airbnbPrice
      }));
    } else {
      // 퍼센트 조정
      const pct = parseFloat(percentValue) || 0;
      const multiplier = 1 + (pct / 100);
      return selectedPricesInfo.map(p => ({
        ...p,
        newAirbnbPrice: Math.round((p.airbnbPrice || 0) * multiplier)
      }));
    }
  }, [adjustMode, percentValue, priceAirbnb, selectedPricesInfo]);

  // 변경 사항 있는지 확인
  const hasChanges = useMemo(() => {
    if (adjustMode === "direct") {
      return priceAirbnb && priceAirbnb.length > 0;
    }
    return percentValue && parseFloat(percentValue) !== 0;
  }, [adjustMode, priceAirbnb, percentValue]);

  // 퍼센트 빠른 선택 버튼
  const percentPresets = [-20, -10, -5, 5, 10, 20, 30];

  const handleSave = async () => {
    if (!hasChanges) {
      setError("변경할 가격을 입력해주세요");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 각 날짜별로 개별 요청 (퍼센트 조정 시 날짜별 가격이 다를 수 있음)
      const promises = calculateNewPrices.map(async (priceInfo) => {
        const dateStr = priceInfo.date.replace(/-/g, "");

        const body = {
          building,
          roomId,
          dateFrom: dateStr,
          dateTo: dateStr,
          // Airbnb 가격만 전송 (Booking은 Beds24에서 자동 연동)
          priceAirbnb: priceInfo.newAirbnbPrice
        };

        console.log("Sending price to Beds24:", body);

        const response = await fetch(`${API_BASE_URL}/setRoomPrices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        const result = await response.json();
        console.log("Beds24 response:", result);
        return result;
      });

      const results = await Promise.all(promises);
      console.log("All results:", results);
      const allSuccess = results.every(r => r.success);

      if (allSuccess) {
        alert("✓ Beds24에 가격이 반영되었습니다!");
        setTimeout(() => {
          onSave && onSave();
          onClose();
        }, 300);
      } else {
        const errorMsgs = results.filter(r => !r.success).map(r => r.error).join(", ");
        setError("가격 설정 실패: " + errorMsgs);
      }
    } catch (err) {
      setError("서버 연결에 실패했습니다: " + err.message);
      console.error("Price setting error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px", maxHeight: "85vh", overflow: "auto" }}>
        <div className="modal-header" style={{ borderBottom: "none", paddingBottom: "0" }}>
          <div>
            <div className="modal-title" style={{ fontSize: "20px" }}>
              {step === 1 ? "💰 가격 설정" : "📋 변경 확인"}
            </div>
            <div style={{ fontSize: "13px", color: "#86868B", marginTop: "4px" }}>
              {building} {room} · {selectedDates.length}일 선택
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {step === 1 ? (
          <>
            {/* 현재 가격 정보 */}
            <div style={{
              background: "#F8F8FA",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "20px"
            }}>
              <div style={{ fontSize: "12px", color: "#86868B", marginBottom: "8px" }}>현재 Airbnb 가격 (Beds24)</div>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "11px", color: "#FF385C" }}>Airbnb</span>
                  <div style={{ fontSize: "24px", fontWeight: "700", color: "#FF385C" }}>
                    ¥{avgAirbnbPrice.toLocaleString()}
                  </div>
                </div>
                {selectedPricesInfo[0]?.bookingPrice > 0 && (
                  <div style={{ opacity: 0.6 }}>
                    <span style={{ fontSize: "11px", color: "#003580" }}>Booking (자동연동)</span>
                    <div style={{ fontSize: "16px", fontWeight: "600", color: "#003580" }}>
                      ¥{Math.round(selectedPricesInfo.reduce((s, p) => s + p.bookingPrice, 0) / selectedPricesInfo.length).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: "11px", color: "#86868B", marginTop: "8px" }}>
                💡 Airbnb 가격 변경 시 Booking.com도 자동 반영됩니다
              </div>
            </div>

            {/* 조정 모드 선택 */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#1D1D1F", marginBottom: "10px" }}>조정 방법</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setAdjustMode("direct")}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "10px",
                    border: adjustMode === "direct" ? "2px solid #0071E3" : "1px solid #E5E5EA",
                    background: adjustMode === "direct" ? "#E8F2FF" : "white",
                    color: "#1D1D1F",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  💵 직접 입력
                </button>
                <button
                  onClick={() => setAdjustMode("percent")}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "10px",
                    border: adjustMode === "percent" ? "2px solid #0071E3" : "1px solid #E5E5EA",
                    background: adjustMode === "percent" ? "#E8F2FF" : "white",
                    color: "#1D1D1F",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  📊 퍼센트 조정
                </button>
              </div>
            </div>

            {adjustMode === "direct" ? (
              /* 직접 입력 모드 - Airbnb 가격만 */
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", fontWeight: "600", color: "#FF385C", marginBottom: "10px" }}>
                  <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#FF385C" }}></span>
                  Airbnb 가격 (¥)
                </label>
                <input
                  type="number"
                  value={priceAirbnb}
                  onChange={(e) => setPriceAirbnb(e.target.value)}
                  placeholder={`현재: ¥${avgAirbnbPrice.toLocaleString()}`}
                  style={{
                    width: "100%",
                    padding: "16px 18px",
                    border: "2px solid #FF385C",
                    borderRadius: "12px",
                    fontSize: "18px",
                    fontWeight: "600",
                    outline: "none",
                    boxSizing: "border-box",
                    background: "#FFF5F7"
                  }}
                />
                <div style={{ fontSize: "12px", color: "#86868B", marginTop: "8px", textAlign: "center" }}>
                  Booking.com 가격은 자동으로 연동됩니다
                </div>
              </div>
            ) : (
              /* 퍼센트 조정 모드 */
              <div>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#1D1D1F", marginBottom: "10px" }}>
                  조정 비율 선택
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
                  {percentPresets.map(pct => (
                    <button
                      key={pct}
                      onClick={() => setPercentValue(String(pct))}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        border: percentValue === String(pct) ? "2px solid #0071E3" : "1px solid #E5E5EA",
                        background: percentValue === String(pct) ? "#E8F2FF" : "white",
                        color: pct > 0 ? "#34C759" : pct < 0 ? "#FF3B30" : "#1D1D1F",
                        fontWeight: "600",
                        fontSize: "13px",
                        cursor: "pointer"
                      }}
                    >
                      {pct > 0 ? `+${pct}%` : `${pct}%`}
                    </button>
                  ))}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#86868B", marginBottom: "6px" }}>
                    또는 직접 입력 (%)
                  </label>
                  <input
                    type="number"
                    value={percentValue}
                    onChange={(e) => setPercentValue(e.target.value)}
                    placeholder="예: -15 또는 25"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      border: "1px solid #E5E5EA",
                      borderRadius: "10px",
                      fontSize: "15px",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
                {percentValue && (
                  <div style={{
                    marginTop: "12px",
                    padding: "12px",
                    background: parseFloat(percentValue) > 0 ? "#E8FAE8" : "#FFF0F0",
                    borderRadius: "10px",
                    fontSize: "14px",
                    textAlign: "center"
                  }}>
                    Airbnb ¥{avgAirbnbPrice.toLocaleString()} → <strong>¥{Math.round(avgAirbnbPrice * (1 + parseFloat(percentValue) / 100)).toLocaleString()}</strong>
                    <span style={{ marginLeft: "8px", color: parseFloat(percentValue) > 0 ? "#34C759" : "#FF3B30" }}>
                      ({parseFloat(percentValue) > 0 ? "+" : ""}{percentValue}%)
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Step 2: 미리보기 및 확인 */
          <>
            <div style={{
              background: "#FFF8E1",
              borderRadius: "10px",
              padding: "12px 16px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "10px"
            }}>
              <span style={{ fontSize: "20px" }}>⚠️</span>
              <div style={{ fontSize: "13px", color: "#8B6914" }}>
                <strong>Beds24에 즉시 반영됩니다.</strong><br />
                아래 변경 내용을 확인해주세요.
              </div>
            </div>

            <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#FFF5F7" }}>
                    <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #E5E5EA" }}>날짜</th>
                    <th style={{ padding: "10px", textAlign: "right", borderBottom: "1px solid #E5E5EA", color: "#FF385C" }}>현재 Airbnb</th>
                    <th style={{ padding: "10px", textAlign: "center", borderBottom: "1px solid #E5E5EA" }}>→</th>
                    <th style={{ padding: "10px", textAlign: "right", borderBottom: "1px solid #E5E5EA", color: "#FF385C" }}>변경 후</th>
                  </tr>
                </thead>
                <tbody>
                  {calculateNewPrices.map((p, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #F2F2F7" }}>
                      <td style={{ padding: "10px" }}>{p.dateDisplay}</td>
                      <td style={{ padding: "10px", textAlign: "right", color: "#86868B" }}>
                        ¥{(p.airbnbPrice || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: "10px", textAlign: "center", color: "#86868B" }}>→</td>
                      <td style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: p.newAirbnbPrice !== p.airbnbPrice ? "#FF385C" : "#1D1D1F" }}>
                        ¥{(p.newAirbnbPrice || 0).toLocaleString()}
                        {p.newAirbnbPrice !== p.airbnbPrice && (
                          <span style={{ fontSize: "11px", color: p.newAirbnbPrice > p.airbnbPrice ? "#34C759" : "#FF3B30", marginLeft: "4px" }}>
                            {p.airbnbPrice > 0 ? `(${p.newAirbnbPrice > p.airbnbPrice ? "+" : ""}${Math.round((p.newAirbnbPrice - p.airbnbPrice) / p.airbnbPrice * 100)}%)` : "(new)"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{
              background: "#FFF5F7",
              borderRadius: "10px",
              padding: "14px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "12px", color: "#FF385C", marginBottom: "4px" }}>Airbnb 가격 변경</div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#FF385C" }}>
                {calculateNewPrices.filter(p => p.newAirbnbPrice !== p.airbnbPrice).length}일
              </div>
              <div style={{ fontSize: "11px", color: "#86868B", marginTop: "4px" }}>
                Booking.com도 자동 반영됩니다
              </div>
            </div>
          </>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div style={{
            marginTop: "16px",
            padding: "12px",
            background: "#FFF0F0",
            borderRadius: "10px",
            color: "#FF3B30",
            fontSize: "14px",
            textAlign: "center"
          }}>
            {error}
          </div>
        )}

        {/* 버튼 */}
        <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
          {step === 1 ? (
            <>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "14px",
                  background: "#F2F2F7",
                  color: "#1D1D1F",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                취소
              </button>
              <button
                onClick={() => hasChanges && setStep(2)}
                disabled={!hasChanges}
                style={{
                  flex: 2,
                  padding: "14px",
                  background: hasChanges ? "#0071E3" : "#C7C7CC",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: "600",
                  cursor: hasChanges ? "pointer" : "not-allowed"
                }}
              >
                미리보기 →
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(1)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "14px",
                  background: "#F2F2F7",
                  color: "#1D1D1F",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: "600",
                  cursor: loading ? "not-allowed" : "pointer"
                }}
              >
                ← 수정
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                style={{
                  flex: 2,
                  padding: "14px",
                  background: loading ? "#86868B" : "#FF9500",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: "700",
                  cursor: loading ? "not-allowed" : "pointer"
                }}
              >
                {loading ? "저장 중..." : "✓ Beds24에 적용"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const BUILDING_ORDER = [
  "아라키초A", "아라키초B", "다이쿄초", "가부키초",
  "다카다노바바", "오쿠보A동", "오쿠보B동", "오쿠보C동", "사노시"
];

// 플랫폼별 색상
const PLATFORM_COLORS = {
  "Airbnb": "#FF385C",
  "Booking": "#003580",
  "Expedia": "#FFCC00",
  "Agoda": "#E74C3C",
  "default": "#86868B"
};

const getPlatformColor = (platform) => {
  if (!platform) return PLATFORM_COLORS.default;
  const p = platform.toLowerCase();
  if (p.includes("airbnb")) return PLATFORM_COLORS.Airbnb;
  if (p.includes("booking")) return PLATFORM_COLORS.Booking;
  if (p.includes("expedia")) return PLATFORM_COLORS.Expedia;
  if (p.includes("agoda")) return PLATFORM_COLORS.Agoda;
  return PLATFORM_COLORS.default;
};

// 날짜 유틸리티
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const formatPrice = (price) => {
  if (!price) return "¥0";
  const num = parseFloat(String(price).replace(/[^0-9.-]+/g, ""));
  if (isNaN(num)) return "¥0";
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(num);
};

// 예약 상세 모달
function ReservationDetailModal({ reservation, onClose }) {
  if (!reservation) return null;

  const InfoRow = ({ label, value, icon }) => (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 0",
      borderBottom: "1px solid #F2F2F7"
    }}>
      <span style={{ color: "#86868B", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span>{icon}</span> {label}
      </span>
      <span style={{ fontWeight: "600", fontSize: "14px", color: value ? "#1D1D1F" : "#CCC", maxWidth: "55%", textAlign: "right", wordBreak: "break-word" }}>
        {value || "정보 없음"}
      </span>
    </div>
  );

  const platformColor = getPlatformColor(reservation.platform);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
        <div className="modal-header" style={{ borderBottom: "none", paddingBottom: "0" }}>
          <div>
            <div className="modal-title" style={{ fontSize: "20px" }}>예약 상세 정보</div>
            <div style={{ fontSize: "13px", color: "#86868B", marginTop: "4px" }}>
              {reservation.building} {reservation.room}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* 게스트 헤더 카드 */}
        <div style={{
          background: `linear-gradient(135deg, ${platformColor} 0%, ${platformColor}CC 100%)`,
          borderRadius: "16px",
          padding: "20px",
          marginBottom: "20px",
          color: "white"
        }}>
          <div style={{ fontSize: "18px", fontWeight: "700", marginBottom: "8px" }}>
            {reservation.guestName || "(이름 없음)"}
          </div>
          <div style={{ display: "flex", gap: "12px", fontSize: "13px", opacity: "0.9", flexWrap: "wrap" }}>
            <span>성인 {reservation.numAdult || 0}명</span>
            <span>아동 {reservation.numChild || 0}명</span>
            <span style={{
              background: "rgba(255,255,255,0.2)",
              padding: "2px 8px",
              borderRadius: "4px",
              fontWeight: "600"
            }}>
              {reservation.platform || "Unknown"}
            </span>
          </div>
        </div>

        {/* 상세 정보 */}
        <div style={{ maxHeight: "320px", overflowY: "auto" }}>
          <InfoRow icon="📧" label="이메일" value={reservation.guestEmail} />
          <InfoRow icon="📞" label="전화번호" value={reservation.guestPhone} />
          <InfoRow icon="🌍" label="국가" value={reservation.guestCountry} />
          <InfoRow icon="🕐" label="도착 예정" value={reservation.arrivalTime} />

          <div style={{ height: "12px" }} />

          <InfoRow icon="📅" label="체크인" value={reservation.arrival} />
          <InfoRow icon="📅" label="체크아웃" value={reservation.departure} />
          <InfoRow icon="🌙" label="숙박일수" value={reservation.nights ? `${reservation.nights}박` : ""} />

          <div style={{ height: "12px" }} />

          <InfoRow icon="🏷️" label="채널 예약번호" value={reservation.apiReference} />

          <div style={{ height: "12px" }} />

          <InfoRow icon="💰" label="총 금액" value={formatPrice(reservation.totalPrice || reservation.price)} />
          <InfoRow icon="💸" label="채널 수수료" value={formatPrice(reservation.commission)} />
          <InfoRow icon="💵" label="순수익" value={formatPrice(reservation.netRevenue)} />

          {/* 고객 코멘트 */}
          {reservation.guestComments && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ color: "#86868B", fontSize: "14px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>💬</span> 요청사항
              </div>
              <div style={{
                background: "#F9F9F9",
                padding: "14px",
                borderRadius: "12px",
                fontSize: "14px",
                color: "#1D1D1F",
                lineHeight: "1.5"
              }}>
                {reservation.guestComments}
              </div>
            </div>
          )}
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

// 년/월 선택 모달
function MonthPickerModal({ year, month, onSelect, onClose }) {
  const [selectedYear, setSelectedYear] = useState(year);
  const [selectedMonth, setSelectedMonth] = useState(month);

  const years = [];
  for (let y = 2023; y <= 2027; y++) {
    years.push(y);
  }

  const months = [
    "1월", "2월", "3월", "4월", "5월", "6월",
    "7월", "8월", "9월", "10월", "11월", "12월"
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "360px", padding: "24px" }}
      >
        <div className="modal-header" style={{ borderBottom: "none", paddingBottom: "0", marginBottom: "20px" }}>
          <div className="modal-title" style={{ fontSize: "20px" }}>날짜 선택</div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* 년도 선택 */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "#86868B", marginBottom: "10px" }}>년도</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {years.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "none",
                  background: selectedYear === y ? "#0071E3" : "#F2F2F7",
                  color: selectedYear === y ? "white" : "#1D1D1F",
                  fontWeight: "600",
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* 월 선택 */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "#86868B", marginBottom: "10px" }}>월</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
            {months.map((m, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedMonth(idx)}
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: selectedMonth === idx ? "#0071E3" : "#F2F2F7",
                  color: selectedMonth === idx ? "white" : "#1D1D1F",
                  fontWeight: "600",
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* 확인 버튼 */}
        <button
          onClick={() => {
            onSelect(selectedYear, selectedMonth);
            onClose();
          }}
          style={{
            width: "100%",
            padding: "14px",
            background: "#0071E3",
            color: "white",
            border: "none",
            borderRadius: "12px",
            fontSize: "16px",
            fontWeight: "600",
            cursor: "pointer"
          }}
        >
          {selectedYear}년 {selectedMonth + 1}월로 이동
        </button>
      </div>
    </div>
  );
}

// 메인 캘린더 컴포넌트
function BuildingCalendar() {
  const [selectedBuilding, setSelectedBuilding] = useState("아라키초A");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // 가격 설정 관련 state
  const [priceMode, setPriceMode] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedDates, setSelectedDates] = useState([]);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [roomPrices, setRoomPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const rooms = BUILDING_DATA[selectedBuilding] || [];

  // 월 이동
  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());
  const handleMonthSelect = (newYear, newMonth) => setCurrentDate(new Date(newYear, newMonth, 1));

  // 가격 모드 토글
  const togglePriceMode = () => {
    setPriceMode(!priceMode);
    setSelectedRoom(null);
    setSelectedDates([]);
  };

  // 날짜 셀 클릭 핸들러
  const handleDateCellClick = (room, day) => {
    if (!priceMode) return;

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 과거 날짜는 선택 불가
    const clickedDate = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (clickedDate < today) {
      return; // 과거 날짜는 무시
    }

    const roomInfo = BUILDING_ROOMS[selectedBuilding]?.find(r => r.name === room);

    if (!roomInfo) {
      console.error("Room not found:", room);
      return;
    }

    // 같은 객실에서만 다중 선택 가능
    if (selectedRoom && selectedRoom !== room) {
      setSelectedRoom(room);
      setSelectedDates([dateStr]);
    } else {
      setSelectedRoom(room);
      if (selectedDates.includes(dateStr)) {
        setSelectedDates(selectedDates.filter(d => d !== dateStr));
      } else {
        setSelectedDates([...selectedDates, dateStr]);
      }
    }
  };

  // 가격 설정 모달 열기
  const openPriceModal = () => {
    if (selectedDates.length === 0) {
      alert("날짜를 선택해주세요");
      return;
    }
    // 디버깅
    const roomInfo = BUILDING_ROOMS[selectedBuilding]?.find(r => r.name === selectedRoom);
    console.log("Opening price modal:", {
      selectedBuilding,
      selectedRoom,
      roomInfo,
      roomPrices: roomPrices,
      currentPrices: roomInfo ? roomPrices[roomInfo.roomId] : null
    });
    setShowPriceModal(true);
  };

  // 가격 데이터 조회
  const fetchPrices = async () => {
    if (!priceMode) return;

    setPricesLoading(true);
    try {
      // Beds24는 과거 날짜 조회 불가 - 오늘 또는 월 시작일 중 더 늦은 날짜부터
      const today = new Date();
      const monthStart = new Date(year, month, 1);
      const startDate = monthStart > today ? monthStart : today;

      const dateFrom = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}${String(startDate.getDate()).padStart(2, '0')}`;
      const dateTo = `${year}${String(month + 1).padStart(2, '0')}${daysInMonth}`;

      console.log("Fetching prices:", { building: selectedBuilding, dateFrom, dateTo });

      const response = await fetch(`${API_BASE_URL}/getRoomPrices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building: selectedBuilding,
          dateFrom,
          dateTo
        })
      });

      const data = await response.json();
      console.log("Price API response:", data);

      if (data.success && data.priceData) {
        setRoomPrices(data.priceData);
        console.log("Room prices set:", data.priceData);
      }
    } catch (err) {
      console.error("Price fetch error:", err);
    } finally {
      setPricesLoading(false);
    }
  };

  // 가격 모드일 때 가격 조회
  useEffect(() => {
    if (priceMode) {
      fetchPrices();
    }
  }, [priceMode, selectedBuilding, year, month]);

  // 선택 초기화 (건물 변경 시)
  useEffect(() => {
    setSelectedRoom(null);
    setSelectedDates([]);
  }, [selectedBuilding]);

  // 데이터 페칭
  useEffect(() => {
    const fetchReservations = async () => {
      setLoading(true);
      try {
        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`;

        const q = query(
          collection(db, "reservations"),
          where("building", "==", selectedBuilding),
          where("status", "==", "confirmed")
        );

        const snapshot = await getDocs(q);
        const allReservations = snapshot.docs.map(doc => doc.data());

        // 해당 월에 걸치는 예약만 필터링
        const filtered = allReservations.filter(r => {
          if (!r.arrival || !r.departure) return false;
          return r.arrival <= monthEnd && r.departure >= monthStart;
        });

        setReservations(filtered);
      } catch (error) {
        console.error("Error fetching reservations:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReservations();
  }, [selectedBuilding, year, month, daysInMonth]);

  // 객실별 예약 매핑
  const roomReservations = useMemo(() => {
    const map = {};
    rooms.forEach(room => {
      map[room] = reservations.filter(r => r.room === room);
    });
    return map;
  }, [reservations, rooms]);

  // 건물 분석 데이터 계산
  const analysis = useMemo(() => {
    const totalRooms = rooms.length;
    const totalDays = daysInMonth;
    const totalRoomDays = totalRooms * totalDays;

    // 오늘 날짜
    const today = new Date().toISOString().slice(0, 10);

    // 예약된 객실일수 계산
    let occupiedDays = 0;
    let totalRevenue = 0;
    let totalNights = 0;
    let emptyRoomsToday = totalRooms;

    reservations.forEach(r => {
      if (!r.arrival || !r.departure) return;

      // 이번 달에 해당하는 박수 계산
      const arrivalDate = new Date(r.arrival + 'T00:00:00');
      const departureDate = new Date(r.departure + 'T00:00:00');
      const monthStartDate = new Date(year, month, 1);
      const monthEndDate = new Date(year, month + 1, 0); // 해당 월의 마지막 날

      // 해당 월과 겹치는 구간 계산
      const effectiveStart = arrivalDate < monthStartDate ? monthStartDate : arrivalDate;
      const effectiveEnd = departureDate > new Date(year, month + 1, 0) ? new Date(year, month + 1, 1) : departureDate;

      const nightsInMonth = Math.max(0, Math.ceil((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)));
      occupiedDays += nightsInMonth;

      // 전체 예약 박수 계산 (r.nights가 없으면 직접 계산)
      const totalReservationNights = r.nights || Math.max(1, Math.ceil((departureDate - arrivalDate) / (1000 * 60 * 60 * 24)));

      // 매출 (순수익 우선, 없으면 totalPrice/price 사용)
      const revenue = parseFloat(r.netRevenue) || parseFloat(r.totalPrice) || parseFloat(r.price) || 0;
      if (revenue > 0 && totalReservationNights > 0) {
        // 이번 달에 해당하는 비율만큼 분배
        const monthlyRevenue = (revenue / totalReservationNights) * nightsInMonth;
        totalRevenue += monthlyRevenue;
      }

      totalNights += nightsInMonth;

      // 오늘 비어있는 방 계산
      if (r.arrival <= today && r.departure > today) {
        emptyRoomsToday--;
      }
    });

    // 디버깅 로그 (콘솔에서 확인)
    console.log(`[${selectedBuilding}] ${year}년 ${month + 1}월 분석:`, {
      예약수: reservations.length,
      총점유일수: occupiedDays,
      총박수: totalNights,
      총매출: Math.round(totalRevenue),
      평균단가: totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0
    });

    const occupancyRate = totalRoomDays > 0 ? ((occupiedDays / totalRoomDays) * 100).toFixed(1) : 0;
    const avgPrice = totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0;

    return {
      occupancyRate,
      emptyRoomsToday: Math.max(0, emptyRoomsToday),
      totalRevenue,
      avgPrice,
      totalReservations: reservations.length
    };
  }, [reservations, rooms, daysInMonth, year, month, selectedBuilding]);

  // 예약 바 렌더링
  const renderReservationBar = (reservation, roomIndex) => {
    const arrivalDate = new Date(reservation.arrival);
    const departureDate = new Date(reservation.departure);
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month, daysInMonth + 1);

    // 시작일과 종료일 계산 (월 범위 내로 제한)
    const startDay = arrivalDate < monthStart ? 1 : arrivalDate.getDate();
    const endDay = departureDate > monthEnd ? daysInMonth + 1 : departureDate.getDate();

    // 너비와 위치 계산
    const dayWidth = 100 / daysInMonth;
    const left = (startDay - 1) * dayWidth;
    const width = (endDay - startDay) * dayWidth;

    if (width <= 0) return null;

    const platformColor = getPlatformColor(reservation.platform);
    const displayText = `${reservation.guestName || "예약"} ${formatPrice(reservation.totalPrice || reservation.price)}`;

    return (
      <div
        key={reservation.bookId || `${reservation.arrival}-${reservation.room}`}
        onClick={() => setSelectedReservation(reservation)}
        style={{
          position: "absolute",
          left: `${left}%`,
          width: `${width}%`,
          top: "4px",
          bottom: "4px",
          backgroundColor: platformColor,
          borderRadius: "6px",
          color: "white",
          fontSize: "11px",
          fontWeight: "600",
          padding: "4px 8px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          cursor: "pointer",
          boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
          transition: "transform 0.1s, box-shadow 0.1s",
          zIndex: 10
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = "scale(1.02)";
          e.target.style.boxShadow = "0 4px 8px rgba(0,0,0,0.25)";
          e.target.style.zIndex = 20;
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = "scale(1)";
          e.target.style.boxShadow = "0 2px 4px rgba(0,0,0,0.15)";
          e.target.style.zIndex = 10;
        }}
        title={`${reservation.guestName}\n${reservation.arrival} ~ ${reservation.departure}\n${formatPrice(reservation.totalPrice)}`}
      >
        {displayText}
      </div>
    );
  };

  return (
    <div className="dashboard-content">
      {/* 예약 상세 모달 */}
      {selectedReservation && (
        <ReservationDetailModal
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
        />
      )}

      {/* 년/월 선택 모달 */}
      {showMonthPicker && (
        <MonthPickerModal
          year={year}
          month={month}
          onSelect={handleMonthSelect}
          onClose={() => setShowMonthPicker(false)}
        />
      )}

      {/* 가격 설정 모달 */}
      {showPriceModal && selectedRoom && (
        <PriceSettingModal
          building={selectedBuilding}
          room={selectedRoom}
          roomId={BUILDING_ROOMS[selectedBuilding]?.find(r => r.name === selectedRoom)?.roomId}
          selectedDates={selectedDates}
          currentPrices={roomPrices[BUILDING_ROOMS[selectedBuilding]?.find(r => r.name === selectedRoom)?.roomId]}
          onClose={() => setShowPriceModal(false)}
          onSave={() => {
            setSelectedDates([]);
            setSelectedRoom(null);
            fetchPrices();
          }}
        />
      )}

      {/* 헤더 */}
      <div className="dashboard-header">
        <h2 className="page-title">📅 객실 캘린더</h2>
      </div>

      {/* 건물 탭 */}
      <div style={{
        display: "flex",
        gap: "8px",
        marginBottom: "20px",
        overflowX: "auto",
        paddingBottom: "8px"
      }}>
        {BUILDING_ORDER.map(building => (
          <button
            key={building}
            onClick={() => setSelectedBuilding(building)}
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              border: "none",
              background: selectedBuilding === building ? "#0071E3" : "#E5E5EA",
              color: selectedBuilding === building ? "white" : "#1D1D1F",
              fontWeight: "600",
              fontSize: "14px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.2s",
              boxShadow: selectedBuilding === building ? "0 4px 12px rgba(0,113,227,0.3)" : "none"
            }}
          >
            {building}
          </button>
        ))}
      </div>

      {/* 가격 모드 툴바 */}
      {priceMode && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          background: "#FFF8E1",
          padding: "14px 20px",
          borderRadius: "12px",
          border: "1px solid #FFE082"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>💰</span>
            <div>
              <div style={{ fontWeight: "700", color: "#1D1D1F", fontSize: "14px" }}>
                가격 설정 모드
              </div>
              <div style={{ fontSize: "12px", color: "#86868B" }}>
                {selectedRoom
                  ? `${selectedRoom} - ${selectedDates.length}일 선택됨`
                  : "날짜를 클릭하여 선택하세요"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {selectedDates.length > 0 && (
              <>
                <button
                  onClick={() => { setSelectedDates([]); setSelectedRoom(null); }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #E5E5EA",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "13px"
                  }}
                >
                  선택 취소
                </button>
                <button
                  onClick={openPriceModal}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#FF9500",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: "700",
                    fontSize: "13px"
                  }}
                >
                  가격 설정
                </button>
              </>
            )}
            <button
              onClick={togglePriceMode}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: "#FF3B30",
                color: "white",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "13px"
              }}
            >
              종료
            </button>
          </div>
        </div>
      )}

      {/* 월 네비게이션 */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "20px",
        background: "white",
        padding: "16px 20px",
        borderRadius: "16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
      }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={goToPrevMonth}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #E5E5EA",
              background: "white",
              cursor: "pointer",
              fontWeight: "600"
            }}
          >
            ← 이전
          </button>
          <button
            onClick={goToToday}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: "#34C759",
              color: "white",
              cursor: "pointer",
              fontWeight: "600"
            }}
          >
            오늘
          </button>
          <button
            onClick={goToNextMonth}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #E5E5EA",
              background: "white",
              cursor: "pointer",
              fontWeight: "600"
            }}
          >
            다음 →
          </button>
          {!priceMode && (
            <button
              onClick={togglePriceMode}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: "#FF9500",
                color: "white",
                cursor: "pointer",
                fontWeight: "600",
                marginLeft: "8px"
              }}
            >
              💰 가격 설정
            </button>
          )}
        </div>
        <div
          onClick={() => setShowMonthPicker(true)}
          style={{
            fontSize: "20px",
            fontWeight: "700",
            color: "#1D1D1F",
            cursor: "pointer",
            padding: "8px 16px",
            borderRadius: "10px",
            transition: "background 0.2s"
          }}
          onMouseEnter={(e) => e.target.style.background = "#F2F2F7"}
          onMouseLeave={(e) => e.target.style.background = "transparent"}
        >
          {year}년 {month + 1}월 ▼
        </div>
        <div style={{ display: "flex", gap: "12px", fontSize: "12px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: PLATFORM_COLORS.Airbnb }}></span>
            Airbnb
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: PLATFORM_COLORS.Booking }}></span>
            Booking
          </span>
        </div>
      </div>

      {/* 캘린더 그리드 */}
      <div style={{
        background: "white",
        borderRadius: "16px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        overflow: "hidden",
        marginBottom: "24px"
      }}>
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#86868B" }}>
            데이터를 불러오는 중...
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: "1200px" }}>
              {/* 날짜 헤더 */}
              <div style={{
                display: "flex",
                borderBottom: "2px solid #E5E5EA",
                background: "#F9F9F9"
              }}>
                <div style={{
                  width: "100px",
                  minWidth: "100px",
                  padding: "12px",
                  fontWeight: "700",
                  fontSize: "13px",
                  color: "#86868B",
                  borderRight: "1px solid #E5E5EA"
                }}>
                  객실
                </div>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const date = new Date(year, month, day);
                  const dayOfWeek = date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const isToday = new Date().toDateString() === date.toDateString();

                  return (
                    <div
                      key={day}
                      style={{
                        flex: 1,
                        minWidth: "36px",
                        padding: "8px 4px",
                        textAlign: "center",
                        fontSize: "12px",
                        fontWeight: isToday ? "700" : "500",
                        color: isToday ? "#0071E3" : isWeekend ? "#FF3B30" : "#1D1D1F",
                        background: isToday ? "#E8F2FF" : "transparent",
                        borderRight: "1px solid #F2F2F7"
                      }}
                    >
                      <div>{day}</div>
                      <div style={{ fontSize: "10px", color: "#86868B" }}>
                        {["일", "월", "화", "수", "목", "금", "토"][dayOfWeek]}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 객실 행 */}
              {rooms.map((room, roomIndex) => (
                <div
                  key={room}
                  style={{
                    display: "flex",
                    borderBottom: "1px solid #F2F2F7",
                    minHeight: priceMode ? "52px" : "44px",
                    position: "relative"
                  }}
                >
                  <div style={{
                    width: "100px",
                    minWidth: "100px",
                    padding: "12px",
                    fontWeight: "600",
                    fontSize: "13px",
                    color: "#1D1D1F",
                    borderRight: "1px solid #E5E5EA",
                    background: "#FAFAFA",
                    display: "flex",
                    alignItems: "center"
                  }}>
                    {room}
                  </div>
                  <div style={{
                    flex: 1,
                    position: "relative",
                    display: "flex"
                  }}>
                    {/* 날짜 셀 배경 */}
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const date = new Date(year, month, day);
                      const isToday = new Date().toDateString() === date.toDateString();
                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isSelected = selectedRoom === room && selectedDates.includes(dateStr);

                      // 해당 날짜에 예약이 있는지 확인
                      const hasReservation = roomReservations[room]?.some(r => {
                        if (!r.arrival || !r.departure) return false;
                        return dateStr >= r.arrival && dateStr < r.departure;
                      });

                      // 과거 날짜인지 확인
                      const todayDate = new Date();
                      todayDate.setHours(0, 0, 0, 0);
                      const isPastDate = date < todayDate;

                      // 가격 정보 가져오기
                      const roomInfo = BUILDING_ROOMS[selectedBuilding]?.find(r => r.name === room);
                      const roomPriceData = roomInfo ? roomPrices[roomInfo.roomId] : null;
                      const dateKey = dateStr.replace(/-/g, "");
                      const priceInfo = roomPriceData?.dates?.[dateKey];
                      // Airbnb = p1 또는 p3 (동일값, 기본가), Booking = p2, p4 = Agoda (무시)
                      const airbnbPrice = parseFloat(priceInfo?.p1) || parseFloat(priceInfo?.p3) || 0;
                      const bookingPrice = parseFloat(priceInfo?.p2) || 0;

                      // 디버깅 - 모든 가격 필드 확인 (첫 번째 셀만)
                      if (priceMode && day === 15 && room === rooms[0]) {
                        console.log(`💰 [${selectedBuilding}/${room}/${dateKey}] 전체 가격 필드:`, priceInfo);
                        console.log(`   p1=${priceInfo?.p1}, p2=${priceInfo?.p2}, p3=${priceInfo?.p3}, p4=${priceInfo?.p4}, p5=${priceInfo?.p5}`);
                      }

                      // 선택 가능한지 (예약 없고, 과거 아님)
                      const canSelect = priceMode && !hasReservation && !isPastDate;

                      return (
                        <div
                          key={day}
                          onClick={() => canSelect && handleDateCellClick(room, day)}
                          style={{
                            flex: 1,
                            minWidth: "36px",
                            borderRight: "1px solid #F5F5F7",
                            background: isSelected
                              ? "#FF950033"
                              : isToday
                                ? "#E8F2FF22"
                                : isPastDate && priceMode
                                  ? "#F0F0F0"
                                  : canSelect
                                    ? "#FAFAFA"
                                    : "transparent",
                            cursor: canSelect ? "pointer" : "default",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "background 0.15s",
                            position: "relative",
                            opacity: isPastDate && priceMode ? 0.5 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (canSelect && !isSelected) {
                              e.currentTarget.style.background = "#FF950015";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (canSelect && !isSelected) {
                              e.currentTarget.style.background = isToday ? "#E8F2FF22" : "#FAFAFA";
                            }
                          }}
                          title={priceMode && airbnbPrice ? `Airbnb: ¥${airbnbPrice.toLocaleString()}\nBooking: ¥${bookingPrice.toLocaleString()} (자동연동)` : (isPastDate && priceMode ? "과거 날짜는 수정할 수 없습니다" : "")}
                        >
                          {/* 가격 표시 (가격 모드이고 예약이 없을 때) */}
                          {priceMode && !hasReservation && airbnbPrice > 0 && (
                            <div style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "1px",
                              position: "absolute",
                              top: "3px",
                              bottom: "3px",
                              justifyContent: "center"
                            }}>
                              <span style={{ fontSize: "8px", color: "#FF385C", fontWeight: "600" }}>
                                A:{Math.round(airbnbPrice / 1000)}k
                              </span>
                              {bookingPrice > 0 && (
                                <span style={{ fontSize: "7px", color: "#003580", fontWeight: "500" }}>
                                  B:{Math.round(bookingPrice / 1000)}k
                                </span>
                              )}
                            </div>
                          )}
                          {/* 선택 체크 표시 */}
                          {isSelected && (
                            <span style={{
                              fontSize: "12px",
                              color: "#FF9500",
                              fontWeight: "700",
                              position: "absolute"
                            }}>
                              ✓
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* 예약 바 */}
                    {roomReservations[room]?.map(reservation =>
                      renderReservationBar(reservation, roomIndex)
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 건물 분석 섹션 */}
      <div style={{ marginBottom: "20px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px", color: "#1D1D1F" }}>
          📊 {selectedBuilding} 분석
        </h3>
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div className="kpi-card">
            <div className="kpi-label">이번달 가동률</div>
            <div className="kpi-value" style={{ color: "#0071E3" }}>{analysis.occupancyRate}%</div>
            <div className="kpi-sub">예약된 객실일 / 전체 객실일</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">오늘 빈방</div>
            <div className="kpi-value" style={{ color: analysis.emptyRoomsToday > 0 ? "#FF9500" : "#34C759" }}>
              {analysis.emptyRoomsToday}개
            </div>
            <div className="kpi-sub">총 {rooms.length}개 객실 중</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">평균 단가</div>
            <div className="kpi-value" style={{ color: "#5856D6" }}>{formatPrice(analysis.avgPrice)}</div>
            <div className="kpi-sub">1박당 순수익 기준</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">이번달 예상 순수익</div>
            <div className="kpi-value" style={{ color: "#34C759" }}>{formatPrice(analysis.totalRevenue)}</div>
            <div className="kpi-sub">예약 {analysis.totalReservations}건</div>
          </div>
        </div>
      </div>

      {/* 범례 */}
      <div style={{
        background: "white",
        padding: "16px 20px",
        borderRadius: "12px",
        display: "flex",
        gap: "24px",
        fontSize: "13px",
        color: "#86868B"
      }}>
        <span>예약 바를 클릭하면 상세 정보를 볼 수 있습니다</span>
        <span>|</span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "16px", height: "16px", borderRadius: "4px", background: PLATFORM_COLORS.Airbnb }}></span>
          Airbnb
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "16px", height: "16px", borderRadius: "4px", background: PLATFORM_COLORS.Booking }}></span>
          Booking
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "16px", height: "16px", borderRadius: "4px", background: PLATFORM_COLORS.Expedia }}></span>
          Expedia
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "16px", height: "16px", borderRadius: "4px", background: PLATFORM_COLORS.Agoda }}></span>
          Agoda
        </span>
      </div>
    </div>
  );
}

export default BuildingCalendar;
