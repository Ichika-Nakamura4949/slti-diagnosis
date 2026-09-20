const ANSWERS_KEY = "slti.answers.v1";
const PROFILE_KEY = "slti.profile.v1";
const RESULT_KEY = "slti.result.v1";
const VALUES = [3, 2, 1, 0, -1, -2, -3];
const PAGE_SIZE = 6;
const DEFAULT_PROFILE = { grade: "答えない", faculty: "答えない", gender: "答えない" };
const POLES = {
  V: {
    label: "計器型",
    plain: "たしかめ派",
    file: "V.png",
    scene: "机に広げた海図と方位磁針を、一人でじっと見比べている場面。"
  },
  C: {
    label: "気配型",
    plain: "うらよみ派",
    file: "C.png",
    scene: "夕焼けの空と海面の色を見て、風向きの変化に気づいている場面。"
  },
  T: {
    label: "新航路型",
    plain: "ためし派",
    file: "T.png",
    scene: "まだ線の引かれていない海図の端に、船を進めている場面。"
  },
  K: {
    label: "定航路型",
    plain: "つかいこみ派",
    file: "K.png",
    scene: "何度も通った航路を、使い込んだ船で進んでいる場面。"
  },
  R: {
    label: "掟型",
    plain: "マイルール派",
    file: "R.png",
    scene: "航海日誌の最初のページに、自分で書いた決まりごとが並んでいる場面。"
  },
  S: {
    label: "海況型",
    plain: "そのとき派",
    file: "S.png",
    scene: "波の高さを見ながら、その日の進み方を決めている場面。"
  },
  L: {
    label: "聴く型",
    plain: "きき役",
    file: "L.png",
    scene: "船員の話を、作業の手を止めて最後まで聞いている場面。"
  },
  M: {
    label: "動く型",
    plain: "うごき役",
    file: "M.png",
    scene: "困っている船員に、考えるより先に駆け寄っている場面。"
  }
};
const AXIS_META = [
  { id: 1, name: "情報の読み方", pole1: "V", pole2: "C" },
  { id: 2, name: "航路", pole1: "T", pole2: "K" },
  { id: 3, name: "決め方", pole1: "R", pole2: "S" },
  { id: 4, name: "関わり方", pole1: "L", pole2: "M" }
];

let spec;
let state = {
  view: "home",
  page: 0,
  answers: loadJson(ANSWERS_KEY, Array(60).fill(null)),
  profile: loadJson(PROFILE_KEY, DEFAULT_PROFILE),
  result: loadSessionJson(RESULT_KEY, null)
};

const app = document.querySelector("#app");

init();

async function init() {
  spec = await loadSpecData();
  route();
  window.addEventListener("popstate", route);
  window.addEventListener("scroll", updateResultParallax, { passive: true });
  window.addEventListener("resize", updateResultParallax, { passive: true });
}

async function loadSpecData() {
  try {
    const response = await fetch("/api/spec");
    if (!response.ok) throw new Error("api_spec_unavailable");
    return await response.json();
  } catch {
    const response = await fetch("/spec.json");
    if (!response.ok) throw new Error("spec_json_unavailable");
    return await response.json();
  }
}

function route() {
  const match = location.pathname.match(/^\/type\/([^/]+)$/);
  if (match) {
    state.view = "type";
    state.typeCode = decodeURIComponent(match[1]);
  } else if (location.pathname === "/types") {
    state.view = "types";
  } else if (location.pathname === "/quiz") {
    state.view = "quiz";
  } else if (location.pathname === "/profile") {
    state.view = "profile";
  } else if (location.pathname === "/result") {
    if (!state.result) {
      history.replaceState(null, "", "/");
      state.view = "home";
    } else {
      state.view = "result";
    }
  } else if (state.result) {
    state.result = null;
    removeSessionJson(RESULT_KEY);
    state.view = "home";
  } else {
    state.view = "home";
  }
  render();
}

function render() {
  if (state.view === "home") return renderHome();
  if (state.view === "types") return renderTypeList(false);
  if (state.view === "quiz") return renderQuiz();
  if (state.view === "profile") return renderProfile();
  if (state.view === "result") return renderResult(state.result.displayCode, state.result, true);
  if (state.view === "type") return renderResult(state.typeCode, null, false);
}

