const MAX_TIMERS = 10;
const INITIAL_TIMERS = 5;
const STORAGE_KEY = "multi-timer-demo-state";

const timersEl = document.querySelector("#timers");
const template = document.querySelector("#timerTemplate");
const addTimerButton = document.querySelector("#addTimer");
const pauseAllButton = document.querySelector("#pauseAll");
const resetAllButton = document.querySelector("#resetAll");
const soundToggle = document.querySelector("#soundToggle");
const voiceToggle = document.querySelector("#voiceToggle");
const voiceStatus = document.querySelector("#voiceStatus");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let voiceEnabled = false;
let soundEnabled = false;
let audioContext = null;
let saveHandle = 0;

const state = {
  timers: loadTimers(),
};

function loadTimers() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length) {
      return saved.slice(0, MAX_TIMERS).map(normalizeTimer);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return Array.from({ length: INITIAL_TIMERS }, (_, index) =>
    normalizeTimer({
      id: crypto.randomUUID(),
      name: `计时器 ${index + 1}`,
      mode: "countup",
      durationMs: 5 * 60 * 1000,
    }),
  );
}

function normalizeTimer(timer) {
  return {
    id: timer.id || crypto.randomUUID(),
    name: timer.name || "计时器",
    mode: timer.mode === "countdown" ? "countdown" : "countup",
    durationMs: Number.isFinite(timer.durationMs) ? timer.durationMs : 5 * 60 * 1000,
    elapsedBeforeStart: Number.isFinite(timer.elapsedBeforeStart) ? timer.elapsedBeforeStart : 0,
    startedAt: null,
    running: false,
    finished: false,
    laps: Array.isArray(timer.laps) ? timer.laps.slice(0, 5) : [],
  };
}

