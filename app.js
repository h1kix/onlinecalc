const $ = (sel) => document.querySelector(sel);

const expressionEl = $("#expression");
const resultEl = $("#result");
const hintEl = $("#hint");
const historyListEl = $("#historyList");

const btnClearAll = $("#btnClearAll");
const btnHistoryClear = $("#btnHistoryClear");

const STORAGE_KEY = "onlinecalc.history.v1";

let expression = "";
let lastResult = "";
let history = [];

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function normalize(r) {
  if (r.d === 0n) throw new Error("DIV_ZERO");
  if (r.n === 0n) return { n: 0n, d: 1n };
  let n = r.n;
  let d = r.d;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function add(a, b) {
  return normalize({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
}

function sub(a, b) {
  return normalize({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
}

function mul(a, b) {
  return normalize({ n: a.n * b.n, d: a.d * b.d });
}

function div(a, b) {
  if (b.n === 0n) throw new Error("DIV_ZERO");
  return normalize({ n: a.n * b.d, d: a.d * b.n });
}

function pow10(k) {
  let p = 1n;
  for (let i = 0; i < k; i += 1) p *= 10n;
  return p;
}

function parseNumberToRational(s) {
  const str = s.trim();
  if (!str) throw new Error("BAD_NUMBER");

  let sign = 1n;
  let i = 0;
  if (str[i] === "+") i += 1;
  else if (str[i] === "-") {
    sign = -1n;
    i += 1;
  }

  const body = str.slice(i);
  if (body === ".") throw new Error("BAD_NUMBER");

  const parts = body.split(".");
  if (parts.length > 2) throw new Error("BAD_NUMBER");

  const intPart = parts[0] || "0";
  const fracPart = parts.length === 2 ? parts[1] : "";

  if (!/^\d+$/.test(intPart)) throw new Error("BAD_NUMBER");
  if (fracPart && !/^\d+$/.test(fracPart)) throw new Error("BAD_NUMBER");

  const scale = fracPart.length;
  const digits = (intPart + fracPart).replace(/^0+(?=\d)/, "");
  const n = digits ? BigInt(digits) : 0n;
  const d = pow10(scale);
  return normalize({ n: sign * n, d });
}

function formatRational(r, maxFracDigits = 16) {
  const nr = normalize(r);
  const sign = nr.n < 0n ? "-" : "";
  let n = nr.n < 0n ? -nr.n : nr.n;

  if (nr.d === 1n) return sign + n.toString();

  const intPart = n / nr.d;
  let rem = n % nr.d;

  let frac = "";
  let digits = 0;
  while (rem !== 0n && digits < maxFracDigits) {
    rem *= 10n;
    const digit = rem / nr.d;
    rem = rem % nr.d;
    frac += digit.toString();
    digits += 1;
  }

  frac = frac.replace(/0+$/, "");
  if (!frac) return sign + intPart.toString();
  return sign + intPart.toString() + "." + frac;
}

function isOperator(t) {
  return t === "+" || t === "-" || t === "*" || t === "/";
}

function isUnaryOperatorToken(t) {
  return t === "u-" || t === "u+";
}

function isDigitChar(ch) {
  return ch >= "0" && ch <= "9";
}

function isNumberChar(ch) {
  return ch === "." || isDigitChar(ch);
}

function isParenChar(ch) {
  return ch === "(" || ch === ")";
}

function isBinaryOperatorChar(ch) {
  return ch === "+" || ch === "-" || ch === "*" || ch === "/";
}

function precedence(op) {
  if (op === "*" || op === "/") return 2;
  if (op === "+" || op === "-") return 1;
  return 0;
}

function readNumberToken(s, startIndex) {
  let j = startIndex;
  let sawDot = false;

  while (j < s.length) {
    const cj = s[j];
    if (cj === ".") {
      if (sawDot) break;
      sawDot = true;
      j += 1;
      continue;
    }
    if (isDigitChar(cj)) {
      j += 1;
      continue;
    }
    break;
  }

  const num = s.slice(startIndex, j);
  if (num === ".") throw new Error("BAD_NUMBER");
  return { token: { type: "number", value: num }, nextIndex: j };
}

function getPrevToken(tokens) {
  return tokens.length ? tokens[tokens.length - 1] : null;
}

function shouldTreatAsUnary(ch, prevToken) {
  if (ch !== "+" && ch !== "-") return false;
  if (prevToken === null) return true;
  if (typeof prevToken === "string" && (isOperator(prevToken) || prevToken === "(")) return true;
  return false;
}

function tokenize(expr) {
  const s = expr.replace(/\s+/g, "");
  const tokens = [];

  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    if (isParenChar(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }

    if (isBinaryOperatorChar(ch)) {
      const prev = getPrevToken(tokens);
      tokens.push(shouldTreatAsUnary(ch, prev) ? (ch === "-" ? "u-" : "u+") : ch);
      i += 1;
      continue;
    }

    if (isNumberChar(ch)) {
      const { token, nextIndex } = readNumberToken(s, i);
      tokens.push(token);
      i = nextIndex;
      continue;
    }

    throw new Error("BAD_CHAR");
  }

  return tokens;
}

function toRpn(tokens) {
  const out = [];
  const stack = [];

  const pushOpToOutWhile = (predicate) => {
    while (stack.length && predicate(stack[stack.length - 1])) {
      out.push(stack.pop());
    }
  };

  const unwindForBinaryOperator = (op) => {
    pushOpToOutWhile((top) => {
      const topIsOp = isOperator(top) || isUnaryOperatorToken(top);
      if (!topIsOp) return false;
      const pTop = isUnaryOperatorToken(top) ? 3 : precedence(top);
      const pThis = precedence(op);
      return pTop >= pThis;
    });
  };

  const unwindUnaryAfterParen = () => {
    pushOpToOutWhile((top) => isUnaryOperatorToken(top));
  };

  for (const t of tokens) {
    if (typeof t === "object" && t.type === "number") {
      out.push(t);
      continue;
    }

    if (isUnaryOperatorToken(t)) {
      stack.push(t);
      continue;
    }

    if (isOperator(t)) {
      unwindForBinaryOperator(t);
      stack.push(t);
      continue;
    }

    if (t === "(") {
      stack.push(t);
      continue;
    }

    if (t === ")") {
      pushOpToOutWhile((top) => top !== "(");
      if (!stack.length) throw new Error("MISMATCH_PAREN");
      stack.pop();

      unwindUnaryAfterParen();
      continue;
    }

    throw new Error("BAD_TOKEN");
  }

  while (stack.length) {
    const top = stack.pop();
    if (top === "(" || top === ")") throw new Error("MISMATCH_PAREN");
    out.push(top);
  }

  return out;
}

function evalRpn(rpn) {
  const st = [];

  for (const t of rpn) {
    if (typeof t === "object" && t.type === "number") {
      st.push(parseNumberToRational(t.value));
      continue;
    }

    if (t === "u-" || t === "u+") {
      const a = st.pop();
      if (!a) throw new Error("BAD_EXPR");
      st.push(t === "u-" ? normalize({ n: -a.n, d: a.d }) : a);
      continue;
    }

    if (isOperator(t)) {
      const b = st.pop();
      const a = st.pop();
      if (!a || !b) throw new Error("BAD_EXPR");
      if (t === "+") st.push(add(a, b));
      else if (t === "-") st.push(sub(a, b));
      else if (t === "*") st.push(mul(a, b));
      else if (t === "/") st.push(div(a, b));
      continue;
    }

    throw new Error("BAD_EXPR");
  }

  if (st.length !== 1) throw new Error("BAD_EXPR");
  return st[0];
}

function safeEval(expr) {
  const tokens = tokenize(expr);
  const rpn = toRpn(tokens);
  return evalRpn(rpn);
}

function isExpressionIncomplete(expr) {
  const s = expr.replace(/\s+/g, "");
  if (!s) return true;
  const last = s[s.length - 1];
  return last === "+" || last === "-" || last === "*" || last === "/" || last === "(";
}

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
    if (last === "+" || last === "-" || last === "*" || last === "/" || last === "(" || last === ".") {
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
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "(" || ch === ")" || ch === " ") break;
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

function handleKey(e) {
  const k = e.key;

  if (k === "Enter" || k === "=") {
    e.preventDefault();
    equals();
    return;
  }

  if (k === "Backspace") {
    e.preventDefault();
    backspace();
    return;
  }

  if (k === "Escape") {
    e.preventDefault();
    clearAll();
    return;
  }

  if (k === ",") {
    e.preventDefault();
    appendValue(".");
    return;
  }

  if ((k >= "0" && k <= "9") || k === "." || k === "+" || k === "-" || k === "*" || k === "/" || k === "(" || k === ")") {
    e.preventDefault();
    appendValue(k);
  }
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