function renderHome() {
  const types = spec.types.filter((type) => type.code !== "captain");
  app.innerHTML = `
    <main class="app-shell">
      <section class="hero">
        <div>
          <h1>SLTI</h1>
          <p>AI時代という海を、あなたはどんな船乗りとして渡るか。</p>
          <p class="hero-lead">情報を何で信じるか。新しい道具をどう取り入れるか。<br>
          迷ったとき何で決めるか。人とどう関わるか。<br>
          4つの問いから、あなたが船のどの乗組員なのかがわかります。</p>
          <p><b>60問・約10分</b></p>
          <div class="hero-actions">
            <button class="primary" data-action="start">開始</button>
            <button class="ghost" data-action="types">タイプ一覧</button>
          </div>
          ${typeMarqueeHtml(types)}
        </div>
      </section>
    </main>
  `;
  on("[data-action='start']", "click", () => {
    resetDiagnosis();
    state.view = "quiz";
    state.page = 0;
    history.pushState(null, "", "/quiz");
    render();
  });
  on("[data-action='types']", "click", () => {
    state.view = "types";
    history.pushState(null, "", "/types");
    render();
  });
}

function typeMarqueeHtml(types) {
  const midpoint = Math.ceil(types.length / 2);
  const rows = [types.slice(0, midpoint), types.slice(midpoint)];
  return `
    <div class="type-strip" aria-label="SLTIタイプのイラスト">
      ${rows.map((row, index) => `
        <div class="type-marquee type-marquee-${index + 1}">
          <div class="type-marquee-track">
            <div class="type-marquee-set">
              ${row.map((type) => typeMarqueeItem(type, false)).join("")}
            </div>
            <div class="type-marquee-set" aria-hidden="true">
              ${row.map((type) => typeMarqueeItem(type, true)).join("")}
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function typeMarqueeItem(type, hidden) {
  return `<img src="${imageSrc(type)}" alt="${hidden ? "" : escapeHtml(type.name)}" loading="lazy">`;
}

function renderTypeList(push = true) {
  const types = spec.types.filter((type) => type.code !== "captain");
  if (push) history.pushState(null, "", "/types");
  app.innerHTML = `
    <main class="page">
      <button class="ghost" data-action="home">SLTI</button>
      <section class="content-section">
        <h1>タイプ一覧</h1>
        <div class="type-grid">
          ${types.map((type) => `
            <a class="type-card" href="/type/${type.code}" data-link>
              <img src="${imageSrc(type)}" alt="${escapeHtml(type.name)}" loading="lazy">
              <b>${escapeHtml(type.name)}</b>
              <span>${escapeHtml(type.tagline)}</span>
            </a>
          `).join("")}
        </div>
      </section>
    </main>
  `;
  on("[data-action='home']", "click", () => {
    state.result = null;
    removeSessionJson(RESULT_KEY);
    history.pushState(null, "", "/");
    state.view = "home";
    render();
  });
  bindLinks();
}

function renderQuiz() {
  const start = state.page * PAGE_SIZE;
  const questions = spec.questions.slice(start, start + PAGE_SIZE);
  const answeredCount = state.answers.filter((value) => value !== null).length;
  app.innerHTML = `
    <div class="topbar">
      <div class="progress" aria-label="進捗"><span style="width:${Math.round((answeredCount / 60) * 100)}%"></span></div>
    </div>
    <main class="page">
      <p class="code">${start + 1}〜${start + questions.length} / 60</p>
      <div class="question-list">
        ${questions.map((question) => questionHtml(question)).join("")}
      </div>
      <div class="actions">
        ${state.page > 0 ? `<button class="ghost" data-action="prev">戻る</button>` : ""}
        <button class="primary" data-action="next">${state.page === 9 ? "属性へ進む" : "次へ"}</button>
      </div>
    </main>
  `;
  document.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      state.answers[Number(button.dataset.index)] = Number(button.dataset.value);
      saveJson(ANSWERS_KEY, state.answers);
      renderQuiz();
    });
  });
  on("[data-action='prev']", "click", () => {
    state.page -= 1;
    history.replaceState(null, "", "/quiz");
    render();
  });
  on("[data-action='next']", "click", () => {
    const missing = questions.some((question) => state.answers[question.no - 1] === null);
    if (missing) return toast("未回答の設問があります");
    if (state.page === 9) {
      state.view = "profile";
      history.pushState(null, "", "/profile");
    } else {
      state.page += 1;
      history.replaceState(null, "", "/quiz");
    }
    render();
  });
}

