import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { BUILDING_DATA } from '../constants/buildingData';

function AddCancellation() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedBuilding, setSelectedBuilding] = useState("아라키초A");
  const [selectedRoom, setSelectedRoom] = useState(BUILDING_DATA["아라키초A"][0]);
  const [platform, setPlatform] = useState('Airbnb');

  const handleBuildingChange = (e) => {
    const building = e.target.value;
    setSelectedBuilding(building);
    setSelectedRoom(BUILDING_DATA[building][0]); 
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if(!window.confirm("⚠️ 정말 '취소 건'으로 등록하시겠습니까?")) return;

    try {
      await addDoc(collection(db, "reservations"), {
        date: date,
        building: selectedBuilding,
        room: selectedRoom,
        platform: platform,
        status: "cancelled", // ★ 취소 상태로 저장
        createdAt: new Date()
      });
      alert("🗑️ 취소 기록이 저장되었습니다.");
    } catch (error) {
      console.error("Error:", error);
      alert("저장 실패");
    }
  };

  const inputStyle = { padding: '10px', fontSize: '16px', borderRadius: '5px', border: '1px solid #ccc' };
  const labelStyle = { fontWeight: 'bold', marginTop: '15px', marginBottom: '5px', display: 'block' };

  return (
    <div style={{ padding: '20px', border: '2px solid #dc3545', borderRadius: '10px', backgroundColor: '#fff5f5' }}>
      <h2 style={{ color: '#dc3545', marginTop: 0 }}>❌ 취소 발생 기록</h2>
      <p style={{ color: '#666' }}>취소된 예약 정보를 입력하세요. (자동으로 취소율에 반영됩니다)</p>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
        <label style={labelStyle}>취소 확정 날짜</label>
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

        <label style={labelStyle}>건물 선택</label>
        <select style={inputStyle} value={selectedBuilding} onChange={handleBuildingChange}>
          {Object.keys(BUILDING_DATA).map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <label style={labelStyle}>객실 선택</label>
        <select style={inputStyle} value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
          {BUILDING_DATA[selectedBuilding].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <label style={labelStyle}>플랫폼</label>
        <select style={inputStyle} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="Airbnb">에어비앤비</option>
          <option value="Booking">부킹닷컴</option>
        </select>

        <button type="submit" style={{ marginTop: '25px', padding: '15px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', cursor: 'pointer' }}>
          취소 등록하기
        </button>
      </form>
    </div>
  );
}

export default AddCancellation;