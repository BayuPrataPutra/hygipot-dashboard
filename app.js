const client = mqtt.connect("wss://broker.hivemq.com:8884/mqtt");

let schedules = JSON.parse(localStorage.getItem("schedules")) || [];

let lastESP32Seen = 0;

// ===== ELEMENT SHORTCUT =====
const body = document.getElementById("body");
const themeBtn = document.getElementById("themeBtn");
const img = document.getElementById("img");
const placeholder = document.getElementById("placeholder");
const lastCapture = document.getElementById("lastCapture");

const prediction = document.getElementById("prediction");
const confidence = document.getElementById("confidence");
const confBar = document.getElementById("confBar");

const mqttStatus = document.getElementById("mqttStatus");
const espStatus = document.getElementById("espStatus");

// ===== THEME =====
function toggleTheme() {
  if (body.classList.contains("dark")) {
    body.classList.replace("dark", "light");
    themeBtn.innerText = "🌙";
    localStorage.setItem("theme", "light");
  } else {
    body.classList.replace("light", "dark");
    themeBtn.innerText = "☀️";
    localStorage.setItem("theme", "dark");
  }
  renderSchedule();
}

// ===== LOAD =====
window.onload = () => {
  const saved = localStorage.getItem("theme") || "dark";
  body.classList.add(saved);

  renderSchedule();

  // ===== LOAD IMAGE =====
  const lastImg = localStorage.getItem("lastImage");
  if (lastImg) {
    img.src = lastImg;
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");
  }

  // ===== LOAD TIME =====
  const lastTime = localStorage.getItem("lastCapture");
  if (lastTime) lastCapture.innerText = lastTime;

  // ===== LOAD AI =====
  const pred = localStorage.getItem("lastPrediction");
  const conf = localStorage.getItem("lastConfidence");

  if (pred) prediction.innerText = pred;
  if (conf) {
    confidence.innerText = (conf * 100).toFixed(1) + "%";
    confBar.style.width = conf * 100 + "%";
  }
};

// ===== CLOCK =====
setInterval(() => {
  const now = new Date();
  clock.innerText = now.toLocaleTimeString("id-ID", { hour12: false });
  date.innerText = now.toLocaleDateString("id-ID");
}, 1000);

// ===== MQTT =====
client.on("connect", () => {
  console.log("MQTT Connected");

  mqttStatus.innerText = "🟢 MQTT Online";
  mqttStatus.className =
    "px-3 py-1 rounded-full text-sm font-semibold bg-green-500 text-white";

  client.subscribe("hygipot/data");
  client.subscribe("hygipot/image");
  client.subscribe("hygipot/ai");
  client.subscribe("hygipot/debug");
});

client.on("message", (topic, message) => {
  if (topic === "hygipot/data") {
    lastESP32Seen = Date.now();

    let d = JSON.parse(message.toString());

    updateBar("temp", d.temp, 50);
    updateBar("hum", d.hum, 100);
    updateBar("lux", d.lux, 1000);
    updateBar("soil", d.soil, 4095);
    updateBar("water", d.water, 4095);

    pump.checked = d.pump == 1;
    grow.checked = d.grow == 1;
    white.checked = d.white == 1;
  }

  // ===== IMAGE =====
  if (topic === "hygipot/image") {
    let url = message.toString();

    img.src = url;
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");

    localStorage.setItem("lastImage", url);

    // simpan waktu
    const now = new Date().toLocaleString("id-ID");
    lastCapture.innerText = now;
    localStorage.setItem("lastCapture", now);
  }

  // ===== AI =====
  if (topic === "hygipot/ai") {
    let d = JSON.parse(message.toString());

    prediction.innerText = d.prediction;
    confidence.innerText = (d.confidence * 100).toFixed(1) + "%";
    confBar.style.width = d.confidence * 100 + "%";

    localStorage.setItem("lastPrediction", d.prediction);
    localStorage.setItem("lastConfidence", d.confidence);
  }

  if (topic === "hygipot/debug") {
    appendDebug(message.toString());
  }
});

// ===== BAR =====
// ===== KALIBRASI =====
// Water level: 0% = 1400, 15% = 1551, 100% = 1975
// Soil: kering = 853, basah = 1269
// Humidity: koreksi offset dari sensor (80.2 -> 67, selisih ~13.2)

function rawToPercent(val, min, max) {
  let p = ((val - min) / (max - min)) * 100;
  return Math.min(100, Math.max(0, p));
}

