import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Upload,
  Plus,
  MessageSquare,
  User,
  Bot,
  Trash2,
} from "lucide-react";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

const UltimateLLM = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt_3_5_turbo");
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [modelLimits, setModelLimits] = useState({});
  const [currentTokens, setCurrentTokens] = useState(0);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const models = {
    openai_gpt_4: { name: "GPT-4 (OpenAI)", limit: 128000 },
    openai_gpt_4o: { name: "GPT-4o (OpenAI)", limit: 128000 },
    gpt_3_5_turbo: { name: "GPT-3.5 Turbo (OpenAI)", limit: 128000 },
    google: { name: "Gemini (Google)", limit: 32768 },
    llama3_8b_8192: { name: "llama3-8b-8192 (Groq)", limit: 32768 },
    llama3_70b_8192: { name: "llama3-70b-8192 (Groq)", limit: 32768 },
    llama3_13b_8192: { name: "llama3-13b-8192 (Groq)", limit: 32768 },
  };

  useEffect(() => {
    fetchChatHistory();
    setModelLimits(models[selectedModel] || { limit: 0 });
  }, [selectedModel]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchChatHistory = async () => {
    try {
      const response = await fetch("http://localhost:5000/api/chats");
      const data = await response.json();
      setChatHistory(data);
    } catch (error) {
      console.error("Error fetching chat history:", error);
    }
  };

  const createNewChat = async () => {
    try {
      const response = await fetch("http://localhost:5000/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      const newChat = await response.json();
      setCurrentChatId(newChat.id);
      setMessages([]);
      setCurrentTokens(0);
      fetchChatHistory();
    } catch (error) {
      console.error("Error creating new chat:", error);
    }
  };

  const loadChat = async (chatId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/chats/${chatId}`);
      const chat = await response.json();
      setMessages(chat.messages || []);
      setCurrentChatId(chatId);
      setCurrentTokens(chat.tokens || 0);
    } catch (error) {
      console.error("Error loading chat:", error);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const parseMessage = (content) => {
    if (!content) return { __html: "" };

    // First handle code blocks with triple backticks
    let parsed = content.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      (match, language, code) => {
        const lang = language || "plaintext";
        const highlightedCode = hljs.highlight(code.trim(), {
          language: lang,
        }).value;
        return `<div class="code-container"><pre><code class="hljs ${lang}">${highlightedCode}</code></pre></div>`;
      }
    );

    // Then handle inline code with single backticks
    parsed = parsed.replace(/`([^`]+)`/g, (match, code) => {
      const highlightedCode = hljs.highlight(code, {
        language: "plaintext",
      }).value;
      return `<code class="hljs">${highlightedCode}</code>`;
    });

    // Handle other markdown formatting
    parsed = parsed
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^### (.*$)/gm, "<h3>$1</h3>")
      .replace(/^## (.*$)/gm, "<h2>$1</h2>")
      .replace(/^# (.*$)/gm, "<h1>$1</h1>")
      .replace(/\n/g, "<br>");

    return { __html: parsed };
  };

  const sendMessage = async () => {
    if (!input.trim() && !uploadedFile) return;
    if (!currentChatId) await createNewChat();

    const userMessage = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
      file: uploadedFile ? uploadedFile.name : null,
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setInput("");

    try {
      const formData = new FormData();
      formData.append("message", input);
      formData.append("model", selectedModel);
      formData.append("chatId", currentChatId);
      if (uploadedFile) {
        // Read the file content and send it directly
        const fileContent = await uploadedFile.text();
        formData.append("fileContent", fileContent);
        formData.append("fileName", uploadedFile.name);
      }

      const response = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      const assistantMessage = {
        role: "assistant",
        content: data.response,
        timestamp: new Date().toISOString(),
        model: selectedModel,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setCurrentTokens(data.tokens || 0);
      setUploadedFile(null);
      fileInputRef.current.value = "";
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage = {
        role: "assistant",
        content: "Sorry, there was an error processing your request.",
        timestamp: new Date().toISOString(),
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const deleteChat = async (chatId, e) => {
    e.stopPropagation(); // Prevent triggering the chat load
    try {
      const response = await fetch(
        `http://localhost:5000/api/chats/${chatId}`,
        {
          method: "DELETE",
        }
      );
      if (response.ok) {
        if (currentChatId === chatId) {
          setCurrentChatId(null);
          setMessages([]);
          setCurrentTokens(0);
        }
        fetchChatHistory();
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo-container">
            <img src="/image.png" alt="Ultimate LLM Logo" className="logo" />
            <h2>Ultimate LLM</h2>
          </div>
          <button className="new-chat-btn" onClick={createNewChat}>
            <Plus size={20} />
            New Chat
          </button>
        </div>

        <div className="model-selector">
          <label>Model:</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {Object.entries(models).map(([key, model]) => (
              <option key={key} value={key}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <div className="token-info">
          <div className="token-limit">
            <span>Token Limit: {modelLimits.limit?.toLocaleString() || 0}</span>
          </div>
          <div className="token-current">
            <span>Current: {currentTokens.toLocaleString()}</span>
          </div>
          <div className="token-bar">
            <div
              className="token-progress"
              style={{
                width: `${(currentTokens / (modelLimits.limit || 1)) * 100}%`,
              }}
            ></div>
          </div>
        </div>

        <div className="chat-history">
          <h3>Chat History</h3>
          <div className="chat-list">
            {chatHistory.map((chat) => (
              <div
                key={chat.id}
                className={`chat-item ${
                  currentChatId === chat.id ? "active" : ""
                }`}
                onClick={() => loadChat(chat.id)}
              >
                <MessageSquare size={16} />
                <span className="chat-title">{chat.title}</span>
                <button
                  className="delete-chat-btn"
                  onClick={(e) => deleteChat(chat.id, e)}
                  title="Delete chat"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="main-content">
        <div className="chat-container">
          <div className="messages">
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.role}`}>
                <div className="message-avatar">
                  {message.role === "user" ? (
                    <User size={24} />
                  ) : (
                    <Bot size={24} />
                  )}
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-sender">
                      {message.role === "user"
                        ? "You"
                        : message.model
                        ? models[message.model]?.name || "Assistant"
                        : models[selectedModel]?.name || "Assistant"}
                    </span>
                    <span className="message-time">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div
                    className="message-text"
                    dangerouslySetInnerHTML={parseMessage(message.content)}
                  />
                  {message.file && (
                    <div className="message-file">📎 {message.file}</div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="message assistant">
                <div className="message-avatar">
                  <Bot size={24} />
                </div>
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            {uploadedFile && (
              <div className="uploaded-file">
                📎 {uploadedFile.name}
                <button onClick={() => setUploadedFile(null)}>×</button>
              </div>
            )}
            <div className="input-container">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <button
                className="upload-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={20} />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                rows="3"
              />
              <button
                className="send-btn"
                onClick={sendMessage}
                disabled={loading || (!input.trim() && !uploadedFile)}
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .app-container {
          display: flex;
          height: 100vh;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
            Roboto, sans-serif;
          background-color: #343541;
          overflow: hidden;
        }

        .sidebar {
          width: 280px;
          background-color: #202123;
          color: white;
          display: flex;
          flex-direction: column;
          padding: 20px;
          overflow: hidden;
        }

        .sidebar-header {
          margin-bottom: 20px;
        }

        .logo-container {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .logo {
          width: 40px;
          height: 40px;
          object-fit: contain;
        }

        .logo-container h2 {
          margin: 0;
          font-size: 25px;
          font-weight: 600;
        }

        .new-chat-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: #40414f;
          color: white;
          border: none;
          padding: 12px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 17.5px;
          margin-bottom: 20px;
          transition: background-color 0.2s;
        }

        .new-chat-btn:hover {
          background-color: #565869;
        }

        .model-selector {
          margin-bottom: 20px;
        }

        .model-selector label {
          display: block;
          margin-bottom: 8px;
          font-size: 17.5px;
          font-weight: 500;
        }

        .model-selector select {
          width: 100%;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #40414f;
          background-color: #40414f;
          color: white;
          font-size: 17.5px;
        }

        .token-info {
          background-color: #40414f;
          padding: 16px;
          border-radius: 6px;
          margin-bottom: 20px;
        }

        .token-limit,
        .token-current {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 15px;
        }

        .token-bar {
          height: 4px;
          background-color: #565869;
          border-radius: 2px;
          overflow: hidden;
        }

        .token-progress {
          height: 100%;
          background-color: #10a37f;
          transition: width 0.3s ease;
        }

        .chat-history h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 500;
        }

        .chat-list {
          flex: 1;
          overflow-y: auto;
          max-height: calc(100vh - 400px);
          scrollbar-width: thin;
          scrollbar-color: #565869 #202123;
        }

        .chat-list::-webkit-scrollbar {
          width: 8px;
        }

        .chat-list::-webkit-scrollbar-track {
          background: #202123;
        }

        .chat-list::-webkit-scrollbar-thumb {
          background-color: #565869;
          border-radius: 4px;
        }

        .chat-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 15px;
          transition: background-color 0.2s;
          margin-bottom: 4px;
          position: relative;
        }

        .chat-item:hover {
          background-color: #40414f;
        }

        .chat-item.active {
          background-color: #40414f;
        }

        .chat-title {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
            Roboto, sans-serif;
        }

        .delete-chat-btn {
          opacity: 0;
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chat-item:hover .delete-chat-btn {
          opacity: 1;
        }

        .delete-chat-btn:hover {
          color: #ef4444;
          background-color: rgba(239, 68, 68, 0.1);
        }

        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          background-color: #343541;
          overflow: hidden;
        }

        .chat-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          margin: 0 auto;
          width: 100%;
          background-color: #343541;
          overflow: hidden;
        }

        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-height: calc(100vh - 200px);
          background-color: #343541;
          scrollbar-width: thin;
          scrollbar-color: #565869 #343541;
        }

        .messages::-webkit-scrollbar {
          width: 8px;
        }

        .messages::-webkit-scrollbar-track {
          background: #343541;
        }

        .messages::-webkit-scrollbar-thumb {
          background-color: #565869;
          border-radius: 4px;
        }

        .message {
          display: flex;
          gap: 16px;
          max-width: 100%;
        }

        .message.user {
          margin-left: auto;
          flex-direction: row-reverse;
        }

        .message.user .message-content {
          background-color: rgb(68, 67, 67);
          padding: 12px 16px;
          border-radius: 8px;
        }

        .message.user .message-text {
          color: rgb(255, 255, 255);
        }
        .body {
          position: fixed;
        }

        .message-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .message.user .message-avatar {
          background-color: #10a37f;
          color: white;
        }

        .message.assistant .message-avatar {
          background-color: #ab68ff;
          color: white;
        }

        .message-content {
          flex: 1;
          min-width: 0;
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .message.user .message-header {
          justify-content: flex-end;
        }

        .message.user .message-time {
          display: none;
        }

        .message-sender {
          font-weight: 600;
          font-size: 17.5px;
          color: #ececf1;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
            Roboto, sans-serif;
        }

        .message-time {
          font-size: 15px;
          color: #9ca3af;
        }

        .message-text {
          line-height: 1.6;
          color: #ececf1;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
            Roboto, sans-serif;
          font-size: 17px;
        }

        .message-text h1,
        .message-text h2,
        .message-text h3 {
          margin: 16px 0 8px 0;
          color: #ececf1;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
            Roboto, sans-serif;
          font-weight: 700;
        }

        .message-text h1 {
          font-size: 35px;
        }

        .message-text h2 {
          font-size: 30px;
        }

        .message-text h3 {
          font-size: 28px;
        }

        .message-text code {
          background-color: rgb(26, 26, 26);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: "JetBrains Mono", "Fira Code", "Consolas", monospace;
          font-size: 17px;
          color: #ececf1;
          display: inline-block;
        }

        .code-container {
          background-color: #000000;
          border-radius: 8px;
          padding: 12px;
          margin: 8px 0;
          overflow-x: auto;
        }

        .code-container pre {
          margin: 0;
          padding: 0;
          background: transparent;
        }

        .code-container code {
          background-color: transparent;
          padding: 0;
          color: inherit;
          display: block;
          white-space: pre-wrap;
          font-family: "JetBrains Mono", "Fira Code", "Consolas", monospace;
          font-size: 15px;
          line-height: 1.6;
        }

        .code-comment {
          color: #6a9955;
          font-style: italic;
        }

        .message-text pre {
          background-color: transparent;
          color: #ececf1;
          padding: 0;
          border-radius: 0;
          overflow-x: auto;
          margin: 0;
        }

        .message-text pre code {
          background-color: transparent;
          padding: 0;
          color: inherit;
        }

        .message-file {
          background-color: #40414f;
          padding: 8px 12px;
          border-radius: 6px;
          margin-top: 8px;
          font-size: 17.5px;
          color: #9ca3af;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          align-items: center;
          padding: 16px 0;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #9ca3af;
          animation: typing 1.4s infinite ease-in-out;
        }

        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%,
          80%,
          100% {
            transform: scale(0.8);
            opacity: 0.5;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .input-area {
          padding: 20px;
          border-top: 1px solid #000000;
          background-color: #343541;
        }

        .uploaded-file {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background-color: #40414f;
          padding: 8px 12px;
          border-radius: 6px;
          margin-bottom: 12px;
          font-size: 17.5px;
          color: #ececf1;
        }

        .uploaded-file button {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          color: #9ca3af;
        }

        .input-container {
          display: flex;
          gap: 12px;
          align-items: flex-end;
        }

        .upload-btn,
        .send-btn {
          background-color: #10a37f;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
        }

        .upload-btn:hover,
        .send-btn:hover {
          background-color: #0d8f6f;
        }

        .send-btn:disabled {
          background-color: #d1d5db;
          cursor: not-allowed;
        }

        .input-container textarea {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid #40414f;
          border-radius: 8px;
          resize: none;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
            Roboto, sans-serif;
          font-size: 16px;
          line-height: 1.5;
          outline: none;
          transition: border-color 0.2s;
          background-color: #40414f;
          color: #ececf1;
        }

        .input-container textarea:focus {
          border-color: #10a37f;
        }

        .input-container textarea::placeholder {
          color: #9ca3af;
        }
      `}</style>
    </div>
  );
};

export default UltimateLLM;
