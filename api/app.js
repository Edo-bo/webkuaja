const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fetch = require("node-fetch");

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../public")));

// KONFIGURASI
const OWNER = "Edo-bo";
const REPO = "Akses";
const BRANCH = "main";
const FILE_PATH = "database.json";
const TOKEN = process.env.GITHUB_TOKEN;

// SSE clients
let clients = [];

async function loadData() {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FILE_PATH}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Error fetching database.json");
  return await res.json();
}

async function saveData(newData, message = "Update database.json") {
  const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  const metaRes = await fetch(apiUrl, {
    headers: { Authorization: `token ${TOKEN}` }
  });
  const meta = await metaRes.json();
  if (!meta.sha) throw new Error("Cannot retrieve file SHA for commit");

  const content = Buffer.from(JSON.stringify(newData, null, 2)).toString("base64");

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `token ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content,
      sha: meta.sha,
      branch: BRANCH
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("GitHub commit failed: " + err);
  }

  // broadcast setelah update
  broadcast();
  return res.json();
}

// SSE endpoint
app.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });
  res.flushHeaders();

  clients.push(res);

  req.on("close", () => {
    clients = clients.filter(client => client !== res);
  });
});

// broadcast helper
async function broadcast() {
  try {
    const data = await loadData();
    for (const client of clients) {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  } catch (err) {
    console.error("Broadcast error:", err.message);
  }
}

// Routes
app.get("/raw", async (req, res) => {
  try {
    const data = await loadData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(["/", "/admin"], async (req, res) => {
  try {
    const data = await loadData();
    res.render("admin", { data });
  } catch (err) {
    res.status(500).send("Failed loading database data: " + err.message);
  }
});

app.post("/admin/add", async (req, res) => {
  try {
    const { nomor } = req.body;
    let data = await loadData();
    if (nomor) data.push({ nomor, status: "aktif" });
    await saveData(data, `Add nomor ${nomor}`);
    res.redirect("/admin");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/admin/delete", async (req, res) => {
  try {
    const { nomor } = req.body;
    let data = await loadData();
    data = data.filter(item => item.nomor !== nomor);
    await saveData(data, `Delete nomor ${nomor}`);
    res.redirect("/admin");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/admin/block", async (req, res) => {
  try {
    const { nomor } = req.body;
    let data = await loadData();
    data = data.map(item =>
      item.nomor === nomor ? { ...item, status: "blokir" } : item
    );
    await saveData(data, `Block nomor ${nomor}`);
    res.redirect("/admin");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/admin/edit", async (req, res) => {
  try {
    const { oldNomor, newNomor } = req.body;
    let data = await loadData();
    data = data.map(item =>
      item.nomor === oldNomor ? { ...item, nomor: newNomor } : item
    );
    await saveData(data, `Edit nomor ${oldNomor} → ${newNomor}`);
    res.redirect("/admin");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = app;
