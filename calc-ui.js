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

  function createCalcController({ expressionEl, resultEl, hintEl, btnClearAll, onAddHistory }) {
    let expression = "";
    let lastResult = "";

    const setHint = (text) => {
      hintEl.textContent = text || "";
    };

    const getPreviewResultForIncompleteExpression = (expr) => {
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
    };

    const render = () => {
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
    };

    const canAppendDot = () => {
      const s = expression;
      let i = s.length - 1;
      while (i >= 0) {
        const ch = s[i];
        if (ch === ".") return false;
        if (OP_OR_PAREN_BREAK_CHARS.has(ch)) break;
        i -= 1;
      }
      return true;
    };

    const isOperatorOrOpenParenAtEnd = (expr) => /[+\-*/(]$/.test(expr.replace(/\s+/g, ""));

    const replaceTrailingOperator = (newOp) => {
      expression = expression.slice(0, -1) + newOp;
    };

    const tryAppendDot = () => {
      if (!canAppendDot()) return;
      if (!expression || isOperatorOrOpenParenAtEnd(expression)) expression += "0";
      expression += ".";
    };

    const tryAppendOpenParen = () => {
      const s = expression.replace(/\s+/g, "");
      if (s && /[0-9.)]$/.test(s)) expression += "*";
      expression += "(";
    };

    const tryAppendCloseParen = () => {
      const s = expression.replace(/\s+/g, "");
      if (countChar(s, "(") <= countChar(s, ")")) return;
      if (s && isOperatorOrOpenParenAtEnd(expression)) return;
      expression += ")";
    };

    const tryAppendOperator = (op) => {
      const s = expression.replace(/\s+/g, "");

      if (!s) {
        if (op === "-" || op === "+") expression = op;
        return;
      }

      if (/[+\-*/.]$/.test(s)) {
        replaceTrailingOperator(op);
        return;
      }

      expression += op;
    };

    const appendValue = (v) => {
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
    };

    const backspace = () => {
      if (!expression) return;
      expression = expression.slice(0, -1);
      render();
    };

    const clearAll = () => {
      expression = "";
      lastResult = "";
      render();
    };

    const clearEntry = () => {
      if (!expression) return;
      const s = expression;

      let i = s.length - 1;
      while (i >= 0 && /\s/.test(s[i])) i -= 1;
      while (i >= 0 && (isDigitChar(s[i]) || s[i] === ".")) i -= 1;
      expression = s.slice(0, i + 1);
      render();
    };

    const equals = () => {
      if (!expression) return;
      if (isExpressionIncomplete(expression)) {
        setHint("Выражение не завершено");
        return;
      }

      try {
        const r = safeEval(expression);
        const formatted = formatRational(r);
        lastResult = formatted;

        onAddHistory({ expr: expression, res: formatted, ts: Date.now() });

        expression = formatted;
        render();
      } catch (e) {
        if (e && e.message === "DIV_ZERO") setHint("Деление на ноль");
        else if (e && e.message === "MISMATCH_PAREN") setHint("Проверь скобки");
        else setHint("Некорректное выражение");
      }
    };

    const isAllowedInputKey = (k) => isDigitChar(k) || isBinaryOperatorChar(k) || ALLOWED_INPUT_KEYS.has(k);

    const handleKey = (e) => {
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
    };

    btnClearAll.addEventListener("click", clearAll);
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

    const setFromHistory = (expr, res) => {
      expression = expr;
      lastResult = res;
      render();
    };

    render();

    return { setFromHistory, render };
  }

  window.CalcUI = { createCalcController };
})();
