const crypto = require("node:crypto");

module.exports = async function handler(req, res) {
  try {
    const rawSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
    const rawRange = process.env.GOOGLE_SHEETS_RANGE || "responses!A:BS";
    const spreadsheetId = rawSpreadsheetId.trim();
    const range = rawRange.trim();
    const credentials = readGoogleCredentials();
    const result = {
      env: {
        hasSpreadsheetId: Boolean(spreadsheetId),
        spreadsheetIdMasked: maskId(spreadsheetId),
        spreadsheetIdLength: spreadsheetId.length,
        spreadsheetIdHadWhitespace: rawSpreadsheetId !== spreadsheetId,
        range,
        rangeHadWhitespace: rawRange !== range,
        hasCredentials: Boolean(credentials),
        clientEmail: credentials?.client_email || null
      },
      token: null,
      spreadsheetGet: null,
      rangeGet: null
    };

    if (!spreadsheetId || !credentials) return json(res, result);

    const token = await getGoogleAccessToken(credentials);
    result.token = { ok: true };

    const spreadsheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties.title`;
    result.spreadsheetGet = await googleJson(spreadsheetUrl, token);

    const rangeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
    result.rangeGet = await googleJson(rangeUrl, token);

    return json(res, result);
  } catch (error) {
    return json(res, { error: error.message, stack: error.stack?.split("\n").slice(0, 3) }, 500);
  }
};

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

function maskId(value) {
  const text = String(value || "");
  if (text.length <= 10) return text;
  return `${text.slice(0, 6)}...${text.slice(-6)}`;
}

function json(res, body, status = 200) {
  res.status(status).json(body);
}
