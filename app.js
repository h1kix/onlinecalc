const $ = (sel) => document.querySelector(sel);

const expressionEl = $("#expression");
const resultEl = $("#result");
const hintEl = $("#hint");
const historyListEl = $("#historyList");

const btnClearAll = $("#btnClearAll");
const btnHistoryClear = $("#btnHistoryClear");

const STORAGE_KEY = "onlinecalc.history.v1";

const { safeEval, formatRational, isExpressionIncomplete, isDigitChar, isBinaryOperatorChar } = window.CalcCore;

const PREVIEW_TRIM_TAIL_CHARS = new Set(["+", "-", "*", "/", "(", "."]);
const OP_OR_PAREN_BREAK_CHARS = new Set(["+", "-", "*", "/", "(", ")", " "]);

let expression = "";
let lastResult = "";
let history = [];

function countChar(str, ch) {
  let c = 0;
  for (const x of str) if (x === ch) c += 1;
  return c;
}

function setHint(text) {
  hintEl.textContent = text || "";
}

function getPreviewResultForIncompleteExpression(expr) {
  let s = expr.replace(/\s+/g, "");
  while (s) {
    const last = s[s.length - 1];
    if (PREVIEW_TRIM_TAIL_CHARS.has(last)) {
      s = s.slice(0, -1);
      continue;
    }

    try {
      const r = safeEval(s);
      return formatRational(r);
    } catch {
      s = s.slice(0, -1);
    }
  }
  return "…";
}

function render() {
  expressionEl.textContent = expression || "0";

  if (!expression) {
    resultEl.textContent = "0";
    setHint("");
    return;
  }

  if (isExpressionIncomplete(expression)) {
    resultEl.textContent = getPreviewResultForIncompleteExpression(expression);
    setHint("Допиши выражение или нажми =");
    return;
  }

  try {
    const r = safeEval(expression);
    const formatted = formatRational(r);
    resultEl.textContent = formatted;
    setHint("");
  } catch (e) {
    resultEl.textContent = "…";
    if (e && e.message === "DIV_ZERO") setHint("Деление на ноль");
    else if (e && e.message === "MISMATCH_PAREN") setHint("Проверь скобки");
    else setHint("Некорректное выражение");
  }
}

function canAppendDot() {
  const s = expression;
  let i = s.length - 1;
  while (i >= 0) {
    const ch = s[i];
    if (ch === ".") return false;
    if (OP_OR_PAREN_BREAK_CHARS.has(ch)) break;
    i -= 1;
  }
  return true;
}

function isOperatorOrOpenParenAtEnd(expr) {
  return /[+\-*/(]$/.test(expr.replace(/\s+/g, ""));
}

function replaceTrailingOperator(newOp) {
  expression = expression.slice(0, -1) + newOp;
}

function tryAppendDot() {
  if (!canAppendDot()) return true;
  if (!expression || isOperatorOrOpenParenAtEnd(expression)) expression += "0";
  expression += ".";
  return true;
}

function tryAppendOpenParen() {
  const s = expression.replace(/\s+/g, "");
  if (s && /[0-9.)]$/.test(s)) expression += "*";
  expression += "(";
  return true;
}

function tryAppendCloseParen() {
  const s = expression.replace(/\s+/g, "");
  if (countChar(s, "(") <= countChar(s, ")")) return true;
  if (s && isOperatorOrOpenParenAtEnd(expression)) return true;
  expression += ")";
  return true;
}

function tryAppendOperator(op) {
  const s = expression.replace(/\s+/g, "");

  if (!s) {
    if (op === "-" || op === "+") {
      expression = op;
      return true;
    }
    return true;
  }

  if (/[+\-*/.]$/.test(s)) {
    replaceTrailingOperator(op);
    return true;
  }

  expression += op;
  return true;
}

function appendValue(v) {
  if (v === ".") {
    tryAppendDot();
    render();
    return;
  }

  if (v === "(") {
    tryAppendOpenParen();
    render();
    return;
  }

  if (v === ")") {
    tryAppendCloseParen();
    render();
    return;
  }

  if (isBinaryOperatorChar(v)) {
    tryAppendOperator(v);
    render();
    return;
  }

  expression += v;
  render();
}

function backspace() {
  if (!expression) return;
  expression = expression.slice(0, -1);
  render();
}

