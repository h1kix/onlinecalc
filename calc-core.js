(() => {
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

  function pushUnaryOrBinaryOperator(tokens, ch) {
    const prev = getPrevToken(tokens);
    tokens.push(shouldTreatAsUnary(ch, prev) ? (ch === "-" ? "u-" : "u+") : ch);
  }

  function tokenizeStep(s, tokens, i) {
    const ch = s[i];

    if (isParenChar(ch)) {
      tokens.push(ch);
      return i + 1;
    }

    if (isBinaryOperatorChar(ch)) {
      pushUnaryOrBinaryOperator(tokens, ch);
      return i + 1;
    }

    if (isNumberChar(ch)) {
      const { token, nextIndex } = readNumberToken(s, i);
      tokens.push(token);
      return nextIndex;
    }

    throw new Error("BAD_CHAR");
  }

  function tokenize(expr) {
    const s = expr.replace(/\s+/g, "");
    const tokens = [];

    let i = 0;
    while (i < s.length) {
      i = tokenizeStep(s, tokens, i);
    }

    return tokens;
  }

  function pushOpToOutWhile(stack, out, predicate) {
    while (stack.length && predicate(stack[stack.length - 1])) {
      out.push(stack.pop());
    }
  }

  function unwindForBinaryOperator(stack, out, op) {
    pushOpToOutWhile(stack, out, (top) => {
      const topIsOp = isOperator(top) || isUnaryOperatorToken(top);
      if (!topIsOp) return false;
      const pTop = isUnaryOperatorToken(top) ? 3 : precedence(top);
      const pThis = precedence(op);
      return pTop >= pThis;
    });
  }

  function unwindUnaryAfterParen(stack, out) {
    pushOpToOutWhile(stack, out, (top) => isUnaryOperatorToken(top));
  }

  function toRpnHandleToken(stack, out, t) {
    if (typeof t === "object" && t.type === "number") {
      out.push(t);
      return;
    }

    if (isUnaryOperatorToken(t)) {
      stack.push(t);
      return;
    }

    if (isOperator(t)) {
      unwindForBinaryOperator(stack, out, t);
      stack.push(t);
      return;
    }

    if (t === "(") {
      stack.push(t);
      return;
    }

    if (t === ")") {
      pushOpToOutWhile(stack, out, (top) => top !== "(");
      if (!stack.length) throw new Error("MISMATCH_PAREN");
      stack.pop();
      unwindUnaryAfterParen(stack, out);
      return;
    }

    throw new Error("BAD_TOKEN");
  }

  function toRpn(tokens) {
    const out = [];
    const stack = [];

    for (const t of tokens) toRpnHandleToken(stack, out, t);

    while (stack.length) {
      const top = stack.pop();
      if (top === "(" || top === ")") throw new Error("MISMATCH_PAREN");
      out.push(top);
    }

    return out;
  }

  function evalRpn(rpn) {
    const st = [];

    const popOne = () => {
      const a = st.pop();
      if (!a) throw new Error("BAD_EXPR");
      return a;
    };

    const popTwo = () => {
      const b = st.pop();
      const a = st.pop();
      if (!a || !b) throw new Error("BAD_EXPR");
      return { a, b };
    };

    const applyBinaryOperator = (op) => {
      const { a, b } = popTwo();
      const ops = {
        "+": add,
        "-": sub,
        "*": mul,
        "/": div,
      };
      const fn = ops[op];
      if (!fn) throw new Error("BAD_EXPR");
      st.push(fn(a, b));
    };

    const applyUnaryOperator = (op) => {
      const a = popOne();
      st.push(op === "u-" ? normalize({ n: -a.n, d: a.d }) : a);
    };

    for (const t of rpn) {
      if (typeof t === "object" && t.type === "number") {
        st.push(parseNumberToRational(t.value));
        continue;
      }

      if (isUnaryOperatorToken(t)) {
        applyUnaryOperator(t);
        continue;
      }

      if (isOperator(t)) {
        applyBinaryOperator(t);
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

  const INCOMPLETE_TAIL_CHARS = new Set(["+", "-", "*", "/", "("]);

  function isExpressionIncomplete(expr) {
    const s = expr.replace(/\s+/g, "");
    if (!s) return true;
    const last = s[s.length - 1];
    return INCOMPLETE_TAIL_CHARS.has(last);
  }

  window.CalcCore = {
    safeEval,
    formatRational,
    isExpressionIncomplete,
    isDigitChar,
    isBinaryOperatorChar,
  };
})();
