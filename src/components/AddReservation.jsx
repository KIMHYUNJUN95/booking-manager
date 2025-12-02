import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { BUILDING_DATA } from '../constants/buildingData';

function AddReservation() {
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
    
    // 확인 창
    if(!window.confirm(`${date}\n${selectedBuilding} ${selectedRoom}\n${platform}\n\n이대로 저장하시겠습니까?`)) return;

    try {
      await addDoc(collection(db, "reservations"), {
        date: date,
        building: selectedBuilding,
        room: selectedRoom,
        platform: platform,
        status: "confirmed", // 예약 확정 상태
        createdAt: new Date()
      });
      alert("✅ 저장되었습니다!");
    } catch (error) {
      console.error("Error:", error);
      alert("❌ 저장 실패: " + error.message);
    }
  };

  const inputStyle = { padding: '10px', fontSize: '16px', borderRadius: '5px', border: '1px solid #ccc' };
  const labelStyle = { fontWeight: 'bold', marginTop: '15px', marginBottom: '5px', display: 'block' };

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
      <h2 style={{ color: '#007bff', marginTop: 0 }}>📝 새 예약 입력</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
        
        <label style={labelStyle}>날짜 (예약 들어온 날)</label>
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

        <label style={labelStyle}>예약 경로</label>
        <select style={inputStyle} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="Airbnb">에어비앤비 (Airbnb)</option>
          <option value="Booking">부킹닷컴 (Booking)</option>
        </select>

        <button type="submit" style={{ marginTop: '25px', padding: '15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', cursor: 'pointer' }}>
          저장하기
        </button>
      </form>
    </div>
  );
}

export default AddReservation;