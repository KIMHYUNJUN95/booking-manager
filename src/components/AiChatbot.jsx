import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from '../firebase';
import dayjs from 'dayjs';
import axios from 'axios';

function AiChatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("글로벌 인텔리전스 데이터 수집 중...");

  // ⚠️ 중요: 실제 운영 시 환경변수로 이동 필요
  const API_KEY = process.env.REACT_APP_OPENAI_API_KEY || "YOUR_OPENAI_API_KEY";
  const WEATHER_API_KEY = process.env.REACT_APP_WEATHER_API_KEY || "YOUR_WEATHER_API_KEY";
  const NEWS_API_KEY = process.env.REACT_APP_NEWS_API_KEY || "YOUR_NEWS_API_KEY";

  const messagesEndRef = useRef(null);
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages]);

  // ========================================
  // 외부 데이터 수집 함수들
  // ========================================

  // 1. 환율 데이터 (무료 API - 키 불필요)
  const fetchExchangeRates = async () => {
    try {
      const response = await axios.get('https://api.exchangerate-api.com/v4/latest/JPY');
      const rates = response.data.rates;
      return {
        USD_JPY: (1 / rates.USD).toFixed(2),
        KRW_JPY: (1 / rates.KRW).toFixed(4),
        CNY_JPY: (1 / rates.CNY).toFixed(3),
        TWD_JPY: (1 / rates.TWD).toFixed(3),
        EUR_JPY: (1 / rates.EUR).toFixed(2),
        updated: response.data.date
      };
    } catch (err) {
      console.error("환율 API 오류:", err);
      return null;
    }
  };

  // 2. 날씨 데이터 (OpenWeatherMap)
  const fetchWeather = async () => {
    if (!WEATHER_API_KEY || WEATHER_API_KEY === "YOUR_WEATHER_API_KEY") {
      return {
        current: "API 키 필요",
        forecast: [],
        note: "OpenWeatherMap API 키를 설정하세요"
      };
    }
    try {
      // 신주쿠 좌표
      const lat = 35.6938;
      const lon = 139.7034;
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric&lang=ja`
      );

      const current = response.data.list[0];
      const forecast = response.data.list.filter((_, i) => i % 8 === 0).slice(0, 5).map(item => ({
        date: dayjs(item.dt * 1000).format('MM/DD'),
        temp: Math.round(item.main.temp),
        weather: item.weather[0].description,
        icon: item.weather[0].main
      }));

      return {
        current: {
          temp: Math.round(current.main.temp),
          weather: current.weather[0].description,
          humidity: current.main.humidity
        },
        forecast,
        note: null
      };
    } catch (err) {
      console.error("날씨 API 오류:", err);
      return null;
    }
  };

  // 3. 뉴스 데이터 (NewsAPI)
  const fetchNews = async () => {
    if (!NEWS_API_KEY || NEWS_API_KEY === "YOUR_NEWS_API_KEY") {
      // API 키 없을 때 대체 데이터 (최신 트렌드 기반)
      return {
        articles: [
          { title: "일본 인바운드 관광객 코로나 이전 수준 회복", source: "트렌드 정보" },
          { title: "엔저 지속으로 아시아 관광객 증가세", source: "트렌드 정보" },
          { title: "신주쿠 골든가이, 외국인 관광 명소로 인기", source: "트렌드 정보" }
        ],
        note: "NewsAPI 키를 설정하면 실시간 뉴스를 받아볼 수 있습니다"
      };
    }
    try {
      const response = await axios.get(
        `https://newsapi.org/v2/everything?q=일본 관광 OR Japan tourism OR 인바운드&language=ko&sortBy=publishedAt&pageSize=5&apiKey=${NEWS_API_KEY}`
      );
      return {
        articles: response.data.articles.map(a => ({
          title: a.title,
          source: a.source.name,
          url: a.url,
          publishedAt: a.publishedAt
        })),
        note: null
      };
    } catch (err) {
      console.error("뉴스 API 오류:", err);
      return null;
    }
  };

  // 4. 일본 이벤트/축제 데이터 (커스텀 DB)
  const getUpcomingEvents = () => {
    const today = dayjs();

    // 도쿄/신주쿠 주요 이벤트 데이터베이스
    const events = [
      // 연간 고정 이벤트
      { name: "설날 연휴", start: `${today.year()}-12-29`, end: `${today.year() + 1}-01-03`, impact: "very_high", type: "holiday", description: "일본 최대 연휴, 국내외 여행 급증" },
      { name: "설날 연휴", start: `${today.year()}-01-01`, end: `${today.year()}-01-03`, impact: "very_high", type: "holiday", description: "일본 최대 연휴" },
      { name: "성인의 날 연휴", start: `${today.year()}-01-06`, end: `${today.year()}-01-08`, impact: "medium", type: "holiday", description: "3연휴" },
      { name: "밸런타인데이", start: `${today.year()}-02-14`, end: `${today.year()}-02-14`, impact: "low", type: "event", description: "커플 여행 소폭 증가" },
      { name: "골든위크", start: `${today.year()}-04-29`, end: `${today.year()}-05-05`, impact: "very_high", type: "holiday", description: "일본 대형 연휴, 예약 폭증" },
      { name: "칠석 (타나바타)", start: `${today.year()}-07-07`, end: `${today.year()}-07-07`, impact: "low", type: "festival", description: "도쿄 각지 축제" },
      { name: "오봉 연휴", start: `${today.year()}-08-11`, end: `${today.year()}-08-16`, impact: "very_high", type: "holiday", description: "여름 대형 연휴" },
      { name: "핼러윈", start: `${today.year()}-10-28`, end: `${today.year()}-10-31`, impact: "high", type: "event", description: "시부야/신주쿠 코스프레 인파" },
      { name: "크리스마스", start: `${today.year()}-12-23`, end: `${today.year()}-12-25`, impact: "high", type: "holiday", description: "커플/가족 여행 증가" },

      // 정기 이벤트
      { name: "코믹마켓 C103 (겨울)", start: `${today.year()}-12-28`, end: `${today.year()}-12-31`, impact: "high", type: "event", description: "빅사이트, 오타쿠 고객 급증" },
      { name: "코믹마켓 C104 (여름)", start: `${today.year()}-08-10`, end: `${today.year()}-08-13`, impact: "high", type: "event", description: "빅사이트, 오타쿠 고객 급증" },

      // 신주쿠 지역 이벤트
      { name: "신주쿠 에이사 축제", start: `${today.year()}-07-27`, end: `${today.year()}-07-27`, impact: "medium", type: "festival", description: "신주쿠 거리 오키나와 축제" },
      { name: "도쿄 마라톤", start: `${today.year()}-03-03`, end: `${today.year()}-03-03`, impact: "medium", type: "event", description: "신주쿠 출발, 러너 숙박 수요" },

      // 벚꽃/단풍 시즌
      { name: "벚꽃 시즌", start: `${today.year()}-03-20`, end: `${today.year()}-04-10`, impact: "very_high", type: "season", description: "신주쿠교엔 벚꽃, 최대 성수기" },
      { name: "단풍 시즌", start: `${today.year()}-11-15`, end: `${today.year()}-12-05`, impact: "high", type: "season", description: "가을 관광 성수기" },
    ];

    // 향후 30일 이내 이벤트 필터링
    const upcoming = events.filter(event => {
      const start = dayjs(event.start);
      const end = dayjs(event.end);
      const daysUntilStart = start.diff(today, 'day');
      const daysUntilEnd = end.diff(today, 'day');

      // 진행 중이거나 30일 이내 시작
      return (daysUntilEnd >= 0 && daysUntilStart <= 30);
    }).map(event => {
      const start = dayjs(event.start);
      const daysUntil = start.diff(today, 'day');
      return {
        ...event,
        daysUntil: daysUntil < 0 ? 0 : daysUntil,
        status: daysUntil <= 0 ? "진행중" : `${daysUntil}일 후`
      };
    }).sort((a, b) => a.daysUntil - b.daysUntil);

    return upcoming;
  };

  // 5. 인바운드 통계 (JNTO 공개 데이터 기반 추정)
  const getInboundStats = () => {
    // JNTO 최신 공개 데이터 기반 (월별 업데이트 필요)
    const monthlyTrends = {
      1: { total: 2800000, kr: 28, cn: 25, tw: 15, us: 8, trend: "보통" },
      2: { total: 2600000, kr: 27, cn: 26, tw: 14, us: 8, trend: "비수기" },
      3: { total: 3100000, kr: 26, cn: 24, tw: 15, us: 9, trend: "벚꽃시즌 시작" },
      4: { total: 3500000, kr: 25, cn: 23, tw: 16, us: 10, trend: "벚꽃 피크" },
      5: { total: 3200000, kr: 26, cn: 24, tw: 15, us: 9, trend: "골든위크" },
      6: { total: 2900000, kr: 27, cn: 25, tw: 14, us: 8, trend: "장마철" },
      7: { total: 3300000, kr: 28, cn: 24, tw: 15, us: 9, trend: "여름방학" },
      8: { total: 3400000, kr: 29, cn: 23, tw: 16, us: 9, trend: "오봉" },
      9: { total: 2800000, kr: 28, cn: 24, tw: 15, us: 8, trend: "비수기" },
      10: { total: 3200000, kr: 27, cn: 25, tw: 15, us: 9, trend: "단풍시작" },
      11: { total: 3400000, kr: 26, cn: 26, tw: 16, us: 9, trend: "단풍피크" },
      12: { total: 3600000, kr: 28, cn: 25, tw: 15, us: 10, trend: "연말" }
    };

    const currentMonth = dayjs().month() + 1;
    const data = monthlyTrends[currentMonth];

    return {
      estimatedMonthly: data.total,
      topCountries: [
        { country: "한국", percentage: data.kr, flag: "🇰🇷" },
        { country: "중국", percentage: data.cn, flag: "🇨🇳" },
        { country: "대만", percentage: data.tw, flag: "🇹🇼" },
        { country: "미국", percentage: data.us, flag: "🇺🇸" }
      ],
      trend: data.trend,
      source: "JNTO 통계 기반 추정"
    };
  };

  // ========================================
  // 메인 브리핑 생성
  // ========================================
  useEffect(() => {
    const generateMegaBriefing = async () => {
      const todayStr = dayjs().format('YYYY-MM-DD');
      const cachedBriefing = sessionStorage.getItem('haru_ultimate_briefing');
      const cachedDate = sessionStorage.getItem('haru_briefing_date');

      if (cachedBriefing && cachedDate === todayStr) {
        setMessages([{ role: 'assistant', text: cachedBriefing }]);
        return;
      }

      setLoading(true);

      try {
        // 1단계: 내부 데이터 수집
        setStatusMsg("📊 내부 예약 데이터 분석 중...");
        const q = query(collection(db, "reservations"), where("status", "==", "confirmed"));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => doc.data());

        const getStats = (mStr) => {
          const list = data.filter(r => r.arrival && r.arrival.startsWith(mStr));
          const rev = list.reduce((s, r) => s + (Number(r.price || r.totalPrice) || 0), 0);
          const nations = list.reduce((acc, r) => {
            const n = r.nationality || 'Unknown';
            acc[n] = (acc[n] || 0) + 1;
            return acc;
          }, {});
          return { rev, count: list.length, adr: list.length > 0 ? (rev / list.length).toFixed(0) : 0, nations };
        };

        const internalStats = {
          last: getStats(dayjs().subtract(1, 'month').format('YYYY-MM')),
          current: getStats(dayjs().format('YYYY-MM')),
          future: getStats(dayjs().add(1, 'month').format('YYYY-MM'))
        };

        // 2단계: 외부 데이터 수집 (병렬)
        setStatusMsg("🌐 글로벌 경제/관광 데이터 수집 중...");
        const [exchangeRates, weather, news] = await Promise.all([
          fetchExchangeRates(),
          fetchWeather(),
          fetchNews()
        ]);

        // 이벤트 및 인바운드 데이터
        const events = getUpcomingEvents();
        const inbound = getInboundStats();

        // 3단계: AI 브리핑 생성
        setStatusMsg("🤖 AI 분석 보고서 작성 중...");

        const systemPrompt = `
당신은 신주쿠 'HARU' 민박 그룹의 수석 전략 이사이자, 사장님의 전담 비즈니스 코치입니다.
오늘 날짜: ${todayStr}
지역: 도쿄 신주쿠

[브리핑 구성 - 반드시 아래 순서와 형식을 따르세요]

## 📊 오늘의 핵심 인사이트
(가장 중요한 3가지를 불렛포인트로)

## 💱 경제 환경 분석
환율 데이터: ${JSON.stringify(exchangeRates)}
- 엔화 강세/약세가 각 국가 고객에게 미치는 영향
- 어떤 국가 타겟 마케팅이 유리한지

## 🌤️ 날씨 & 운영 제안
날씨 데이터: ${JSON.stringify(weather)}
- 날씨에 따른 고객 응대 팁
- 준비해야 할 것들

## 📅 다가오는 이벤트
이벤트 데이터: ${JSON.stringify(events)}
- 각 이벤트가 예약에 미치는 영향
- 대비해야 할 사항

## ✈️ 인바운드 동향
인바운드 데이터: ${JSON.stringify(inbound)}
- 현재 시즌 관광객 트렌드
- 주요 고객층 특성

## 📰 관광업계 뉴스
뉴스 데이터: ${JSON.stringify(news)}
- 사업에 영향을 줄 수 있는 뉴스 해석

## 📈 내부 실적 분석
내부 데이터: ${JSON.stringify(internalStats)}
- 전월 대비 변화 분석
- 다음 달 전망

## 🎯 오늘의 액션 아이템
(구체적으로 실행할 수 있는 3-5가지)

[작성 스타일]
- 이모지를 적절히 사용하여 가독성 높이기
- 전문 용어는 쉽게 풀어서 설명
- "왜" 그런지 인과관계를 설명
- 구체적인 숫자와 함께 제안
- 사장님이 바로 실행할 수 있는 액션 중심
`;

        const response = await axios.post("https://api.openai.com/v1/chat/completions", {
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "오늘의 종합 비즈니스 인텔리전스 브리핑을 작성해주세요." }
          ],
          temperature: 0.6,
          max_tokens: 3000
        }, {
          headers: { Authorization: `Bearer ${API_KEY}` }
        });

        const briefingText = response.data.choices[0].message.content;
        sessionStorage.setItem('haru_ultimate_briefing', briefingText);
        sessionStorage.setItem('haru_briefing_date', todayStr);
        setMessages([{ role: 'assistant', text: briefingText }]);

      } catch (err) {
        console.error("브리핑 생성 오류:", err);
        setMessages([{
          role: 'assistant',
          text: `❌ 브리핑 생성 중 오류가 발생했습니다.\n\n오류: ${err.message}\n\n새로고침하거나 잠시 후 다시 시도해주세요.`
        }]);
      } finally {
        setLoading(false);
      }
    };

    generateMegaBriefing();
  }, []);

  // ========================================
  // 후속 대화 처리
  // ========================================
  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input;
    const newMessages = [...messages, { role: 'user', text: userMsg }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // 시스템 프롬프트 유지
      const systemContext = `
당신은 HARU 민박의 AI 비즈니스 어시스턴트입니다.
사장님의 후속 질문에 친절하고 상세하게 답변하세요.
데이터에 기반한 구체적인 조언을 제공하세요.
      `;

      const response = await axios.post("https://api.openai.com/v1/chat/completions", {
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemContext },
          ...newMessages.map(m => ({ role: m.role, content: m.text }))
        ],
        temperature: 0.7
      }, {
        headers: { Authorization: `Bearer ${API_KEY}` }
      });

      setMessages([...newMessages, { role: 'assistant', text: response.data.choices[0].message.content }]);
    } catch (err) {
      console.error("대화 오류:", err);
      setMessages([...newMessages, { role: 'assistant', text: `❌ 오류: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // 브리핑 새로고침
  const handleRefresh = () => {
    sessionStorage.removeItem('haru_ultimate_briefing');
    sessionStorage.removeItem('haru_briefing_date');
    window.location.reload();
  };

  return (
    <div className="dashboard-content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div className="dashboard-header">
        <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📡</span> HARU 인텔리전스 상황실
        </h2>
        <button
          onClick={handleRefresh}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid #ddd',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          🔄 브리핑 새로고침
        </button>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px',
        background: '#fcfcfc',
        borderRadius: '24px',
        marginBottom: '16px',
        border: '1px solid #eee'
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: '50px' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px', animation: 'pulse 2s infinite' }}>📡</div>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '10px' }}>{statusMsg}</p>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              maxWidth: '400px',
              margin: '0 auto'
            }}>
              {['환율', '날씨', '뉴스', '이벤트', '인바운드'].map((item, i) => (
                <span key={i} style={{
                  padding: '4px 12px',
                  background: '#f0f0f0',
                  borderRadius: '20px',
                  fontSize: '12px',
                  color: '#666'
                }}>
                  {item} 수집중...
                </span>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ textAlign: msg.role === 'user' ? 'right' : 'left', margin: '20px 0' }}>
            <div style={{
              display: 'inline-block',
              padding: '20px 24px',
              borderRadius: '20px',
              background: msg.role === 'user' ? '#0071E3' : '#fff',
              color: msg.role === 'user' ? '#fff' : '#1D1D1F',
              maxWidth: '90%',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.8',
              boxShadow: msg.role === 'assistant' ? '0 10px 30px rgba(0,0,0,0.08)' : 'none',
              border: msg.role === 'assistant' ? '1px solid #efefef' : 'none',
              fontSize: '15px',
              textAlign: 'left'
            }}>
              {msg.text}
            </div>
          </div>
        ))}

        {loading && messages.length > 0 && (
          <div style={{
            color: '#0071E3',
            fontWeight: 'bold',
            textAlign: 'center',
            fontSize: '13px',
            padding: '20px'
          }}>
            🔄 분석 중...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{
        display: 'flex',
        gap: '10px',
        background: '#fff',
        padding: '12px',
        borderRadius: '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
      }}>
        <input
          className="form-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="전략에 대해 더 궁금한 점을 물어보세요..."
          style={{
            flex: 1,
            marginBottom: 0,
            border: 'none',
            background: '#f4f4f7',
            borderRadius: '15px',
            padding: '14px'
          }}
        />
        <button
          className="btn-primary"
          onClick={handleSend}
          disabled={loading}
          style={{
            width: '70px',
            borderRadius: '15px',
            background: loading ? '#ccc' : '#0071E3'
          }}
        >
          전송
        </button>
      </div>

      {/* 데이터 소스 표시 */}
      <div style={{
        marginTop: '12px',
        padding: '12px',
        background: '#f8f8f8',
        borderRadius: '12px',
        fontSize: '11px',
        color: '#999',
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        flexWrap: 'wrap'
      }}>
        <span>💱 ExchangeRate API</span>
        <span>🌤️ OpenWeatherMap</span>
        <span>📰 NewsAPI</span>
        <span>📅 이벤트 DB</span>
        <span>✈️ JNTO 통계</span>
      </div>
    </div>
  );
}

export default AiChatbot;
