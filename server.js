const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]
    || req.socket.remoteAddress.replace("::ffff:", "");

  if (!config.allowedIPs[ip]) {
    return res.status(403).send("无权限访问");
  }

  next();
});
app.use(express.static("public"));

const config = JSON.parse(fs.readFileSync("config.json"));
let data = JSON.parse(fs.readFileSync("data.json"));

function saveData() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getClientIP(req) {

  let ip =
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "";

  // 如果有多个 IP（代理情况），取第一个
  if (ip.includes(",")) {
    ip = ip.split(",")[0].trim();
  }

  // 去掉 IPv4-mapped IPv6 前缀
  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  // 本地 IPv6 转 IPv4
  if (ip === "::1") {
    ip = "127.0.0.1";
  }

  return ip;
}

function resetDaily() {
  const now = new Date();
  if (now.getHours() === 23 && now.getMinutes() === 0) {
    data.lastDrawDate = "";
    data.result = null;
    data.resetVotes = [];
    saveData();
  }
}
setInterval(resetDaily, 60000);

app.get("/api/status", (req, res) => {
  res.json(data);
});

app.get("/api/names", (req, res) => {
  res.json(Object.values(config.allowedIPs));
});

app.post("/api/draw", (req, res) => {
  const ip = getClientIP(req);

  if (!config.allowedIPs[ip]) {
    return res.status(403).json({ error: "不在允许名单" });
  }

  const today = getToday();

  if (data.lastDrawDate === today && data.result) {
    return res.json({ already: true, result: data.result });
  }

  const names = Object.values(config.allowedIPs);
  const randomIndex = Math.floor(Math.random() * names.length);
  const selected = names[randomIndex];

  data.lastDrawDate = today;
  data.result = {
    drawer: config.allowedIPs[ip],
    selected: selected,
    time: new Date().toLocaleString()
  };

  data.history.push(data.result);
  data.resetVotes = [];
  saveData();

  res.json({ success: true, result: data.result });
});

app.post("/api/reset", (req, res) => {
  const ip = getClientIP(req);

  if (!config.allowedIPs[ip]) {
    return res.status(403).json({ error: "不在允许名单" });
  }

  if (!data.resetVotes.includes(ip)) {
    data.resetVotes.push(ip);
  }

  if (data.resetVotes.length >= config.resetThreshold) {
    data.lastDrawDate = "";
    data.result = null;
    data.resetVotes = [];
    saveData();
    return res.json({ reset: true });
  }

  saveData();
  res.json({ votes: data.resetVotes.length });
});


app.listen(3000, () => {
  console.log("Server running on http://172.28.131.180:3000");
});