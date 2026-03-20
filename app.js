const $ = (sel) => document.querySelector(sel);

const expressionEl = $("#expression");
const resultEl = $("#result");
const hintEl = $("#hint");
const historyListEl = $("#historyList");

const btnClearAll = $("#btnClearAll");
const btnHistoryClear = $("#btnHistoryClear");

function init() {
  let calc;

  const history = window.HistoryUI.createHistoryController({
    historyListEl,
    btnHistoryClear,
    onUseExpression: (expr, res) => {
      if (!calc) return;
      calc.setFromHistory(expr, res);
    },
  });

  calc = window.CalcUI.createCalcController({
    expressionEl,
    resultEl,
    hintEl,
    btnClearAll,
    onAddHistory: (item) => history.add(item),
  });
}

init();