function clearAll() {
  expression = "";
  lastResult = "";
  render();
}

function clearEntry() {
  if (!expression) return;
  const s = expression;

  let i = s.length - 1;
  while (i >= 0 && /\s/.test(s[i])) i -= 1;
  while (i >= 0 && (s[i] >= "0" && s[i] <= "9" || s[i] === ".")) i -= 1;
  expression = s.slice(0, i + 1);
  render();
}

function equals() {
  if (!expression) return;
  if (isExpressionIncomplete(expression)) {
    setHint("Выражение не завершено");
    return;
  }

  try {
    const r = safeEval(expression);
    const formatted = formatRational(r);
    lastResult = formatted;

    addHistoryItem({ expr: expression, res: formatted, ts: Date.now() });

    expression = formatted;
    render();
  } catch (e) {
    if (e && e.message === "DIV_ZERO") setHint("Деление на ноль");
    else if (e && e.message === "MISMATCH_PAREN") setHint("Проверь скобки");
    else setHint("Некорректное выражение");
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.expr === "string" && typeof x.res === "string").slice(0, 60);
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 60)));
  } catch {
    // ignore
  }
}

function renderHistory() {
  historyListEl.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.innerHTML = `
      <div>
        <div class="item__expr">История пустая</div>
        <div class="item__res">Сделай первый расчёт</div>
      </div>
      <div class="item__btns"></div>
    `;
    historyListEl.appendChild(empty);
    return;
  }

  for (const h of history) {
    const item = document.createElement("div");
    item.className = "item";
    item.setAttribute("role", "listitem");

    const left = document.createElement("div");
    const expr = document.createElement("div");
    expr.className = "item__expr";
    expr.textContent = h.expr;
    const res = document.createElement("div");
    res.className = "item__res";
    res.textContent = h.res;
    left.appendChild(expr);
    left.appendChild(res);

    const btns = document.createElement("div");
    btns.className = "item__btns";

    const useBtn = document.createElement("button");
    useBtn.className = "small-btn";
    useBtn.type = "button";
    useBtn.title = "Подставить в калькулятор";
    useBtn.textContent = "↩";
    useBtn.addEventListener("click", () => {
      expression = h.expr;
      lastResult = h.res;
      render();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "small-btn";
    delBtn.type = "button";
    delBtn.title = "Удалить из истории";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", () => {
      history = history.filter((x) => x.id !== h.id);
      saveHistory();
      renderHistory();
    });

    btns.appendChild(useBtn);
    btns.appendChild(delBtn);

    item.appendChild(left);
    item.appendChild(btns);

    historyListEl.appendChild(item);
  }
}

function addHistoryItem({ expr, res, ts }) {
  const id = `${ts}-${Math.random().toString(16).slice(2)}`;
  history = [{ id, expr, res, ts }, ...history].slice(0, 60);
  saveHistory();
  renderHistory();
}

function isAllowedInputKey(k) {
  return isDigitChar(k) || isBinaryOperatorChar(k) || k === "." || k === "(" || k === ")";
}

function handleKey(e) {
  const k = e.key;

  const keyToAction = {
    Enter: "equals",
    "=": "equals",
    Backspace: "backspace",
    Escape: "clearAll",
    ",": "dot",
  };

  const action = keyToAction[k];

  if (action === "equals") {
    e.preventDefault();
    equals();
    return;
  }

  if (action === "backspace") {
    e.preventDefault();
    backspace();
    return;
  }

  if (action === "clearAll") {
    e.preventDefault();
    clearAll();
    return;
  }

  if (action === "dot") {
    e.preventDefault();
    appendValue(".");
    return;
  }

  if (!isAllowedInputKey(k)) return;
  e.preventDefault();
  appendValue(k);
}

function init() {
  history = loadHistory();
  renderHistory();
  render();

  document.addEventListener("keydown", handleKey);

  document.querySelectorAll(".key").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.getAttribute("data-value");
      const action = btn.getAttribute("data-action");

      if (action === "equals") equals();
      else if (action === "backspace") backspace();
      else if (action === "clearEntry") clearEntry();
      else if (v) appendValue(v);
    });
  });

  btnClearAll.addEventListener("click", clearAll);
  btnHistoryClear.addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistory();
  });
}

init();
