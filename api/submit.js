const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SPEC_PATH = path.join(process.cwd(), "spec.json");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, { error: "method_not_allowed" }, 405);
  }

  try {
    const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const answers = body.answers;
    const profile = body.profile || {};
    const scoring = scoreAnswers(spec.questions, answers);
    const responseId = crypto.randomUUID();
    const submittedAt = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).replace(" ", "T") + "+09:00";
    const row = buildSheetRow({
      submittedAt,
      responseId,
      answers,
      scoring,
      profile,
      userAgentType: userAgentType(req.headers["user-agent"] || "")
    });

    let saveResult = { saved: false, status: "disabled" };
    let saveError = null;
    try {
      saveResult = await appendSheetRow(row);
    } catch (error) {
      saveError = error.message;
      saveResult = { saved: false, status: "failed" };
      console.error("Sheet append failed:", error);
    }

    return json(res, {
      responseId,
      saved: saveResult.saved,
      saveStatus: saveResult.status,
      saveError,
      result: {
        ...scoring,
        displayCode: scoring.isCaptain ? "captain" : scoring.typeCode
      }
    });
  } catch (error) {
    console.error(error);
    return json(res, { error: "internal_error" }, 500);
  }
};

function scoreAnswers(questions, answers, threshold = 45) {
  if (!Array.isArray(questions) || questions.length !== 60) throw new Error("scoring_questions_missing");
  if (!Array.isArray(answers) || answers.length !== 60) throw new Error("scoring_answers_missing");

  const axes = [
    { id: 1, pole1: "V", pole2: "C", pole1Label: "計器型", pole2Label: "気配型" },
    { id: 2, pole1: "T", pole2: "K", pole1Label: "新航路型", pole2Label: "定航路型" },
    { id: 3, pole1: "R", pole2: "S", pole1Label: "掟型", pole2Label: "海況型" },
    { id: 4, pole1: "L", pole2: "M", pole1Label: "聴く型", pole2Label: "動く型" }
  ];
  const conceptKeys = {
    "IC 情報判断力": "ic_info",
    "IC 生活設計力": "ic_life",
    "IC 倫理的判断力": "ic_ethics",
    "IC 共感実践力": "ic_empathy",
    "IC 判断の主体": "ic_agency",
    "将来不安": "anxiety",
    "寂しさ": "loneliness",
    "やりたいことの有無": "purpose"
  };
  const values = answers.map((value) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < -3 || number > 3) throw new Error("invalid_answer");
    return number;
  });
  const axisScores = [0, 0, 0, 0];
  const tieCounts = axes.map(() => ({ pole1: 0, pole2: 0 }));
  const concepts = {
    ic_info: 0,
    ic_life: 0,
    ic_ethics: 0,
    ic_empathy: 0,
    ic_agency: 0,
    anxiety: 0,
    loneliness: 0,
    purpose: 0
  };
  const valueByOriginalId = new Map();

  questions.forEach((question, index) => {
    const value = values[index];
    valueByOriginalId.set(question.originalId, value);
    if (question.layer === "A") {
      const axisIndex = question.axis - 1;
      const axis = axes[axisIndex];
      const isPole1 = question.direction === axis.pole1;
      axisScores[axisIndex] += isPole1 ? value : -value;
      if (value > 0) {
        if (isPole1) tieCounts[axisIndex].pole1 += 1;
        else tieCounts[axisIndex].pole2 += 1;
      }
      return;
    }
    const key = conceptKeys[question.concept];
    if (!key) throw new Error("unknown_concept");
    concepts[key] += question.direction === "＋" ? value : -value;
  });

  const codeLetters = axisScores.map((score, index) => {
    const axis = axes[index];
    if (score > 0) return axis.pole1;
    if (score < 0) return axis.pole2;
    return tieCounts[index].pole1 >= tieCounts[index].pole2 ? axis.pole1 : axis.pole2;
  });
  const pctPole1 = axisScores.map((score) => Math.round(((score + 24) / 48) * 100));
  const icTotal = concepts.ic_info + concepts.ic_life + concepts.ic_ethics + concepts.ic_empathy + concepts.ic_agency;
  const isCaptain =
    icTotal >= threshold &&
    valueByOriginalId.get("B17") > 0 &&
    valueByOriginalId.get("B18") > 0 &&
    -valueByOriginalId.get("B19") > 0;
  const typeCode = codeLetters.join("");

  return {
    axisScores,
    typeCode,
    pctPole1,
    decidedAxes: codeLetters.map((letter, index) => {
      const axis = axes[index];
      const pole1Pct = pctPole1[index];
      const isPole1 = letter === axis.pole1;
      return {
        axis: axis.id,
        letter,
        label: isPole1 ? axis.pole1Label : axis.pole2Label,
        percent: isPole1 ? pole1Pct : 100 - pole1Pct,
        pole1Percent: pole1Pct
      };
    }),
    concepts,
    icTotal,
    isCaptain,
    displayCode: isCaptain ? "captain" : typeCode
  };
}

function buildSheetRow({ submittedAt, responseId, answers, scoring, profile, userAgentType }) {
  return [
    submittedAt,
    responseId,
    ...answers,
    ...scoring.axisScores,
    scoring.typeCode,
    ...scoring.pctPole1,
    scoring.concepts.ic_info,
    scoring.concepts.ic_life,
    scoring.concepts.ic_ethics,
    scoring.concepts.ic_empathy,
    scoring.concepts.ic_agency,
    scoring.icTotal,
    scoring.concepts.anxiety,
    scoring.concepts.loneliness,
    scoring.concepts.purpose,
    String(scoring.isCaptain),
    emptyIfDeclined(profile.grade),
    emptyIfDeclined(profile.faculty),
    emptyIfDeclined(profile.gender),
    userAgentType
  ];
}

async function appendSheetRow(row) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE || "responses!A:BS";
  const credentials = readGoogleCredentials();
  if (!spreadsheetId || !credentials) return { saved: false, status: "disabled" };

  const token = await getGoogleAccessToken(credentials);
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [row] })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets API ${response.status}: ${text}`);
  }
  return { saved: true, status: "saved" };
}

function readGoogleCredentials() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return null;
  return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

async function getGoogleAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(credentials.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const jsonBody = await response.json();
  if (!response.ok) throw new Error(`Google token API ${response.status}: ${JSON.stringify(jsonBody)}`);
  return jsonBody.access_token;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function emptyIfDeclined(value) {
  return value && value !== "答えない" ? value : "";
}

function userAgentType(userAgent) {
  return /Mobile|Android|iPhone|iPad/i.test(userAgent) ? "mobile" : "desktop";
}

function json(res, body, status = 200) {
  res.status(status).json(body);
}
