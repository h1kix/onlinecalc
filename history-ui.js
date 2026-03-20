(() => {
  const STORAGE_KEY = "onlinecalc.history.v1";

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((x) => x && typeof x.expr === "string" && typeof x.res === "string")
        .slice(0, 60);
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 60)));
    } catch {
      // ignore
    }
  }

  function createEmptyItem() {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.innerHTML = `
      <div>
        <div class="item__expr">История пустая</div>
        <div class="item__res">Сделай первый расчёт</div>
      </div>
      <div class="item__btns"></div>
    `;
    return empty;
  }

  function createHistoryItemEl(h, onUse, onDelete) {
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
    useBtn.addEventListener("click", () => onUse(h));

    const delBtn = document.createElement("button");
    delBtn.className = "small-btn";
    delBtn.type = "button";
    delBtn.title = "Удалить из истории";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", () => onDelete(h));

    btns.appendChild(useBtn);
    btns.appendChild(delBtn);

    item.appendChild(left);
    item.appendChild(btns);

    return item;
  }

  function createHistoryController({ historyListEl, btnHistoryClear, onUseExpression }) {
    let history = loadHistory();

    const render = () => {
      historyListEl.innerHTML = "";

      if (!history.length) {
        historyListEl.appendChild(createEmptyItem());
        return;
      }

      for (const h of history) {
        const el = createHistoryItemEl(
          h,
          (item) => onUseExpression(item.expr, item.res),
          (item) => {
            history = history.filter((x) => x.id !== item.id);
            saveHistory(history);
            render();
          },
        );
        historyListEl.appendChild(el);
      }
    };

    const add = ({ expr, res, ts }) => {
      const id = `${ts}-${Math.random().toString(16).slice(2)}`;
      history = [{ id, expr, res, ts }, ...history].slice(0, 60);
      saveHistory(history);
      render();
    };

    const clear = () => {
      history = [];
      saveHistory(history);
      render();
    };

    btnHistoryClear.addEventListener("click", clear);

    render();

    return { add, clear, render };
  }

  window.HistoryUI = { createHistoryController };
})();
