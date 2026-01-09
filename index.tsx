
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---
type Difficulty = 'Elementary' | 'Pre-Intermediate' | 'Intermediate' | 'Upper-Intermediate' | 'Advanced';

interface Example {
  english: string;
  korean: string;
  meaning: string;
  grammar: string;
}

interface WordData {
  word: string;
  examples: Example[];
}

const App: React.FC = () => {
  const [difficulty, setDifficulty] = useState<Difficulty>('Intermediate');
  const [currentWord, setCurrentWord] = useState<string>("");
  const [wordData, setWordData] = useState<WordData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [userInput, setUserInput] = useState<string>("");
  const [practiceTexts, setPracticeTexts] = useState<string[]>(new Array(10).fill(""));
  const [hiddenStates, setHiddenStates] = useState<boolean[]>(new Array(10).fill(false));
  const [feedbackTexts, setFeedbackTexts] = useState<string[]>(new Array(10).fill(""));
  const [fetchingFeedback, setFetchingFeedback] = useState<boolean[]>(new Array(10).fill(false));
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [copyStatus, setCopyStatus] = useState<string>("");
  const [apiStatus, setApiStatus] = useState<'IDLE' | 'ERROR' | 'OK'>('IDLE');

  const getAi = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  };

  const wordPool: Record<Difficulty, string[]> = {
    Elementary: ["Water", "Bread", "Friend", "School", "Family", "Happy", "Small", "Color", "Sleep", "Animal"],
    'Pre-Intermediate': ["Journey", "Village", "Support", "Common", "Simple", "Believe", "Future", "Important", "Success", "Reason"],
    Intermediate: ["Persistent", "Resilience", "Eloquent", "Meticulous", "Ambiguous", "Vibrant", "Pragmatic", "Inevitably", "Compromise", "Paradigm"],
    'Upper-Intermediate': ["Authentic", "Dilemma", "Eloquent", "Incentive", "Plausible", "Substantial", "Versatile", "Widespread", "Yield", "Advocate"],
    Advanced: ["Ephemeral", "Ubiquitous", "Deleterious", "Obfuscate", "Pragmatic", "Quixotic", "Surreptitious", "Vicarious", "Zealous", "Equanimity"]
  };

  useEffect(() => {
    if (!process.env.API_KEY) {
      setApiStatus('ERROR');
    } else {
      setApiStatus('OK');
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    handleAutoRecommend('Intermediate');
  }, []);

  const handleCopyLink = () => {
    const url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopyStatus("주소가 복사되었습니다!");
        setTimeout(() => setCopyStatus(""), 2000);
      }).catch(() => {
        alert("복사 실패. 주소창의 링크를 직접 복제해주세요.");
      });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopyStatus("주소가 복사되었습니다!");
        setTimeout(() => setCopyStatus(""), 2000);
      } catch (err) {
        alert("복사 실패.");
      }
      document.body.removeChild(textArea);
    }
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      alert("스마트폰 브라우저 메뉴의 '홈 화면에 추가'를 이용하시면 APK 설치와 동일하게 사용 가능합니다!");
    }
  };

  const fetchWordDetails = async (word: string, currentDiff: Difficulty = difficulty) => {
    const ai = getAi();
    if (!ai) {
      alert("API 키가 유효하지 않습니다.");
      return;
    }

    setLoading(true);
    setPracticeTexts(new Array(10).fill(""));
    setHiddenStates(new Array(10).fill(false));
    setFeedbackTexts(new Array(10).fill(""));

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `English word: "${word}". Difficulty Level: "${currentDiff}".
        Task: Provide 10 VERY SHORT and CONCISE example sentences (max 10 words per sentence).
        Output Format: JSON { "word": string, "examples": [{ "english": string, "korean": string, "meaning": string, "grammar": string }] }
        Guidelines: Use natural daily expressions. Keep 'meaning' (context) and 'grammar' (tip) brief in Korean.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              examples: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    english: { type: Type.STRING },
                    korean: { type: Type.STRING },
                    meaning: { type: Type.STRING },
                    grammar: { type: Type.STRING },
                  },
                  required: ["english", "korean", "meaning", "grammar"],
                },
              },
            },
            required: ["word", "examples"],
          },
        },
      });

      const data = JSON.parse(response.text) as WordData;
      setWordData(data);
      setCurrentWord(data.word);
    } catch (error) {
      console.error("Fetch error:", error);
      alert("문장 생성에 실패했습니다. 단어를 직접 입력해 보거나 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const requestFeedback = async (index: number) => {
    const ai = getAi();
    if (!ai || !wordData || !practiceTexts[index]) return;

    const newFetching = [...fetchingFeedback];
    newFetching[index] = true;
    setFetchingFeedback(newFetching);

    try {
      const original = wordData.examples[index].english;
      const userText = practiceTexts[index];

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Original English: "${original}"
        User's English: "${userText}"
        Identify why they are different in 1 very short Korean sentence. Focus on grammar or meaning.`,
      });

      const newFeedback = [...feedbackTexts];
      newFeedback[index] = response.text || "분석 불가";
      setFeedbackTexts(newFeedback);
    } catch (error) {
      console.error("Feedback error:", error);
    } finally {
      const finalFetching = [...fetchingFeedback];
      finalFetching[index] = false;
      setFetchingFeedback(finalFetching);
    }
  };

  const handleAutoRecommend = (diff: Difficulty = difficulty) => {
    const pool = wordPool[diff];
    const randomWord = pool[Math.floor(Math.random() * pool.length)];
    fetchWordDetails(randomWord, diff);
  };

  const toggleHidden = (index: number) => {
    const newStates = [...hiddenStates];
    newStates[index] = !newStates[index];
    setHiddenStates(newStates);
  };

  const calculateAccuracy = (original: string, input: string) => {
    if (!input.trim()) return 0;
    const clean = (str: string) => str.toLowerCase().replace(/[.,!?;:]/g, "").trim();
    const s1 = clean(original);
    const s2 = clean(input);
    if (s1 === s2) return 100;
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    let matches = 0;
    words2.forEach(word => { if (words1.includes(word)) matches++; });
    return Math.round((matches / Math.max(words1.length, words2.length)) * 100);
  };

  const difficulties: { key: Difficulty; label: string }[] = [
    { key: 'Elementary', label: '초보' },
    { key: 'Pre-Intermediate', label: '기초' },
    { key: 'Intermediate', label: '중급' },
    { key: 'Upper-Intermediate', label: '고급' },
    { key: 'Advanced', label: '심화' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 p-4 sticky top-0 z-40 flex justify-between items-center shadow-sm">
        <div className="flex flex-col">
          <h1 className="text-xl font-black text-[#6B8E23]">오늘의 단어장</h1>
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${apiStatus === 'OK' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">AI Network Connected</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCopyLink} className="bg-[#6B8E23] text-white text-[11px] font-bold px-4 py-2 rounded-full shadow-lg active:scale-95 transition-all">
            🔗 주소 복사
          </button>
          <button onClick={() => setIsGuideOpen(true)} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 font-black border border-gray-100">?</button>
        </div>
      </header>

      {copyStatus && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white text-[11px] font-bold px-6 py-2 rounded-full animate-in">
          {copyStatus}
        </div>
      )}

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-6 pb-20">
        <section className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-50 mb-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-[#6B8E23]"></div>
          
          <div className="flex justify-center mb-6 overflow-x-auto no-scrollbar py-2">
            <div className="bg-gray-100 p-1 rounded-2xl flex gap-1 min-w-max">
              {difficulties.map((level) => (
                <button
                  key={level.key}
                  onClick={() => { setDifficulty(level.key); handleAutoRecommend(level.key); }}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${difficulty === level.key ? "bg-white text-[#6B8E23] shadow-sm" : "text-gray-400"}`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          <span className="text-[10px] font-black text-[#A4C639] uppercase tracking-[0.2em] mb-3 block">{difficulty}</span>
          <h2 className="text-5xl font-black text-[#333] mb-8 lowercase italic min-h-[60px] flex items-center justify-center">
            {loading ? <div className="w-8 h-8 border-4 border-gray-100 border-t-[#6B8E23] rounded-full animate-spin"></div> : currentWord || "Ready"}
          </h2>

          <form onSubmit={(e) => { e.preventDefault(); if(userInput.trim()) fetchWordDetails(userInput.trim()); }} className="space-y-3">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="직접 단어를 입력하세요"
              className="w-full px-6 py-4 bg-[#F9F9F9] border-none rounded-2xl focus:ring-2 focus:ring-[#6B8E23] text-sm placeholder:text-gray-300"
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="submit" className="bg-[#6B8E23] text-white py-4 rounded-2xl font-black text-sm active:scale-95 transition-all">학습 시작</button>
              <button type="button" onClick={() => handleAutoRecommend()} className="bg-white text-[#6B8E23] border-2 border-[#6B8E23] py-4 rounded-2xl font-black text-sm active:scale-95 transition-all">추천 단어</button>
            </div>
          </form>
        </section>

        {!loading && wordData && (
          <div className="space-y-4">
            {wordData.examples.map((item, idx) => {
              const accuracy = calculateAccuracy(item.english, practiceTexts[idx]);
              return (
                <div key={idx} className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm animate-in" style={{animationDelay: `${idx * 0.1}s`}}>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-gray-300">EX {idx + 1}</span>
                    <button onClick={() => toggleHidden(idx)} className={`text-[10px] font-black px-4 py-2 rounded-xl ${hiddenStates[idx] ? "bg-[#6B8E23] text-white" : "bg-gray-100 text-gray-500"}`}>
                      {hiddenStates[idx] ? "정답 보기" : "가리고 외우기"}
                    </button>
                  </div>

                  <div className="mb-6 min-h-[50px]">
                    {hiddenStates[idx] ? (
                      <textarea
                        className="w-full p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl text-base focus:outline-none placeholder:text-gray-300"
                        placeholder="짧은 문장을 입력..."
                        rows={1}
                        value={practiceTexts[idx]}
                        onChange={(e) => { const nt = [...practiceTexts]; nt[idx] = e.target.value; setPracticeTexts(nt); }}
                      />
                    ) : (
                      <div className="space-y-4">
                        <p className="text-xl font-bold text-[#333] leading-snug">{item.english}</p>
                        {practiceTexts[idx] && (
                          <div className={`p-4 rounded-2xl border-2 ${accuracy === 100 ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">My Practice</span>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${accuracy === 100 ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}`}>
                                {accuracy === 100 ? 'PERFECT' : `Acc: ${accuracy}%`}
                              </span>
                            </div>
                            <p className="text-sm italic text-gray-700">"{practiceTexts[idx]}"</p>
                            {accuracy < 100 && (
                              <div className="mt-4 pt-3 border-t border-orange-100">
                                {feedbackTexts[idx] ? (
                                  <p className="text-xs text-orange-700 font-bold">💡 {feedbackTexts[idx]}</p>
                                ) : (
                                  <button onClick={() => requestFeedback(idx)} disabled={fetchingFeedback[idx]} className="text-[10px] font-black text-orange-500">
                                    {fetchingFeedback[idx] ? "분석 중..." : "🤖 틀린 이유 분석"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-5 border-t border-gray-50 space-y-3">
                    <p className="text-sm font-bold text-gray-600">{item.korean}</p>
                    <div className="flex gap-2">
                      <span className="bg-[#6B8E23]/10 text-[#6B8E23] text-[9px] font-bold px-2 py-1 rounded-md">{item.meaning}</span>
                      <span className="bg-orange-50 text-orange-600 text-[9px] font-bold px-2 py-1 rounded-md">{item.grammar}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {isGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 animate-in shadow-2xl">
            <h3 className="text-2xl font-black text-[#333] mb-6">설치 및 사용 가이드</h3>
            <div className="space-y-5 text-sm">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-[11px] font-black text-[#6B8E23] mb-1">공유용 주소:</p>
                <code className="text-[10px] break-all block text-gray-400">{window.location.href}</code>
              </div>
              <p className="text-gray-600 leading-relaxed">
                <b>1. 난이도 선택:</b> 5가지 세분화된 난이도 중 내게 맞는 수준을 골라보세요.<br/><br/>
                <b>2. 짧은 예문 학습:</b> 암기 부담을 줄이기 위해 모든 예문은 10단어 내외로 생성됩니다.<br/><br/>
                <b>3. 설치 방법:</b> 이 페이지를 스마트폰 브라우저에서 열고 <b>'홈 화면에 추가'</b>를 누르면 APK처럼 사용 가능합니다.
              </p>
            </div>
            <button onClick={() => setIsGuideOpen(false)} className="w-full mt-8 bg-[#333] text-white py-4 rounded-2xl font-bold active:scale-95 transition-all">이해했습니다</button>
          </div>
        </div>
      )}

      {deferredPrompt && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-sm">
          <button onClick={handleInstallClick} className="w-full bg-[#6B8E23] text-white py-5 rounded-2xl font-black shadow-2xl animate-bounce">
            ✨ 전용 앱으로 홈 화면에 설치하기
          </button>
        </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