function questionHtml(question) {
  const selected = state.answers[question.no - 1];
  const text = question.text.replace(/^★\s*/, "");
  return `
    <section class="question">
      <h2>${question.no}. ${escapeHtml(text)}</h2>
      <div class="scale" role="radiogroup" aria-label="${question.no}">
        ${VALUES.map((value) => `
          <button class="${selected === value ? "selected" : ""}" data-answer data-index="${question.no - 1}" data-value="${value}" aria-label="${value}">
            <span class="dot"></span>
          </button>
        `).join("")}
      </div>
      <div class="scale-labels"><span>そう思う</span><span>そう思わない</span></div>
    </section>
  `;
}

function renderProfile() {
  app.innerHTML = `
    <main class="page">
      <h1>属性</h1>
      <p class="code">すべて任意です。</p>
      <div class="form-grid">
        ${selectField("grade", "学年", ["答えない", "1年", "2年", "3年", "4年", "大学院", "その他"])}
        ${selectField("faculty", "学部系統", ["答えない", "理工系", "農学系", "人文社会系", "その他"])}
        ${selectField("gender", "性別", ["答えない", "女性", "男性", "その他"])}
      </div>
      <div class="actions">
        <button class="ghost" data-action="back">戻る</button>
        <button class="primary" data-action="submit">スキップして結果を見る</button>
      </div>
    </main>
  `;
  document.querySelectorAll("select").forEach((select) => {
    select.addEventListener("change", () => {
      state.profile[select.name] = select.value;
      saveJson(PROFILE_KEY, state.profile);
    });
  });
  on("[data-action='back']", "click", () => {
    state.view = "quiz";
    state.page = 9;
    history.pushState(null, "", "/quiz");
    render();
  });
  on("[data-action='submit']", "click", submitAnswers);
}

function selectField(name, label, options) {
  return `
    <label class="field">
      <span>${label}</span>
      <select name="${name}">
        ${options.map((option) => `<option ${state.profile[name] === option ? "selected" : ""}>${option}</option>`).join("")}
      </select>
    </label>
  `;
}

async function submitAnswers() {
  const button = document.querySelector("[data-action='submit']");
  button.disabled = true;
  button.textContent = "結果を計算中";
  try {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: state.answers, profile: state.profile })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "submit_failed");
    state.result = payload.result;
    saveSessionJson(RESULT_KEY, state.result);
    state.view = "result";
    history.pushState(null, "", "/result");
    render();
    if (payload.saveStatus === "failed") toast("結果を表示しました。保存に失敗しました");
  } catch (error) {
    console.error(error);
    try {
      state.result = clientScoreAnswers(spec.questions, state.answers);
      saveSessionJson(RESULT_KEY, state.result);
      state.view = "result";
      history.pushState(null, "", "/result");
      render();
    } catch (fallbackError) {
      console.error(fallbackError);
      toast("送信に失敗しました");
      button.disabled = false;
      button.textContent = "スキップして結果を見る";
    }
  }
}