function persistSoon() {
  clearTimeout(saveHandle);
  saveHandle = setTimeout(() => {
    const snapshot = state.timers.map((timer) => ({
      id: timer.id,
      name: timer.name,
      mode: timer.mode,
      durationMs: timer.durationMs,
      elapsedBeforeStart: currentElapsed(timer),
      laps: timer.laps,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, 120);
}

function currentElapsed(timer) {
  if (!timer.running) return timer.elapsedBeforeStart;
  return timer.elapsedBeforeStart + performance.now() - timer.startedAt;
}

function visibleMs(timer) {
  const elapsed = currentElapsed(timer);
  return timer.mode === "countdown" ? Math.max(0, timer.durationMs - elapsed) : elapsed;
}

function formatTime(ms) {
  const totalTenths = Math.max(0, Math.floor(ms / 100));
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function render() {
  timersEl.innerHTML = "";
  state.timers.forEach((timer, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = timer.id;
    node.classList.toggle("finished", timer.finished);
    node.querySelector(".timer-name").value = timer.name;
    node.querySelector(".time-display").textContent = formatTime(visibleMs(timer));
    node.querySelector(".minutes-input").value = Math.floor(timer.durationMs / 60000);
    node.querySelector(".seconds-input").value = Math.floor((timer.durationMs % 60000) / 1000);
    node.querySelector(".start-button").textContent = timer.running ? "暂停" : "开始";
    node.querySelector(".start-button").classList.toggle("running", timer.running);
    node.querySelector(".remove-button").disabled = state.timers.length <= 1;

    node.querySelectorAll(".mode-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === timer.mode);
    });

    const laps = node.querySelector(".laps");
    timer.laps.forEach((lap, lapIndex) => {
      const item = document.createElement("li");
      item.textContent = `#${timer.laps.length - lapIndex}  ${formatTime(lap)}`;
      laps.appendChild(item);
    });

    node.querySelector(".timer-name").addEventListener("change", (event) => {
      timer.name = event.target.value.trim() || `计时器 ${index + 1}`;
      persistSoon();
    });

    node.querySelector(".remove-button").addEventListener("click", () => removeTimer(timer.id));
    node.querySelector(".start-button").addEventListener("click", () => toggleTimer(timer));
    node.querySelector(".reset-button").addEventListener("click", () => resetTimer(timer, false));
    node.querySelector(".lap-button").addEventListener("click", () => addLap(timer));

    node.querySelectorAll(".mode-button").forEach((button) => {
      button.addEventListener("click", () => setMode(timer, button.dataset.mode));
    });

    node.querySelectorAll(".duration-row input").forEach((input) => {
      input.addEventListener("input", () => updateDurationFromInputs(timer, node));
      input.addEventListener("change", () => updateDurationFromInputs(timer, node));
    });

    node.querySelectorAll(".quick-row button").forEach((button) => {
      button.addEventListener("click", () => {
        timer.durationMs = Number(button.dataset.minutes) * 60 * 1000;
        setMode(timer, "countdown");
      });
    });

    timersEl.appendChild(node);
  });

  addTimerButton.disabled = state.timers.length >= MAX_TIMERS;
  soundToggle.classList.toggle("active", soundEnabled);
  soundToggle.setAttribute("aria-label", soundEnabled ? "关闭声音提醒" : "开启声音提醒");
}

function updateVisibleTimes() {
  state.timers.forEach((timer) => {
    const card = timersEl.querySelector(`[data-id="${timer.id}"]`);
    if (!card) return;
    card.querySelector(".time-display").textContent = formatTime(visibleMs(timer));

    if (timer.mode === "countdown" && timer.running && !timer.finished && currentElapsed(timer) >= timer.durationMs) {
      timer.elapsedBeforeStart = timer.durationMs;
      timer.startedAt = null;
      timer.running = false;
      timer.finished = true;
      card.classList.add("finished");
      card.querySelector(".start-button").textContent = "开始";
      card.querySelector(".start-button").classList.remove("running");
      notifyDone(timer);
      persistSoon();
    }
  });
  requestAnimationFrame(updateVisibleTimes);
}

function toggleTimer(timer) {
  if (timer.running) {
    timer.elapsedBeforeStart = currentElapsed(timer);
    timer.startedAt = null;
    timer.running = false;
  } else {
    if (timer.mode === "countdown" && currentElapsed(timer) >= timer.durationMs) {
      timer.elapsedBeforeStart = 0;
    }
    timer.startedAt = performance.now();
    timer.running = true;
    timer.finished = false;
  }
  render();
  persistSoon();
}

function resetTimer(timer, restart = false) {
  timer.elapsedBeforeStart = 0;
  timer.startedAt = restart ? performance.now() : null;
  timer.running = restart;
  timer.finished = false;
  timer.laps = [];
  render();
  persistSoon();
}

function setMode(timer, mode) {
  timer.mode = mode;
  resetTimer(timer, false);
}

function updateDurationFromInputs(timer, node) {
  const minutes = clamp(Number(node.querySelector(".minutes-input").value), 0, 999);
  const seconds = clamp(Number(node.querySelector(".seconds-input").value), 0, 59);
  timer.durationMs = (minutes * 60 + seconds) * 1000 || 1000;
  resetTimer(timer, false);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function addLap(timer) {
  timer.laps.unshift(visibleMs(timer));
  timer.laps = timer.laps.slice(0, 5);
  render();
  persistSoon();
}

function removeTimer(id) {
  if (state.timers.length <= 1) return;
  state.timers = state.timers.filter((timer) => timer.id !== id);
  render();
  persistSoon();
}

function notifyDone(timer) {
  vibrate([240, 120, 240]);
  playAlarm();
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(`${timer.name} 到点了`);
  }
}

function vibrate(pattern) {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}

function playAlarm() {
  if (!soundEnabled) return;
  audioContext ||= new AudioContext();
  const now = audioContext.currentTime;
  [0, 0.18, 0.36].forEach((offset) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now + offset);
    gain.gain.setValueAtTime(0.001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.24, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.15);
  });
}

function setupVoice() {
  if (!SpeechRecognition) {
    voiceToggle.disabled = true;
    voiceStatus.textContent = "当前浏览器不支持语音识别，可用按钮控制。";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.addEventListener("result", (event) => {
    const text = Array.from(event.results)
      .slice(event.resultIndex)
      .map((result) => result[0].transcript)
      .join("")
      .trim();
    handleVoiceCommand(text);
  });

  recognition.addEventListener("end", () => {
    if (voiceEnabled) recognition.start();
  });

  recognition.addEventListener("error", () => {
    voiceStatus.textContent = "语音识别暂时不可用，请检查浏览器权限。";
  });
}

function handleVoiceCommand(text) {
  const index = parseTimerIndex(text);
  const timer = state.timers[index];
  voiceStatus.textContent = text ? `听到：${text}` : "没有听清，请再说一次。";
  if (!timer) return;

  if (/(归零|清零|重置|重新开始|再来)/.test(text)) {
    resetTimer(timer, /重新开始|再来/.test(text));
    return;
  }
  if (/(开始|启动|继续)/.test(text)) {
    if (!timer.running) toggleTimer(timer);
    return;
  }
  if (/(暂停|停止)/.test(text)) {
    if (timer.running) toggleTimer(timer);
    return;
  }
  if (/倒计时/.test(text)) {
    setMode(timer, "countdown");
    return;
  }
  if (/正计时/.test(text)) {
    setMode(timer, "countup");
  }
}

function parseTimerIndex(text) {
  const words = [
    ["第十个", 9],
    ["10", 9],
    ["十", 9],
    ["第九个", 8],
    ["9", 8],
    ["九", 8],
    ["第八个", 7],
    ["8", 7],
    ["八", 7],
    ["第七个", 6],
    ["7", 6],
    ["七", 6],
    ["第六个", 5],
    ["6", 5],
    ["六", 5],
    ["第五个", 4],
    ["5", 4],
    ["五", 4],
    ["第四个", 3],
    ["4", 3],
    ["四", 3],
    ["第三个", 2],
    ["3", 2],
    ["三", 2],
    ["第二个", 1],
    ["2", 1],
    ["二", 1],
    ["两", 1],
    ["第一个", 0],
    ["1", 0],
    ["一", 0],
  ];
  const found = words.find(([word]) => text.includes(word));
  return found ? found[1] : 0;
}

addTimerButton.addEventListener("click", () => {
  if (state.timers.length >= MAX_TIMERS) return;
  state.timers.push(
    normalizeTimer({
      id: crypto.randomUUID(),
      name: `计时器 ${state.timers.length + 1}`,
      mode: "countup",
      durationMs: 5 * 60 * 1000,
    }),
  );
  render();
  persistSoon();
});

pauseAllButton.addEventListener("click", () => {
  state.timers.forEach((timer) => {
    if (timer.running) {
      timer.elapsedBeforeStart = currentElapsed(timer);
      timer.startedAt = null;
      timer.running = false;
    }
  });
  render();
  persistSoon();
});

resetAllButton.addEventListener("click", () => {
  state.timers.forEach((timer) => resetTimer(timer, false));
});

soundToggle.addEventListener("click", async () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    audioContext ||= new AudioContext();
    await audioContext.resume();
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    playAlarm();
  }
  render();
});

voiceToggle.addEventListener("click", () => {
  if (!recognition) return;
  voiceEnabled = !voiceEnabled;
  voiceToggle.classList.toggle("active", voiceEnabled);
  voiceToggle.textContent = voiceEnabled ? "关闭" : "开启";
  voiceStatus.textContent = voiceEnabled ? "正在听，可以说“第一个计时器重新开始”。" : "语音控制已关闭。";
  if (voiceEnabled) recognition.start();
  else recognition.stop();
});

setupVoice();
render();
requestAnimationFrame(updateVisibleTimes);
