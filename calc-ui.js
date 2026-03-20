(() => {
  const { safeEval, formatRational, isExpressionIncomplete, isDigitChar, isBinaryOperatorChar } = window.CalcCore;

  const PREVIEW_TRIM_TAIL_CHARS = new Set(["+", "-", "*", "/", "(", "."]);
  const OP_OR_PAREN_BREAK_CHARS = new Set(["+", "-", "*", "/", "(", ")", " "]);
  const ALLOWED_INPUT_KEYS = new Set([".", "(", ")"]);

  function countChar(str, ch) {
    let c = 0;
    for (const x of str) if (x === ch) c += 1;
    return c;
  }

  function setHint(hintEl, text) {
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

  function render(state, ui) {
    ui.expressionEl.textContent = state.expression || "0";

    if (!state.expression) {
      ui.resultEl.textContent = "0";
      setHint(ui.hintEl, "");
      return;
    }

    if (isExpressionIncomplete(state.expression)) {
      ui.resultEl.textContent = getPreviewResultForIncompleteExpression(state.expression);
      setHint(ui.hintEl, "Допиши выражение или нажми =");
      return;
    }

    try {
      const r = safeEval(state.expression);
      const formatted = formatRational(r);
      ui.resultEl.textContent = formatted;
      setHint(ui.hintEl, "");
    } catch (e) {
      ui.resultEl.textContent = "…";
      if (e && e.message === "DIV_ZERO") setHint(ui.hintEl, "Деление на ноль");
      else if (e && e.message === "MISMATCH_PAREN") setHint(ui.hintEl, "Проверь скобки");
      else setHint(ui.hintEl, "Некорректное выражение");
    }
  }

  function canAppendDot(state) {
    const s = state.expression;
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

  function replaceTrailingOperator(state, newOp) {
    state.expression = state.expression.slice(0, -1) + newOp;
  }

  function tryAppendDot(state) {
    if (!canAppendDot(state)) return;
    if (!state.expression || isOperatorOrOpenParenAtEnd(state.expression)) state.expression += "0";
    state.expression += ".";
  }

  function tryAppendOpenParen(state) {
    const s = state.expression.replace(/\s+/g, "");
    if (s && /[0-9.)]$/.test(s)) state.expression += "*";
    state.expression += "(";
  }

  function tryAppendCloseParen(state) {
    const s = state.expression.replace(/\s+/g, "");
    if (countChar(s, "(") <= countChar(s, ")")) return;
    if (s && isOperatorOrOpenParenAtEnd(state.expression)) return;
    state.expression += ")";
  }

  function tryAppendOperator(state, op) {
    const s = state.expression.replace(/\s+/g, "");
    if (!s) {
      if (op === "-" || op === "+") state.expression = op;
      return;
    }
    if (/[+\-*/.]$/.test(s)) {
      replaceTrailingOperator(state, op);
      return;
    }
    state.expression += op;
  }

  function appendValue(state, ui, v) {
    if (v === ".") tryAppendDot(state);
    else if (v === "(") tryAppendOpenParen(state);
    else if (v === ")") tryAppendCloseParen(state);
    else if (isBinaryOperatorChar(v)) tryAppendOperator(state, v);
    else state.expression += v;
    render(state, ui);
  }

  function backspace(state, ui) {
    if (!state.expression) return;
    state.expression = state.expression.slice(0, -1);
    render(state, ui);
  }

  function clearAll(state, ui) {
    state.expression = "";
    state.lastResult = "";
    render(state, ui);
  }

  function clearEntry(state, ui) {
    if (!state.expression) return;
    const s = state.expression;

    let i = s.length - 1;
    while (i >= 0 && /\s/.test(s[i])) i -= 1;
    while (i >= 0 && (isDigitChar(s[i]) || s[i] === ".")) i -= 1;
    state.expression = s.slice(0, i + 1);
    render(state, ui);
  }

  function equals(state, ui, onAddHistory) {
    if (!state.expression) return;
    if (isExpressionIncomplete(state.expression)) {
      setHint(ui.hintEl, "Выражение не завершено");
      return;
    }

    try {
      const r = safeEval(state.expression);
      const formatted = formatRational(r);
      state.lastResult = formatted;

      onAddHistory({ expr: state.expression, res: formatted, ts: Date.now() });

      state.expression = formatted;
      render(state, ui);
    } catch (e) {
      if (e && e.message === "DIV_ZERO") setHint(ui.hintEl, "Деление на ноль");
      else if (e && e.message === "MISMATCH_PAREN") setHint(ui.hintEl, "Проверь скобки");
      else setHint(ui.hintEl, "Некорректное выражение");
    }
  }

  function isAllowedInputKey(k) {
    return isDigitChar(k) || isBinaryOperatorChar(k) || ALLOWED_INPUT_KEYS.has(k);
  }

  function handleKey(e, actions) {
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
      actions.equals();
      return;
    }
    if (action === "backspace") {
      e.preventDefault();
      actions.backspace();
      return;
    }
    if (action === "clearAll") {
      e.preventDefault();
      actions.clearAll();
      return;
    }
    if (action === "dot") {
      e.preventDefault();
      actions.append(".");
      return;
    }

    if (!isAllowedInputKey(k)) return;
    e.preventDefault();
    actions.append(k);
  }

  function bindButtons(actions) {
    document.querySelectorAll(".key").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-value");
        const action = btn.getAttribute("data-action");

        if (action === "equals") actions.equals();
        else if (action === "backspace") actions.backspace();
        else if (action === "clearEntry") actions.clearEntry();
        else if (v) actions.append(v);
      });
    });
  }

  function createCalcController({ expressionEl, resultEl, hintEl, btnClearAll, onAddHistory }) {
    const state = { expression: "", lastResult: "" };
    const ui = { expressionEl, resultEl, hintEl };

    const actions = {
      append: (v) => appendValue(state, ui, v),
      backspace: () => backspace(state, ui),
      clearAll: () => clearAll(state, ui),
      clearEntry: () => clearEntry(state, ui),
      equals: () => equals(state, ui, onAddHistory),
    };

    btnClearAll.addEventListener("click", actions.clearAll);
    document.addEventListener("keydown", (e) => handleKey(e, actions));
    bindButtons(actions);

    render(state, ui);

    return {
      setFromHistory: (expr, res) => {
        state.expression = expr;
        state.lastResult = res;
        render(state, ui);
      },
      render: () => render(state, ui),
    };
  }

  window.CalcUI = { createCalcController };
})();
