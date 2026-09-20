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
      questions: spec.questions,
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

function buildSheetRow({ submittedAt, responseId, questions, answers, scoring, profile, userAgentType }) {
  return [
    submittedAt,
    responseId,
    ...questions.map((question, index) => answerLabel(answers[index])),
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
  const spreadsheetId = (process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();
  const range = (process.env.GOOGLE_SHEETS_RANGE || "responses!A:BS").trim();
  const credentials = readGoogleCredentials();
  if (!spreadsheetId || !credentials) return { saved: false, status: "disabled" };

  const token = await getGoogleAccessToken(credentials);
  const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
  const headers = buildSheetHeaders(spec.questions);
  const sheetName = sheetNameFromRange(range);
  const appendRange = `${quoteSheetName(sheetName)}!A:${columnName(headers.length)}`;
  await ensureHeaderRow({ token, spreadsheetId, sheetName, headers });
  console.info("Sheets append config", {
    spreadsheetId: maskId(spreadsheetId),
    range: appendRange,
    clientEmail: credentials.client_email
  });
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
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
    throw new Error(`Google Sheets API ${response.status}: ${text} config=${JSON.stringify({
      spreadsheetId: maskId(spreadsheetId),
      range: appendRange,
      clientEmail: credentials.client_email
    })}`);
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

function buildSheetHeaders(questions) {
  return [
    "submitted_at",
    "response_id",
    ...questions.map((question) => `Q${String(question.no).padStart(2, "0")}: ${question.text.replace(/^★\s*/, "")}`),
    "axis1_score 情報の読み方",
    "axis2_score 航路",
    "axis3_score 決め方",
    "axis4_score 関わり方",
    "type_code",
    "axis1_pct 計器型(V)%",
    "axis2_pct 新航路型(T)%",
    "axis3_pct 掟型(R)%",
    "axis4_pct 聴く型(L)%",
    "IC 情報判断力",
    "IC 生活設計力",
    "IC 倫理的判断力",
    "IC 共感実践力",
    "IC 判断の主体",
    "IC total",
    "将来不安",
    "寂しさ",
    "やりたいことの有無",
    "is_captain",
    "grade",
    "faculty",
    "gender",
    "device"
  ];
}

async function ensureHeaderRow({ token, spreadsheetId, sheetName, headers }) {
  const spreadsheet = await googleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`,
    token
  );
  if (!spreadsheet.ok) throw new Error(`Google Sheets API ${spreadsheet.status}: ${JSON.stringify(spreadsheet.body)}`);
  const sheet = spreadsheet.body.sheets?.find((item) => item.properties?.title === sheetName);
  if (!sheet) throw new Error(`Sheet tab not found: ${sheetName}`);

  const firstRow = await googleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${quoteSheetName(sheetName)}!1:1`)}`,
    token
  );
  if (!firstRow.ok && firstRow.status !== 400) throw new Error(`Google Sheets API ${firstRow.status}: ${JSON.stringify(firstRow.body)}`);
  const firstCell = firstRow.body.values?.[0]?.[0] || "";
  if (firstCell === headers[0]) return;

  if (firstCell) {
    const insert = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          {
            insertDimension: {
              range: {
                sheetId: sheet.properties.sheetId,
                dimension: "ROWS",
                startIndex: 0,
                endIndex: 1
              },
              inheritFromBefore: false
            }
          }
        ]
      })
    });
    if (!insert.ok) throw new Error(`Google Sheets API ${insert.status}: ${await insert.text()}`);
  }

  const headerRange = `${quoteSheetName(sheetName)}!A1:${columnName(headers.length)}1`;
  const update = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [headers] })
  });
  if (!update.ok) throw new Error(`Google Sheets API ${update.status}: ${await update.text()}`);
}

async function googleJson(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, body };
}

function answerLabel(value) {
  const labels = new Map([
    [3, "3（そう思う）"],
    [2, "2（ややそう思う）"],
    [1, "1（どちらかといえばそう思う）"],
    [0, "0（どちらともいえない）"],
    [-1, "-1（どちらかといえばそう思わない）"],
    [-2, "-2（ややそう思わない）"],
    [-3, "-3（そう思わない）"]
  ]);
  return labels.get(Number(value)) || String(value);
}

function sheetNameFromRange(range) {
  const raw = String(range).split("!")[0] || "responses";
  return raw.replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'");
}

function quoteSheetName(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

function columnName(index) {
  let n = index;
  let name = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function userAgentType(userAgent) {
  return /Mobile|Android|iPhone|iPad/i.test(userAgent) ? "mobile" : "desktop";
}

function json(res, body, status = 200) {
  res.status(status).json(body);
}

function maskId(value) {
  const text = String(value || "");
  if (text.length <= 10) return text;
  return `${text.slice(0, 6)}...${text.slice(-6)}`;
}
