import { useState, useEffect, useRef } from "react";

const SYSTEM_PROMPT = `Ты голосовой ассистент. Отвечай коротко, разговорно, по-русски. Без markdown форматирования, без списков с символами, только живая речь. Максимум 3-4 предложения если не просят подробностей.`;

export default function VoiceClaude() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("claude_voice_key") || "");
  const [keyStatus, setKeyStatus] = useState(apiKey ? "ok" : "");
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | listening | thinking | speaking
  const [transcript, setTranscript] = useState("");
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(0);
  const [rate, setRate] = useState(1.0);
  const historyRef = useRef([]);
  const recognitionRef = useRef(null);
  const chatRef = useRef(null);

  // Load TTS voices
  useEffect(() => {
    const load = () => {
      const all = speechSynthesis.getVoices();
      const ru = all.filter(v => v.lang.startsWith("ru"));
      setVoices(ru.length > 0 ? ru : all);
    };
    load();
    speechSynthesis.onvoiceschanged = load;
    return () => { speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  function saveKey() {
    const k = apiKey.trim();
    if (!k.startsWith("sk-ant-")) {
      setKeyStatus("err");
      return;
    }
    localStorage.setItem("claude_voice_key", k);
    setKeyStatus("ok");
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatus("no-sr"); return; }
    const r = new SR();
    r.lang = "ru-RU";
    r.continuous = false;
    r.interimResults = true;
    recognitionRef.current = r;

    r.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setTranscript(final || interim);
      if (final) {
        r.stop();
        handleSend(final.trim());
      }
    };
    r.onerror = () => setStatus("idle");
    r.onend = () => { if (status === "listening") setStatus("idle"); };
    r.start();
    setStatus("listening");
    setTranscript("");
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setStatus("idle");
  }

  function stopSpeaking() {
    speechSynthesis.cancel();
    setStatus("idle");
  }

  function handleOrbClick() {
    if (status === "speaking") { stopSpeaking(); return; }
    if (status === "listening") { stopListening(); return; }
    if (status === "thinking") return;
    const k = localStorage.getItem("claude_voice_key");
    if (!k) { setKeyStatus("err"); return; }
    startListening();
  }

  async function handleSend(text) {
    if (!text) return;
    setStatus("thinking");
    const newMsg = { role: "user", content: text };
    historyRef.current = [...historyRef.current, newMsg];
    setMessages(prev => [...prev, { role: "user", text }]);

    const key = localStorage.getItem("claude_voice_key");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: historyRef.current
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Извини, не смог ответить.";
      historyRef.current = [...historyRef.current, { role: "assistant", content: reply }];
      setMessages(prev => [...prev, { role: "assistant", text: reply }]);
      speak(reply);
    } catch {
      setStatus("idle");
      setMessages(prev => [...prev, { role: "assistant", text: "Ошибка соединения. Проверь API ключ." }]);
    }
  }

  function speak(text) {
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "ru-RU";
    if (voices[selectedVoice]) utt.voice = voices[selectedVoice];
    utt.rate = rate;
    utt.onstart = () => setStatus("speaking");
    utt.onend = () => setStatus("idle");
    utt.onerror = () => setStatus("idle");
    speechSynthesis.speak(utt);
  }

  const orbEmoji = { idle: "🎙️", listening: "⏹", thinking: "⏳", speaking: "🔊", "no-sr": "❌" };
  const statusText = {
    idle: "Нажми чтобы говорить",
    listening: "Слушаю... (нажми чтобы остановить)",
    thinking: "Думаю...",
    speaking: "Говорю... (нажми чтобы остановить)",
    "no-sr": "Распознавание речи не поддерживается"
  };

  const isActive = status === "listening";
  const isThinking = status === "thinking";
  const isSpeaking = status === "speaking";

  return (
    <div style={{
      background: "#0a0a0f",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      fontFamily: "Georgia, serif",
      color: "#e8e6f0",
      padding: "20px 16px",
      maxWidth: "480px",
      margin: "0 auto"
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <div style={{ fontSize: "13px", letterSpacing: "0.2em", color: "#c084fc", textTransform: "uppercase", fontFamily: "sans-serif", fontWeight: 300 }}>
          Голосовой Claude
        </div>
        <div style={{ fontSize: "12px", color: "#6b6880", marginTop: "4px" }}>Говори — я отвечу вслух</div>
      </div>

      {/* API Key */}
      <div style={{
        background: "#12121a",
        border: "1px solid rgba(124,106,247,0.25)",
        borderRadius: "14px",
        padding: "16px",
        width: "100%",
        marginBottom: "16px"
      }}>
        <div style={{ fontSize: "10px", letterSpacing: "0.12em", color: "#6b6880", textTransform: "uppercase", fontFamily: "sans-serif", marginBottom: "8px" }}>
          API ключ Anthropic
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            style={{
              flex: 1, background: "#1a1a28", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px", padding: "10px 12px", color: "#e8e6f0",
              fontSize: "13px", outline: "none", fontFamily: "monospace"
            }}
          />
          <button onClick={saveKey} style={{
            background: "#7c6af7", border: "none", borderRadius: "8px",
            padding: "10px 14px", color: "white", fontSize: "10px",
            letterSpacing: "0.08em", cursor: "pointer", fontFamily: "sans-serif",
            textTransform: "uppercase", whiteSpace: "nowrap"
          }}>
            Сохранить
          </button>
        </div>
        {keyStatus === "ok" && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "#4ade80", background: "rgba(74,222,128,0.1)", borderRadius: "6px", padding: "5px 10px" }}>
            ✓ Ключ сохранён
          </div>
        )}
        {keyStatus === "err" && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "#f87171", background: "rgba(248,113,113,0.1)", borderRadius: "6px", padding: "5px 10px" }}>
            ✗ Неверный формат ключа (должен начинаться с sk-ant-)
          </div>
        )}
      </div>

      {/* Chat */}
      <div ref={chatRef} style={{
        width: "100%", flex: 1, minHeight: "160px", maxHeight: "35vh",
        overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px",
        marginBottom: "10px"
      }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#6b6880", fontSize: "13px", padding: "30px 0", opacity: 0.5 }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>🎙️</div>
            Нажми на кнопку и говори по-русски
          </div>
        ) : messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", alignSelf: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ fontSize: "9px", letterSpacing: "0.1em", color: "#6b6880", marginBottom: "3px", textTransform: "uppercase", fontFamily: "sans-serif" }}>
              {m.role === "user" ? "Ты" : "Claude"}
            </div>
            <div style={{
              padding: "10px 14px", borderRadius: "14px", fontSize: "14px", lineHeight: 1.6,
              background: m.role === "user" ? "linear-gradient(135deg,#7c6af7,#c084fc)" : "#12121a",
              border: m.role === "assistant" ? "1px solid rgba(255,255,255,0.07)" : "none",
              color: "#e8e6f0",
              borderBottomRightRadius: m.role === "user" ? "3px" : "14px",
              borderBottomLeftRadius: m.role === "assistant" ? "3px" : "14px",
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Transcript */}
      <div style={{
        width: "100%", background: "#12121a", border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: "10px", padding: "10px 14px", fontSize: "13px",
        color: transcript ? "#e8e6f0" : "#6b6880", fontStyle: transcript ? "normal" : "italic",
        minHeight: "36px", marginBottom: "16px"
      }}>
        {transcript || "Распознанный текст появится здесь..."}
      </div>

      {/* Orb */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", paddingBottom: "16px" }}>
        <div style={{ position: "relative", width: "100px", height: "100px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Pulse rings */}
          {isActive && [0, 1, 2].map(i => (
            <div key={i} style={{
              position: "absolute",
              borderRadius: "50%",
              border: "1px solid rgba(248,113,113,0.4)",
              width: `${100 + i * 30}%`, height: `${100 + i * 30}%`,
              animation: `pulse ${1 + i * 0.3}s ease-out infinite`,
              opacity: 0.5 - i * 0.15
            }} />
          ))}
          <button onClick={handleOrbClick} style={{
            position: "relative", zIndex: 2,
            width: "76px", height: "76px", borderRadius: "50%", border: "none",
            cursor: status === "thinking" ? "wait" : "pointer",
            fontSize: "26px",
            background: isActive
              ? "linear-gradient(135deg,#f87171,#fb923c)"
              : isSpeaking
              ? "linear-gradient(135deg,#06b6d4,#7c6af7)"
              : isThinking
              ? "linear-gradient(135deg,#06b6d4,#7c6af7)"
              : "linear-gradient(135deg,#7c6af7,#c084fc)",
            boxShadow: isActive
              ? "0 0 35px rgba(248,113,113,0.5)"
              : isSpeaking
              ? "0 0 35px rgba(6,182,212,0.4)"
              : "0 0 25px rgba(124,106,247,0.35)",
            transition: "all 0.3s",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            {orbEmoji[status] || "🎙️"}
          </button>
        </div>

        <div style={{ fontSize: "11px", letterSpacing: "0.1em", color: "#6b6880", textTransform: "uppercase", fontFamily: "sans-serif", textAlign: "center" }}>
          {statusText[status]}
        </div>

        {/* Voice controls */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap", justifyContent: "center" }}>
          {voices.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "9px", letterSpacing: "0.1em", color: "#6b6880", textTransform: "uppercase", fontFamily: "sans-serif" }}>Голос</label>
              <select value={selectedVoice} onChange={e => setSelectedVoice(parseInt(e.target.value))} style={{
                background: "#12121a", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px", padding: "7px 10px", color: "#e8e6f0", fontSize: "12px", outline: "none"
              }}>
                {voices.map((v, i) => (
                  <option key={i} value={i}>{v.name.replace("Google ", "").replace(" (Russia)", "")}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "9px", letterSpacing: "0.1em", color: "#6b6880", textTransform: "uppercase", fontFamily: "sans-serif" }}>Скорость</label>
            <select value={rate} onChange={e => setRate(parseFloat(e.target.value))} style={{
              background: "#12121a", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px", padding: "7px 10px", color: "#e8e6f0", fontSize: "12px", outline: "none"
            }}>
              {[0.8, 1.0, 1.2, 1.5].map(r => <option key={r} value={r}>{r}×</option>)}
            </select>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.9); opacity: 0.6; }
          100% { transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
