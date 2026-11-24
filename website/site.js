const get = id => document.getElementById(id);
const percent = (count, n) => (count * 100 / n).toFixed(1);
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(1);

function setControls(attribute, render) {
  const buttons = document.querySelectorAll("button[data-" + attribute + "]");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
      render(button.dataset[attribute]);
    });
  }
}

function illustrateSteps(value) {
  get("step-label").textContent = value + (Number(value) === 1 ? " Euler update" : " Euler updates") + " from noise";
  const marks = Array.from({length: Number(value)}, (_, index) => {
    const mark = document.createElement("i");
    mark.style.setProperty("--n", index);
    return mark;
  });
  get("steps").replaceChildren(...marks);
}

function showLatency(mode) {
  const isolated = mode === "isolated";
  const three = RESEARCH.isolated.find(item => item.steps === 3 && item.precision === "FP16");
  const profile = [RESEARCH.isolated[0].eager, three.eager, three.graph];
  const rows = RESEARCH.loop.map(({label, ms}, index) => {
    const value = isolated ? profile[index] : ms;
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.textContent = label;
    const bar = document.createElement("i");
    bar.style.setProperty("--w", (value / 900 * 100) + "%");
    const result = document.createElement("b");
    result.textContent = value.toFixed(1) + " ms";
    row.append(name, bar, result);
    return row;
  });
  get("bars").replaceChildren(...rows);
  get("timing-note").textContent = isolated
    ? "Isolated GPU profiling measures 60 warmed batch-one calls per configuration."
    : "Inside the simulation loop, each value is the median of episode-level median policy times across 20 episodes per configuration.";
}

function showPairs(index) {
  const c = RESEARCH.comparisons[index];
  const delta = (c.variant - c.baseline) * 100 / c.n;
  get("difference").innerHTML = signed(delta) + " <small>pp</small>";
  get("rates").textContent = percent(c.baseline,c.n) + "% released · " + percent(c.variant,c.n) + "% variant";
  get("interval").textContent = "Paired 95% interval: " + c.ci.map(signed).join(" to ") + " percentage points.";
  const categories = [
    ["both", "Both succeed", c.both], ["lost", "Released only", c.baselineOnly],
    ["gained", "Variant only", c.variantOnly], ["none", "Neither", c.neither]
  ];
  const cells = document.createDocumentFragment();
  const legend = document.createElement("span");
  legend.className = "legend";
  for (const [kind,label,count] of categories) {
    for (let i = 0; i < count; i++) {
      const cell = document.createElement("i");
      cell.className = kind;
      cells.append(cell);
    }
    const item = document.createElement("span");
    const key = document.createElement("i");
    key.className = kind;
    item.append(key, label + " " + count);
    legend.append(item);
  }
  get("mosaic").replaceChildren(cells);
  get("mosaic").setAttribute("aria-hidden", "true");
  get("pair-caption").replaceChildren(legend, "Each mark represents one matched pair of episodes.");
  const interpretation = c.ci[0] > -5
    ? "The lower bound clears the prespecified −5-point non-inferiority margin."
    : "This comparison does not establish non-inferiority at the prespecified −5-point margin.";
  const context = index === 0 ? " The pooled analysis includes 300 pairs added after the 200-pair interim analysis."
    : index === 1 ? " This one-step confirmation was specified before its run on 300 additional pairs." : "";
  get("decision").textContent = interpretation + context;
  const table = document.createElement("table");
  table.innerHTML = "<caption>Successful episodes by bowl location</caption><thead><tr><th scope='col'>Target bowl</th><th scope='col'>Released</th><th scope='col'>Variant</th></tr></thead>";
  const body = table.createTBody();
  for (const task of c.tasks) {
    const row = body.insertRow();
    row.insertCell().textContent = task.name;
    for (const count of [task.baseline,task.variant]) row.insertCell().textContent = count + " / " + task.n;
  }
  get("tasks").replaceChildren(table);
}

for (const [index, comparison] of RESEARCH.comparisons.entries()) {
  const label = comparison.label + " · " + comparison.n + " pairs";
  get("cohort").add(new Option(label, index));
}
get("cohort").addEventListener("change", event => showPairs(Number(event.target.value)));
setControls("steps", illustrateSteps);
setControls("timing", showLatency);
illustrateSteps(10);
showLatency("isolated");
showPairs(0);
document.documentElement.classList.add("ready");