function clientScoreAnswers(questions, answers, threshold = 45) {
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

function renderResult(code, result, personal) {
  const type = spec.types.find((item) => item.code.toLowerCase() === String(code).toLowerCase()) || spec.types[0];
  const typeText = spec.resultTexts.typeTexts[type.code] || "";
  const displayCode = type.code === "captain" ? "CAPTAIN" : type.code;
  app.innerHTML = `
    <main class="result-stage">
      <div class="result-bg" aria-hidden="true"></div>
      <div class="result-layer layer-chart" aria-hidden="true"></div>
      <div class="result-layer layer-clouds" aria-hidden="true"></div>
      <div class="result-layer layer-waves" aria-hidden="true"></div>
      <div class="result-layer layer-rigging" aria-hidden="true"></div>
      <div class="result-glow" aria-hidden="true"></div>
      <div class="bg-object bg-boat bg-boat-left" aria-hidden="true"></div>
      <div class="bg-object bg-boat bg-boat-right" aria-hidden="true"></div>
      <div class="bg-object bg-buoy" aria-hidden="true"></div>
      <div class="result-nav">
        <button class="ghost glass-button" data-action="home">SLTI</button>
      </div>
      <div class="result-scroll">
        <section class="result-hero hero-card">
          <div class="reveal-burst" aria-hidden="true"></div>
          <div class="reveal-ring" aria-hidden="true"></div>
          <div class="reveal-sparks" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="hero-art-frame">
            ${type.image ? `<img src="${imageSrc(type)}" alt="${escapeHtml(type.name)}">` : `<div class="placeholder-art">船長</div>`}
          </div>
          <div class="result-title">
            <p class="code">${escapeHtml(displayCode)}</p>
            <h1>${escapeHtml(type.name)}</h1>
            <p class="tagline">${escapeHtml(type.tagline)}</p>
          </div>
        </section>
        ${personal ? shareHtml(type) : ""}
        <section class="content-section result-card markdown">${markdown(spec.resultTexts.intro)}</section>
        ${resultTextCards(typeText)}
        ${personal && result ? axesHtml(result) : ""}
        ${scaleDefinitionsHtml(spec.resultTexts.scales)}
        <section class="content-section result-card markdown">${markdown(spec.resultTexts.tail)}</section>
      </div>
    </main>
  `;
  on("[data-action='home']", "click", () => {
    history.pushState(null, "", "/");
    state.result = null;
    removeSessionJson(RESULT_KEY);
    state.view = "home";
    render();
  });
  on("[data-action='copy']", "click", () => copyTypeLink(type));
  on("[data-action='story']", "click", () => saveShareImage(type, 1080, 1920));
  on("[data-action='square']", "click", () => saveShareImage(type, 1080, 1080));
  bindResultMotion();
  bindLinks();
}

function shareHtml(type) {
  return `
    <section class="content-section result-card share-card">
      <div class="share-actions">
        <button class="secondary" data-action="story">結果画像を保存 1080×1920</button>
        <button class="secondary" data-action="square">結果画像を保存 1080×1080</button>
        <button class="ghost" data-action="copy">リンクをコピー</button>
      </div>
    </section>
  `;
}

function axesHtml(result) {
  return `
    <section class="content-section result-card">
      <h2>4つの尺度</h2>
      <div class="axes">
        ${result.decidedAxes.map(axisHtml).join("")}
      </div>
    </section>
  `;
}

function axisHtml(axis) {
  const meta = AXIS_META[axis.axis - 1];
  const left = POLES[meta.pole1];
  const right = POLES[meta.pole2];
  const decidedSide = axis.letter === meta.pole1 ? "left" : "right";
  return `
    <div class="axis-row">
      <b class="axis-title">${escapeHtml(meta.name)}</b>
      <div class="axis-meter axis-meter-${decidedSide}" aria-label="${escapeHtml(meta.name)} ${axis.percent}% ${escapeHtml(poleDisplay(axis.letter))}">
        <span style="width:${axis.percent}%"></span>
      </div>
      <div class="axis-poles">
        ${axisPoleHtml(meta.pole1, axis, left, decidedSide === "left")}
        ${axisPoleHtml(meta.pole2, axis, right, decidedSide === "right")}
      </div>
    </div>
  `;
}

function axisPoleHtml(letter, axis, pole, active) {
  const label = active ? `${axis.percent}% ${poleDisplay(letter)}` : poleDisplay(letter);
  return `
    <figure class="axis-pole ${active ? "is-active" : "is-muted"}">
      <img src="${axisImageSrc(letter)}" alt="${escapeHtml(pole.scene)}" loading="lazy">
      <figcaption>${escapeHtml(label)}</figcaption>
    </figure>
  `;
}

function scaleDefinitionsHtml(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^\*\*(.+?)：(.+?)（([A-Z])）／(.+?)（([A-Z])）\*\*$/);
    if (heading) {
      current = {
        title: heading[1],
        poles: [heading[3], heading[5]],
        items: []
      };
      sections.push(current);
      continue;
    }

    const scene = line.match(/^(.+?)型：(.+場面。)$/);
    if (scene && current) continue;

    const body = line.match(/^(.+?)型の人は、/);
    if (body && current) {
      const letter = current.poles.find((candidate) => POLES[candidate].label === `${body[1]}型`);
      if (letter) current.items.push({ letter, body: line });
    }
  }

  return `
    <section class="content-section result-card scale-definitions">
      ${sections.map((section) => `
        <div class="scale-definition-group">
          <h3>${escapeHtml(scaleDefinitionHeading(section))}</h3>
          ${section.items.map((item) => `
            <div class="scale-definition-item">
              <img src="${axisImageSrc(item.letter)}" alt="${escapeHtml(POLES[item.letter].scene)}" loading="lazy">
              <p>${inline(item.body)}</p>
            </div>
          `).join("")}
        </div>
      `).join("")}
    </section>
  `;
}