function updateBar(id, val, max) {
  let p;
  let displayVal;
  let color;

  if (id === "water") {
    // Kalibrasi water level
    p = rawToPercent(val, 1400, 1975);
    displayVal = p.toFixed(1) + "%";
    color = p <= 15 ? "#ef4444" : "#22c55e"; // merah jika <=15%, hijau sisanya
  } else if (id === "soil") {
    // kering = 3375 → 0%, basah = 1143 → 100%
    p = ((3375 - val) / (3375 - 1143)) * 100;
    p = Math.min(100, Math.max(0, p));
    displayVal = p.toFixed(1) + "%";
    color = p < 20 ? "#ef4444" : "#22c55e";
  } else if (id === "hum") {
    // Kalibrasi humidity: koreksi offset sensor
    // sensor baca 80.2 = aslinya 67, selisih = 13.2
    let corrected = val - 13.2;
    corrected = Math.min(100, Math.max(0, corrected));
    p = corrected;
    displayVal = corrected.toFixed(1) + "%";
    color = p < 30 ? "#ef4444" : p < 70 ? "#22c55e" : "#3b82f6";
  } else if (id === "lux") {
    // Lux: 0-1000, merah jika terlalu gelap (<15%)
    p = Math.min(100, (val / 1000) * 100);
    displayVal = val + " lux";
    color = p <= 15 ? "#ef4444" : "#22c55e";
  } else if (id === "temp") {
    // Suhu: sudah aman, tidak perlu kalibrasi
    p = Math.min(100, (val / 50) * 100);
    displayVal = val.toFixed(1) + " °C";
    color = p < 30 ? "#3b82f6" : p < 70 ? "#22c55e" : "#ef4444";
  } else {
    p = (val / max) * 100;
    displayVal = val;
    color = p < 30 ? "#3b82f6" : p < 70 ? "#22c55e" : "#ef4444";
  }

  document.getElementById(id).innerText = displayVal;

  let bar = document.getElementById(id + "Bar");
  bar.style.width = p + "%";
  bar.style.background = color;
}

// ===== CONTROL =====
function toggle(type) {
  let state = document.getElementById(type).checked;
  let msg = type + "_" + (state ? "on" : "off");
  console.log("Sending:", msg);
  client.publish("hygipot/control", msg);
}

// ===== CAMERA =====
function capture() {
  placeholder.innerText = "Mengambil gambar...";
  placeholder.classList.remove("hidden");
  img.classList.add("hidden");

  client.publish("hygipot/control", "capture");
}

// ===== SCHEDULE =====
function addSchedule() {
  let t = time.value;
  if (!t) return;

  let [h, m] = t.split(":");

  schedules.push({
    hour: +h,
    minute: +m,
    enabled: true,
  });

  saveSchedule();
}

function renderSchedule() {
  scheduleList.innerHTML = "";

  schedules.forEach((s, i) => {
    const isDark = document.getElementById("body").classList.contains("dark");
    const bgClass = isDark ? "bg-gray-700" : "bg-gray-100";
    const textClass = isDark ? "text-gray-200" : "text-gray-700";

    scheduleList.innerHTML += `
    <div class="flex justify-between items-center p-2 rounded ${bgClass} ${textClass} mb-1">
      <span>${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}</span>
      <div class="flex gap-2">
        <button onclick="toggleSchedule(${i})" class="px-2 py-1 bg-green-500 text-white rounded text-sm">
          ${s.enabled ? "ON" : "OFF"}
        </button>
        <button onclick="deleteSchedule(${i})" class="px-2 py-1 bg-red-500 text-white rounded text-sm">
          ❌
        </button>
      </div>
    </div>`;
  });
}

function toggleSchedule(i) {
  schedules[i].enabled = !schedules[i].enabled;
  saveSchedule();
}

function deleteSchedule(i) {
  schedules.splice(i, 1);
  saveSchedule();
}

function saveSchedule() {
  localStorage.setItem("schedules", JSON.stringify(schedules));
  renderSchedule();

  client.publish("hygipot/schedules", JSON.stringify(schedules));
}

setInterval(() => {
  if (Date.now() - lastESP32Seen < 15000) {
    espStatus.innerText = "🟢 ESP32 Online";

    espStatus.className =
      "px-3 py-1 rounded-full text-sm font-semibold bg-green-500 text-white";
  } else {
    espStatus.innerText = "🔴 ESP32 Offline";

    espStatus.className =
      "px-3 py-1 rounded-full text-sm font-semibold bg-red-500 text-white";
  }
}, 1000);

function appendDebug(msg) {
  const box = document.getElementById("debugBox");
  const now = new Date().toLocaleTimeString("id-ID", { hour12: false });

  let color = "#58D68D"; // hijau default
  const lower = msg.toLowerCase();
  if (
    lower.includes("gagal") ||
    lower.includes("failed") ||
    lower.includes("error")
  ) {
    color = "#E74C3C"; // merah
  } else if (
    lower.includes("ok") ||
    lower.includes("connected") ||
    lower.includes("success")
  ) {
    color = "#5DADE2"; // biru
  }

  const line = document.createElement("div");
  line.style.color = color;
  line.style.borderBottom = "1px solid #1a2030";
  line.style.paddingBottom = "2px";
  line.innerHTML = `<span style="color:#4B5563">[${now}]</span> ${msg}`;

  box.appendChild(line);

  // Batasi 200 baris
  while (box.children.length > 200) box.removeChild(box.firstChild);

  // Auto scroll
  box.scrollTop = box.scrollHeight;
}

function clearDebug() {
  document.getElementById("debugBox").innerHTML = "";
}
