import "./ChatPage.css";
import { useState, useRef } from "react";
import axios from "axios";

function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("start"); // start, role, description, questions, report
  const [report, setReport] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [videoChunks, setVideoChunks] = useState([]);
  const videoRef = useRef(null);
  const [currentQuestion, setCurrentQuestion] = useState(""); // Store question text

  // Start interview - Ask role
  const startInterview = () => {
    setMessages([{ sender: "bot", text: "Please enter the Job Role:" }]);
    setStep("role");
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        setVideoChunks(chunks);
        uploadVideo(chunks); // Upload after stop
      };

      recorder.start();
      setMediaRecorder(recorder);
      console.log("🎥 Recording started...");
    } catch (err) {
      console.error("Error starting recording:", err);
      alert("Could not access webcam/microphone");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      console.log("⏹ Recording stopped");
    }
  };

  // Upload video answer & get next question
  const uploadVideo = async (chunks) => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const formData = new FormData();
    formData.append("video", blob, "answer.webm");
    formData.append("question", currentQuestion);

    try {
      const res = await axios.post("http://localhost:5000/upload-answer", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      console.log("✅ Uploaded:", res.data);

      // Show evaluation feedback
      const evaluationMsg = `Feedback: ${res.data.evaluation.feedback}
Scores - Relevance: ${res.data.evaluation.scores.relevance}, Clarity: ${res.data.evaluation.scores.clarity}, Correctness: ${res.data.evaluation.scores.correctness}`;
      setMessages(prev => [...prev, { sender: "bot", text: evaluationMsg }]);

      // Move to next question
      if (res.data.nextQuestion && res.data.nextQuestion.trim() !== "") {
        setCurrentQuestion(res.data.nextQuestion);
        setMessages(prev => [...prev, { sender: "bot", text: res.data.nextQuestion }]);
      } else {
        // No next question, end interview
        endInterview();
      }
    } catch (err) {
      console.error("❌ Upload failed:", err);
      setMessages(prev => [...prev, { sender: "bot", text: "⚠️ Upload failed." }]);
    }
  };

  // Send role / description / start first question
  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { sender: "user", text: input }];
    setMessages(newMessages);
    const userInput = input.trim();
    setInput("");

    if (step === "role") {
      setMessages([...newMessages, { sender: "bot", text: "Please enter the Job Description:" }]);
      setStep("description");
      return;
    }

    if (step === "description") {
      try {
        const res = await axios.post("http://localhost:5000/start-interview", {
          jobRole: newMessages[0].text,
          jobDescription: userInput
        });
        setCurrentQuestion(res.data.question);
        setMessages([...newMessages, { sender: "bot", text: res.data.question }]);
        setStep("questions");
      } catch (err) {
        console.error("Error starting interview:", err);
        setMessages([...newMessages, { sender: "bot", text: "⚠️ Error connecting to server." }]);
      }
      return;
    }
  };

  // End interview & show report
  const endInterview = async () => {
    try {
      const res = await axios.post("http://localhost:5000/generate-report");
      setReport(res.data);
      setStep("report");
    } catch (err) {
      console.error("Error ending interview:", err);
      setMessages(prev => [...prev, { sender: "bot", text: "⚠️ Error fetching report." }]);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-box">
        {/* Messages */}
        <div className="messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.sender}`}>
              {msg.text}
            </div>
          ))}
          {loading && <div className="loading">Bot is typing...</div>}
        </div>

        {/* Start button */}
        {step === "start" && (
          <button className="start-btn" onClick={startInterview}>Start Interview</button>
        )}

        {/* Input for role/description */}
        {step !== "start" && step !== "report" && step !== "questions" && (
          <div className="input-area">
            <input
              type="text"
              placeholder="Type your answer..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        )}

        {/* Video recording for questions */}
        {step === "questions" && (
          <div className="recording-container">
            <video ref={videoRef} className="video-preview" autoPlay muted></video>
            <div className="controls">
              <button onClick={startRecording} className="start-btn">Start Recording</button>
              <button onClick={stopRecording} className="stop-btn">Stop Recording</button>
              <button onClick={endInterview} className="end-btn">End Interview</button>
            </div>
          </div>
        )}

        {/* Final Report */}
        {step === "report" && report && (
          <div className="report">
            <h2>Final Report</h2>
            <ul>
              <li>
                <span style={{ color: "#1976d2", fontWeight: "bold" }}>Technical Correctness:</span>
                <span style={{ color: "#388e3c", marginLeft: 8 }}>{report.technicalCorrectness}/10</span>
              </li>
              <li>
                <span style={{ color: "#1976d2", fontWeight: "bold" }}>Clarity of Explanation:</span>
                <span style={{ color: "#fbc02d", marginLeft: 8 }}>{report.clarityOfExplanation}/10</span>
              </li>
              <li>
                <span style={{ color: "#1976d2", fontWeight: "bold" }}>Confidence:</span>
                <span style={{ color: "#d32f2f", marginLeft: 8 }}>{report.confidence}/10</span>
              </li>
              <li>
                <span style={{ color: "#1976d2", fontWeight: "bold" }}>Overall Impact:</span>
                <span style={{ color: "#7b1fa2", marginLeft: 8 }}>{report.overallImpact}/10</span>
              </li>
            </ul>
            <div style={{
              background: "#e3f2fd",
              borderRadius: 8,
              padding: 16,
              marginTop: 16,
              color: "#333",
              fontStyle: "italic",
              border: "1px solid #90caf9"
            }}>
              {report.finalFeedback.split('\n').map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
            <button
              className="start-btn"
              style={{ marginTop: 24 }}
              onClick={() => {
                setMessages([]);
                setInput("");
                setReport(null);
                setStep("start");
                setCurrentQuestion("");
                // Optionally, you can also clear video chunks and recorder state if needed
                setVideoChunks([]);
                setMediaRecorder(null);
                // Clear interview history on backend
                axios.post("http://localhost:5000/start-interview", {
                  jobRole: "",
                  jobDescription: ""
                });
              }}
            >
              Start New Interview
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default ChatPage;