function scaleDefinitionHeading(section) {
  const [left, right] = section.poles;
  return `${section.title}：${poleDisplay(left)}／${poleDisplay(right)}`;
}

function poleDisplay(letter) {
  const pole = POLES[letter];
  return `${pole.label}（${letter}）・${pole.plain}`;
}

function axisImageSrc(letter) {
  return `/axis-illustrations/${POLES[letter].file}`;
}

function resultTextCards(text) {
  const blocks = splitResultText(text);
  return blocks
    .map((block, index) => `<section class="content-section result-card markdown" style="--card-index:${index + 1}">${markdown(block)}</section>`)
    .join("");
}

function bindResultMotion() {
  const stage = document.querySelector(".result-stage");
  if (!stage) return;
  const cards = document.querySelectorAll(".result-card, .hero-card");
  document.querySelectorAll(".result-card").forEach((card) => {
    if (!card.querySelector(".rope-corner")) {
      card.insertAdjacentHTML("beforeend", `<span class="rope-corner rope-corner-tl" aria-hidden="true"></span><span class="rope-corner rope-corner-br" aria-hidden="true"></span>`);
    }
  });
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-visible", entry.isIntersecting);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  cards.forEach((card, index) => {
    card.style.setProperty("--card-index", index);
    card.style.setProperty("--card-delay", `${Math.min(index * 34, 220)}ms`);
    observer.observe(card);
  });
  requestAnimationFrame(() => stage.classList.add("is-revealed"));
  window.setTimeout(() => stage.classList.add("is-reveal-finished"), 1450);
  bindCardTilt();
  updateResultParallax();
}

function bindCardTilt() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const targets = document.querySelectorAll(".hero-art-frame");
  targets.forEach((target) => {
    if (target.dataset.tiltBound === "true") return;
    target.dataset.tiltBound = "true";
    target.addEventListener("pointermove", (event) => {
      const rect = target.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      target.style.setProperty("--tilt-x", `${(-y * 5).toFixed(2)}deg`);
      target.style.setProperty("--tilt-y", `${(x * 5).toFixed(2)}deg`);
    });
    target.addEventListener("pointerleave", () => {
      target.style.setProperty("--tilt-x", "0deg");
      target.style.setProperty("--tilt-y", "0deg");
    });
  });
}

function updateResultParallax() {
  const stage = document.querySelector(".result-stage");
  if (!stage) return;
  const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  const progress = Math.min(Math.max(window.scrollY / max, 0), 1);
  stage.style.setProperty("--scroll", progress.toFixed(4));
  stage.style.setProperty("--bg-y", `${(progress * -20).toFixed(2)}px`);
  stage.style.setProperty("--chart-x", `${(progress * 15).toFixed(2)}px`);
  stage.style.setProperty("--chart-y", `${(progress * -21).toFixed(2)}px`);
  stage.style.setProperty("--chart-rotate", `${(progress * -2).toFixed(3)}deg`);
  stage.style.setProperty("--cloud-x", `${(progress * 84).toFixed(2)}px`);
  stage.style.setProperty("--cloud-y", `${(progress * -22).toFixed(2)}px`);
  stage.style.setProperty("--wave-y", `${(progress * -20).toFixed(2)}px`);
  stage.style.setProperty("--rigging-y", `${(progress * -28).toFixed(2)}px`);
  stage.style.setProperty("--hero-y", `${(progress * -12).toFixed(2)}px`);
  stage.style.setProperty("--glow-y", `${(30 + progress * 20).toFixed(2)}%`);
}

