/*
 * 추리 게임 엔진. window.CASE_DATA (cases/*.js) 를 읽어 게임을 그린다.
 * 사건 내용은 이 파일에 없다. 새 사건은 cases/ 폴더에 데이터 파일만 추가하면 된다.
 */
(function () {
  "use strict";
  const C = window.CASE_DATA;
  const KEY = "deduction-save:" + C.id;
  const app = document.getElementById("app");
  let S;

  /* ---------- 상태 ---------- */
  function fresh() {
    return {
      phase: "title",
      time: C.clock.start,
      found: [],
      examined: [],
      asked: [],
      seenTopics: [],
      view: "places",
      loc: C.locations[0].id,
      person: C.people[0].id,
      record: null,
      answers: {},
      result: null
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 저장소를 쓸 수 없으면 새로 시작 */ }
    return null;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
  }
  function clearSave() {
    try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
  }

  const has = (id) => S.found.includes(id);
  const met = (req) => !req || req.every(has);
  const outOfTime = () => S.time >= C.clock.deadline;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function fmtTime(m) {
    const h = Math.floor(m / 60), mm = m % 60;
    const ap = h < 12 ? "오전" : "오후";
    const h12 = h > 12 ? h - 12 : h;
    return ap + " " + h12 + ":" + String(mm).padStart(2, "0");
  }
  function addClues(ids) {
    const added = [];
    (ids || []).forEach((id) => {
      if (!has(id) && C.clues[id]) { S.found.push(id); added.push(id); }
    });
    return added;
  }
  function spend(min) { S.time = Math.min(S.time + min, C.clock.deadline); }

  /* ---------- 행동 ---------- */
  function examine(locId, itemId) {
    if (outOfTime()) return;
    const loc = C.locations.find((l) => l.id === locId);
    const item = loc.items.find((i) => i.id === itemId);
    const key = locId + "/" + itemId;

    if (!met(item.requires)) {
      S.record = { kind: "locked", title: item.lockedName || item.name, where: loc.name, body: [item.lockedText || "아직은 조사할 수 없다."], added: [] };
      return render(true);
    }
    const first = !S.examined.includes(key);
    if (first) { S.examined.push(key); spend(C.clock.examine); }
    const body = item.text.slice();
    (item.extra || []).forEach((x) => { if (has(x.if)) body.push(x.text); });
    S.record = { kind: "examine", title: item.name, where: loc.name, body, added: addClues(item.clues), repeat: !first };
    afterAction();
  }

  function ask(personId, topicId) {
    if (outOfTime()) return;
    const p = C.people.find((x) => x.id === personId);
    const t = p.topics.find((x) => x.id === topicId);
    const key = personId + "/" + topicId;
    const first = !S.asked.includes(key);
    if (first) { S.asked.push(key); spend(C.clock.ask); }
    S.record = { kind: "ask", title: p.name, where: t.q, body: [t.a], added: addClues(t.clues), repeat: !first };
    afterAction();
  }

  function afterAction() {
    if (outOfTime()) {
      S.record.deadline = true;
    }
    render(true);
  }

  /* ---------- 그리기 ---------- */
  function paras(arr) { return arr.map((t) => "<p>" + esc(t) + "</p>").join(""); }

  function visibleTopics(p) { return p.topics.filter((t) => met(t.requires)); }
  function newTopicCount(p) {
    return visibleTopics(p).filter((t) => !S.asked.includes(p.id + "/" + t.id)).length;
  }
  function openItemCount(loc) {
    return loc.items.filter((i) => !S.examined.includes(loc.id + "/" + i.id)).length;
  }

  function header() {
    const span = C.clock.deadline - C.clock.start;
    const used = Math.min(1, (S.time - C.clock.start) / span);
    return (
      '<header class="bar"><div class="bar-in">' +
        '<div class="bar-title"><span class="file-no">' + esc(C.fileNo) + "</span><strong>" + esc(C.title) + "</strong></div>" +
        '<div class="clock" aria-label="현재 시각 ' + fmtTime(S.time) + ", 마감 " + fmtTime(C.clock.deadline) + '">' +
          '<span class="clock-now">' + fmtTime(S.time) + "</span>" +
          '<span class="clock-due">보고 마감 ' + fmtTime(C.clock.deadline) + "</span>" +
          '<span class="wick"><span style="width:' + (used * 100).toFixed(1) + '%"></span></span>' +
        "</div>" +
      "</div>" +
      '<nav class="tabs" role="tablist">' +
        tab("places", "장소", "") +
        tab("people", "인물", "") +
        tab("notes", "수첩", String(S.found.length)) +
        tab("accuse", "고발", "") +
      "</nav></header>"
    );
  }
  function tab(id, label, badge) {
    const on = S.view === id;
    return '<button class="tab' + (on ? " on" : "") + '" role="tab" aria-selected="' + on + '" data-view="' + id + '">' +
      label + (badge ? '<span class="tab-badge">' + badge + "</span>" : "") + "</button>";
  }

  function recordPanel() {
    const r = S.record;
    if (!r) {
      return '<section class="record" id="record"><div class="record-empty">' +
        "<p class=\"eyebrow\">조사 기록</p>" +
        "<p>장소를 골라 물건을 살피거나, 인물에게 질문하라. 조사는 " + C.clock.examine + "분, 질문은 " + C.clock.ask + "분이 걸린다. 같은 것을 다시 보는 데는 시간이 들지 않는다.</p>" +
        "<p>찾은 단서는 수첩에 쌓인다. 준비가 되면 ‘고발’에서 하틀리 경위에게 추리를 제출하라.</p>" +
        "</div></section>";
    }
    const added = r.added.map((id) => '<li><span class="cat">' + esc(C.clues[id].cat) + "</span>" + esc(C.clues[id].title) + "</li>").join("");
    return '<section class="record" id="record" aria-live="polite">' +
      '<p class="eyebrow">' + esc(r.where) + (r.repeat ? " · 다시 봄" : "") + "</p>" +
      "<h2>" + esc(r.title) + "</h2>" +
      '<div class="record-body' + (r.kind === "ask" ? " speech" : "") + '">' + paras(r.body) + "</div>" +
      (added ? '<div class="stamp"><p class="stamp-h">수첩에 기록함</p><ul>' + added + "</ul></div>" : "") +
      (r.deadline ? '<div class="deadline-note"><p>오후 3시. 하틀리 경위가 시계를 본다. “더는 기다릴 수 없소. 추리를 들려주시오.”</p><button class="btn primary" data-view="accuse">고발하러 가기</button></div>' : "") +
      "</section>";
  }

  function placesBoard() {
    const loc = C.locations.find((l) => l.id === S.loc);
    const chips = C.locations.map((l) => {
      const n = openItemCount(l);
      return '<button class="chip' + (l.id === S.loc ? " on" : "") + '" data-loc="' + l.id + '">' +
        '<span class="chip-name">' + esc(l.name) + "</span>" +
        '<span class="chip-sub">' + esc(l.tag) + (n ? " · 남은 곳 " + n : " · 다 봄") + "</span></button>";
    }).join("");
    const items = loc.items.map((it) => {
      const key = loc.id + "/" + it.id;
      const locked = !met(it.requires);
      const done = S.examined.includes(key);
      const name = locked ? (it.lockedName || it.name) : it.name;
      return '<button class="act' + (done ? " done" : "") + (locked ? " locked" : "") + '" data-ex="' + it.id + '"' + (outOfTime() ? " disabled" : "") + ">" +
        '<span>' + esc(name) + "</span>" +
        '<span class="act-cost">' + (locked ? "잠김" : done ? "조사함" : C.clock.examine + "분") + "</span></button>";
    }).join("");
    return '<section class="board">' +
      '<div class="chips" role="list">' + chips + "</div>" +
      '<div class="scene"><h3>' + esc(loc.name) + "</h3><p>" + esc(loc.desc) + "</p></div>" +
      '<div class="acts">' + items + "</div></section>";
  }

  function peopleBoard() {
    const p = C.people.find((x) => x.id === S.person);
    const chips = C.people.map((x) => {
      const n = newTopicCount(x);
      return '<button class="chip person' + (x.id === S.person ? " on" : "") + '" data-person="' + x.id + '">' +
        '<span class="chip-name">' + esc(x.name) + (n ? '<span class="dot" aria-label="물어볼 것 ' + n + '개"></span>' : "") + "</span>" +
        '<span class="chip-sub">' + esc(x.role) + "</span></button>";
    }).join("");
    const topics = visibleTopics(p).map((t) => {
      const done = S.asked.includes(p.id + "/" + t.id);
      return '<button class="act' + (done ? " done" : "") + '" data-ask="' + t.id + '"' + (outOfTime() ? " disabled" : "") + ">" +
        "<span>" + esc(t.q) + "</span>" +
        '<span class="act-cost">' + (done ? "물어봄" : C.clock.ask + "분") + "</span></button>";
    }).join("");
    const hidden = p.topics.length - visibleTopics(p).length;
    return '<section class="board">' +
      '<div class="chips" role="list">' + chips + "</div>" +
      '<div class="scene"><h3>' + esc(p.name) + ' <small>' + esc(p.role) + "</small></h3><p>" + esc(p.desc) + "</p></div>" +
      '<div class="acts">' + topics + "</div>" +
      (hidden ? '<p class="hint">단서를 더 찾으면 물어볼 것이 생길지도 모른다.</p>' : "") +
      "</section>";
  }

  function notesView() {
    const total = Object.keys(C.clues).length;
    if (!S.found.length) {
      return '<section class="notes"><p class="eyebrow">수첩</p><h2>아직 아무것도 적지 않았다</h2><p>현장을 살피고 사람들에게 질문하면 단서가 여기에 쌓인다.</p></section>';
    }
    const cats = ["물증", "문서", "증언"];
    const groups = cats.map((cat) => {
      const ids = S.found.filter((id) => C.clues[id].cat === cat);
      if (!ids.length) return "";
      return '<div class="note-group"><h3>' + cat + ' <span class="count">' + ids.length + "</span></h3><ol>" +
        ids.map((id) => '<li class="note"><h4>' + esc(C.clues[id].title) + "</h4><p>" + esc(C.clues[id].text) + "</p></li>").join("") +
        "</ol></div>";
    }).join("");
    return '<section class="notes"><p class="eyebrow">수첩 · ' + S.found.length + " / " + total + '</p><h2>지금까지 알아낸 것</h2><div class="note-groups">' + groups + "</div></section>";
  }

  function accuseView(err) {
    const qs = C.accusation.questions.map((q, i) => {
      const opts = q.options.map((o) => {
        const id = "a-" + q.id + "-" + o.id;
        return '<label class="opt" for="' + id + '"><input type="radio" id="' + id + '" name="' + q.id + '" value="' + o.id + '"' +
          (S.answers[q.id] === o.id ? " checked" : "") + "><span>" + esc(o.label) + "</span></label>";
      }).join("");
      return '<fieldset class="q"><legend><span class="q-no">' + (i + 1) + "</span>" + esc(q.q) + '</legend><div class="opts">' + opts + "</div></fieldset>";
    }).join("");
    return '<section class="accuse"><p class="eyebrow">하틀리 경위에게 제출</p><h2>당신의 추리</h2>' +
      "<p class=\"lede\">다섯 가지 모두에 답하라. 제출하면 경위가 곧바로 움직인다. 되돌릴 수 없다." +
      (outOfTime() ? "" : " 아직 " + fmtTime(S.time) + "이니 더 조사해도 된다.") + "</p>" +
      '<form id="accuse-form" novalidate>' + qs +
      (err ? '<p class="form-err" role="alert">' + esc(err) + "</p>" : "") +
      '<div class="form-foot"><span class="found-n">수첩의 단서 ' + S.found.length + "개</span>" +
      '<button type="submit" class="btn primary">추리를 제출한다</button></div></form></section>';
  }

  function endView() {
    const A = C.accusation, R = S.result;
    const killerQ = A.questions[0];
    let ending;
    if (R.answers.killer === killerQ.answer) ending = R.score === A.questions.length ? A.endings.perfect : A.endings.partial;
    else ending = R.answers.killer === "suicide" && A.endings.suicide ? A.endings.suicide : A.endings.wrong;
    const rank = A.ranks.find((r) => R.score >= r.min);
    const rows = A.questions.map((q) => {
      const mine = q.options.find((o) => o.id === R.answers[q.id]);
      const right = q.options.find((o) => o.id === q.answer);
      const ok = R.answers[q.id] === q.answer;
      return '<li class="' + (ok ? "ok" : "no") + '"><span class="mark" aria-label="' + (ok ? "맞음" : "틀림") + '">' + (ok ? "○" : "×") + "</span>" +
        '<div><p class="rq">' + esc(q.q) + "</p><p class=\"ra\">" + esc(mine ? mine.label : "—") +
        (ok ? "" : ' <span class="right">→ ' + esc(right.label) + "</span>") + "</p></div></li>";
    }).join("");
    const sol = A.solution.map((s) => "<section><h3>" + esc(s.h) + "</h3><p>" + esc(s.p) + "</p></section>").join("");
    return '<div class="end-wrap"><article class="end">' +
      '<p class="eyebrow">' + esc(C.fileNo) + " · " + fmtTime(R.time) + " 제출</p>" +
      "<h1>" + esc(ending.title) + "</h1>" +
      '<p class="end-text">' + esc(ending.text) + "</p>" +
      '<div class="verdict"><div class="seal small" aria-hidden="true"><span>' + R.score + "/" + A.questions.length + "</span></div>" +
      '<div><p class="rank">' + esc(rank.name) + '</p><p class="rank-sub">단서 ' + R.found + "개를 모아 " + R.score + "개 문항을 맞혔다.</p></div></div>" +
      '<ol class="answers">' + rows + "</ol>" +
      '<div class="solution"><p class="eyebrow">사건의 전말</p>' + sol + "</div>" +
      '<div class="end-foot"><button class="btn" data-review="1">수첩 다시 보기</button><button class="btn primary" data-restart="1">처음부터 다시</button></div>' +
      "</article></div>";
  }

  function titleView() {
    const saved = load();
    const canResume = saved && saved.phase === "play";
    return '<div class="cover-wrap"><div class="cover">' +
      '<p class="file-no">런던 경찰청 · ' + esc(C.fileNo) + "</p>" +
      '<div class="seal" aria-hidden="true"><span>R</span></div>' +
      "<h1>" + esc(C.title) + "</h1>" +
      '<p class="place">' + esc(C.place) + "</p>" +
      '<p class="blurb">안에서 잠긴 서재, 브랜디 잔 밑의 유서. 하틀리 경위는 오후 3시까지 답을 원한다.</p>' +
      '<div class="cover-actions">' +
        (canResume ? '<button class="btn primary" data-resume="1">이어서 조사하기 · ' + fmtTime(saved.time) + "</button>" : "") +
        '<button class="btn' + (canResume ? "" : " primary") + '" data-start="1">' + (canResume ? "새로 시작" : "사건 파일 열기") + "</button>" +
      "</div></div></div>";
  }

  function introView() {
    return '<div class="cover-wrap"><article class="intro">' +
      '<p class="eyebrow">' + esc(C.place) + "</p>" +
      paras(C.intro) +
      '<button class="btn primary" data-begin="1">조사를 시작한다</button></article></div>';
  }

  let lastErr = "";
  function render(scrollToRecord) {
    save();
    if (S.phase === "title") { app.innerHTML = titleView(); return; }
    if (S.phase === "intro") { app.innerHTML = introView(); return; }
    if (S.phase === "end") { app.innerHTML = endView(); window.scrollTo(0, 0); return; }

    let main;
    if (S.view === "places") main = '<main class="desk">' + recordPanel() + placesBoard() + "</main>";
    else if (S.view === "people") main = '<main class="desk">' + recordPanel() + peopleBoard() + "</main>";
    else if (S.view === "notes") main = '<main class="page">' + notesView() + "</main>";
    else main = '<main class="page">' + accuseView(lastErr) + "</main>";
    lastErr = "";
    app.innerHTML = header() + main;

    if (scrollToRecord) {
      const rec = document.getElementById("record");
      if (rec && rec.getBoundingClientRect().top < 0) rec.scrollIntoView({ block: "start" });
    }
  }

  /* ---------- 입력 ---------- */
  app.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.start) { S = fresh(); S.phase = "intro"; return render(); }
    if (d.resume) { S = load() || fresh(); S.phase = "play"; return render(); }
    if (d.begin) { S.phase = "play"; return render(); }
    if (d.restart) { clearSave(); S = fresh(); return render(); }
    if (d.review) { S.phase = "play"; S.view = "notes"; S.result = null; return render(); }
    if (d.view) {
      S.view = d.view;
      if (S.record && S.record.deadline && d.view === "accuse") S.record.deadline = false;
      window.scrollTo(0, 0);
      return render();
    }
    if (d.loc) { S.loc = d.loc; return render(); }
    if (d.person) { S.person = d.person; return render(); }
    if (d.ex) return examine(S.loc, d.ex);
    if (d.ask) return ask(S.person, d.ask);
  });

  app.addEventListener("change", (e) => {
    if (e.target.type === "radio") { S.answers[e.target.name] = e.target.value; save(); }
  });

  app.addEventListener("submit", (e) => {
    e.preventDefault();
    const A = C.accusation;
    const missing = A.questions.filter((q) => !S.answers[q.id]);
    if (missing.length) {
      lastErr = "아직 답하지 않은 문항이 있다: " + missing.map((q) => q.q).join(", ");
      return render();
    }
    const score = A.questions.filter((q) => S.answers[q.id] === q.answer).length;
    S.result = { answers: Object.assign({}, S.answers), score, time: S.time, found: S.found.length };
    S.phase = "end";
    render();
  });

  /* ---------- 시작 ---------- */
  function start(data) {
    S = data && data.phase ? data : fresh();
    if (S.phase === "play" || S.phase === "end") { /* 핫 리로드로 이어받은 상태 */ }
    else S.phase = "title";
    render();
  }
  try { window.claude && window.claude.hot && window.claude.hot.snapshot && window.claude.hot.snapshot(() => S); } catch (e) { /* 뷰어 밖 */ }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(start);
  else start(hot && hot.data ? hot.data : {});
})();