function splitResultText(text) {
  const sections = [];
  let current = [];
  for (const block of text.trim().split(/\n{2,}/)) {
    if (block.startsWith("#### ") && current.length) {
      sections.push(current.join("\n\n"));
      current = [block];
    } else {
      current.push(block);
    }
  }
  if (current.length) sections.push(current.join("\n\n"));
  return sections;
}

async function saveShareImage(type, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f7f5ef";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0d6972";
  ctx.fillRect(0, 0, width, Math.round(height * 0.32));
  if (type.image) {
    const image = await loadImage(imageSrc(type));
    const size = Math.round(width * 0.72);
    ctx.drawImage(image, (width - size) / 2, Math.round(height * 0.16), size, size);
  } else {
    ctx.fillStyle = "#e8dfd1";
    const size = Math.round(width * 0.64);
    ctx.fillRect((width - size) / 2, Math.round(height * 0.2), size, size);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#17212b";
  ctx.font = `700 ${Math.round(width * 0.15)}px system-ui, sans-serif`;
  ctx.fillText(type.name, width / 2, Math.round(height * 0.68));
  ctx.font = `700 ${Math.round(width * 0.052)}px system-ui, sans-serif`;
  wrapCanvasText(ctx, type.tagline, width / 2, Math.round(height * 0.75), width * 0.78, Math.round(width * 0.07));
  ctx.font = `700 ${Math.round(width * 0.06)}px Georgia, serif`;
  ctx.fillStyle = "#0d6972";
  ctx.fillText("SLTI", width / 2, Math.round(height * 0.92));
  const link = document.createElement("a");
  link.download = `slti-${type.code}-${width}x${height}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function copyTypeLink(type) {
  const url = `${location.origin}/type/${type.code}`;
  navigator.clipboard?.writeText(url).then(() => toast("リンクをコピーしました"));
}

function markdown(text) {
  const html = [];
  for (const block of text.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed || trimmed === "---") continue;

    const lines = trimmed.split("\n");
    if (lines[0].startsWith("#### ")) {
      html.push(`<h4>${inline(lines[0].slice(5).trim())}</h4>`);
      const rest = lines.slice(1).join("\n").trim();
      if (rest) html.push(`<p>${inline(rest).replace(/\n/g, "<br>")}</p>`);
      continue;
    }

    if (lines[0].startsWith("### ")) {
      html.push(`<h3>${inline(lines[0].slice(4).trim())}</h3>`);
      const rest = lines.slice(1).join("\n").trim();
      if (rest) html.push(`<p>${inline(rest).replace(/\n/g, "<br>")}</p>`);
      continue;
    }

    if (trimmed.startsWith("**") && trimmed.endsWith("**") && !trimmed.slice(2, -2).includes("**")) {
      html.push(`<h3>${inline(trimmed)}</h3>`);
      continue;
    }

    html.push(`<p>${inline(trimmed).replace(/\n/g, "<br>")}</p>`);
  }
  return html.join("");
}

function inline(text) {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
}

function bindLinks() {
  document.querySelectorAll("a[data-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      history.pushState(null, "", link.href);
      route();
    });
  });
}

function imageSrc(type) {
  return `/illustrations/${type.image}`;
}

function firstIncompletePage() {
  const index = state.answers.findIndex((answer) => answer === null);
  return index === -1 ? 0 : Math.floor(index / PAGE_SIZE);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = [...text];
  let line = "";
  for (const char of chars) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = char;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}

function on(selector, eventName, handler) {
  document.querySelector(selector)?.addEventListener(eventName, handler);
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2800);
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function resetDiagnosis() {
  state.answers = Array(60).fill(null);
  state.profile = { ...DEFAULT_PROFILE };
  state.result = null;
  removeSessionJson(RESULT_KEY);
  saveJson(ANSWERS_KEY, state.answers);
  saveJson(PROFILE_KEY, state.profile);
}

function loadSessionJson(key, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveSessionJson(key, value) {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function removeSessionJson(key) {
  sessionStorage.removeItem(key);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
