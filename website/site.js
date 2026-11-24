const get = (id) => document.getElementById(id);
const percent = (count, n) => ((count * 100) / n).toFixed(1);
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(1);

function setControls(attribute, render) {
  const buttons = document.querySelectorAll("button[data-" + attribute + "]");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      for (const other of buttons)
        other.setAttribute("aria-pressed", String(other === button));
      render(button.dataset[attribute]);
    });
  }
}

function illustrateSteps(value) {
  get("step-label").textContent =
    value +
    (Number(value) === 1 ? " Euler update" : " Euler updates") +
    " turn" +
    (Number(value) === 1 ? "s" : "") +
    " noise into an action chunk.";
  const marks = Array.from({ length: Number(value) }, (_, index) => {
    const mark = document.createElement("i");
    mark.style.setProperty("--n", index);
    return mark;
  });
  get("steps").replaceChildren(...marks);
}

const phases = [
  "Read the current camera views, task instruction and robot state.",
  "Encode the inputs once and cache features for the action expert.",
  "Reuse that cache for each Euler update as the expert refines a noisy action chunk.",
  "Execute the first predicted action. Read the updated scene on the next replan.",
];
let replayTimer;
let phase = 0;

function advanceReplan() {
  phase += 1;
  get("pipeline").dataset.phase = String(phase);
  get("replan-note").textContent =
    "Step " + phase + " of 4. " + phases[phase - 1];
  if (phase === phases.length) {
    replayTimer = undefined;
    get("run-plan").textContent = "Replay a replan";
  } else {
    replayTimer = setTimeout(advanceReplan, 1400);
  }
}

get("run-plan").addEventListener("click", () => {
  if (replayTimer !== undefined) {
    clearTimeout(replayTimer);
    replayTimer = undefined;
    get("run-plan").textContent = "Resume the replan";
    return;
  }
  if (phase === phases.length) phase = 0;
  get("run-plan").textContent = "Pause the replan";
  advanceReplan();
});

const hero = get("hero-video");
const frameButtons = [...document.querySelectorAll("[data-frame]")];
let pendingFrame;
function markFrame(time) {
  const active = frameButtons.findLast(
    (button) => Number(button.dataset.frame) <= time + 0.05,
  );
  for (const button of frameButtons)
    button.setAttribute("aria-pressed", String(button === active));
}

for (const button of frameButtons) {
  button.addEventListener("click", () => {
    const time = Number(button.dataset.frame);
    hero.pause();
    if (hero.readyState > 0) {
      hero.currentTime = time;
    } else {
      if (pendingFrame === undefined) {
        hero.preload = "metadata";
        hero.load();
      }
      pendingFrame = time;
    }
    markFrame(time);
  });
}
hero.addEventListener("loadedmetadata", () => {
  if (pendingFrame !== undefined) {
    hero.currentTime = pendingFrame;
    pendingFrame = undefined;
  }
});
hero.addEventListener("error", () => {
  pendingFrame = undefined;
  markFrame(0);
});
hero.addEventListener("timeupdate", () => markFrame(hero.currentTime));
hero.addEventListener("seeking", () => markFrame(hero.currentTime));

const recordings = [...document.querySelectorAll("[data-trace]")];
const clips = [hero, ...recordings];
for (const video of clips) {
  video.addEventListener("play", () => {
    for (const other of clips) if (other !== video) other.pause();
  });
}
let activeTrace;
for (const video of recordings) {
  const followTrace = () => {
    const needle = get("trace-needle");
    needle.hidden = false;
    needle.style.setProperty(
      "--playhead",
      Math.min(100, ((video.currentTime * 20) / 280) * 100) + "%",
    );
  };
  for (const event of ["play", "seeking"]) {
    video.addEventListener(event, () => {
      activeTrace = video;
      followTrace();
    });
  }
  video.addEventListener("timeupdate", () => {
    if (activeTrace === video) followTrace();
  });
}

function showLatency(mode) {
  const isolated = mode === "isolated";
  const fp16 = RESEARCH.isolated.filter((item) => item.precision === "FP16");
  const ten = fp16.find((item) => item.steps === 10);
  const three = fp16.find((item) => item.steps === 3);
  const loop = RESEARCH.loop.map((row, index) => ({
    ...row,
    kind: ["released", "eager", "graph"][index],
  }));
  const values = isolated
    ? [
        { ...loop[0], ms: RESEARCH.isolated[0].eager },
        { label: "FP16 · 10 steps, eager", ms: ten.eager, kind: "precision" },
        { ...loop[1], ms: three.eager },
        { ...loop[2], ms: three.graph },
      ]
    : loop;
  const rows = values.map(({ label, ms: value, kind }) => {
    const row = document.createElement("div");
    row.dataset.kind = kind;
    row.className = "row";
    const name = document.createElement("span");
    name.textContent = label;
    const bar = document.createElement("i");
    bar.style.setProperty("--w", (value / 900) * 100 + "%");
    const result = document.createElement("b");
    result.textContent = value.toFixed(1) + " ms";
    row.append(name, bar, result);
    return row;
  });
  get("bars").replaceChildren(...rows);
  get("timing-note").textContent = isolated
    ? "7.1× faster with three-step FP16 and graph replay. The isolated profile uses 60 warmed batch-one calls per configuration."
    : "7.6× faster with three-step FP16 and graph replay. Each value is the median of episode-level median policy times across 20 episodes per configuration.";
}

function fillTimingTable() {
  const table = document.createElement("table");
  table.innerHTML =
    "<caption>Median replan latency in milliseconds</caption><thead><tr><th scope='col'>Precision</th><th scope='col'>Euler steps</th><th scope='col'>Eager</th><th scope='col'>CUDA graph</th></tr></thead>";
  const body = table.createTBody();
  for (const { precision, steps, eager, graph } of RESEARCH.isolated) {
    const row = body.insertRow();
    for (const value of [
      precision,
      steps,
      eager.toFixed(1),
      graph.toFixed(1),
    ]) {
      row.insertCell().textContent = value;
    }
  }
  get("timing-table").replaceChildren(table);
}

function drawInterval(estimate, [low, high]) {
  const scale = get("confidence-scale");
  const min = Math.min(-10, Math.floor((low - 2) / 5) * 5);
  const max = Math.max(10, Math.ceil((high + 2) / 5) * 5);
  get("ci-min").textContent = min + " pp";
  get("ci-max").textContent = "+" + max + " pp";
  const position = (value) => ((value - min) / (max - min)) * 100;
  const values = {
    margin: position(-5),
    zero: position(0),
    low: position(low),
    interval: position(high) - position(low),
    estimate: position(estimate),
  };
  for (const [name, value] of Object.entries(values))
    scale.style.setProperty("--" + name, value + "%");
}

function showPairs(index) {
  const c = RESEARCH.comparisons[index];
  const delta = ((c.variant - c.baseline) * 100) / c.n;
  drawInterval(delta, c.ci);
  get("difference").innerHTML = signed(delta) + " <small>pp</small>";
  get("rates").textContent =
    percent(c.baseline, c.n) +
    "% released · " +
    percent(c.variant, c.n) +
    "% variant · " +
    c.n +
    " matched pairs";
  get("interval").textContent =
    "Paired 95% interval: " +
    c.ci.map(signed).join(" to ") +
    " percentage points.";
  const categories = [
    ["both", "Both succeed", c.both],
    ["lost", "Released only", c.baselineOnly],
    ["gained", "Variant only", c.variantOnly],
    ["none", "Neither", c.neither],
  ];
  const cells = document.createDocumentFragment();
  const legend = document.createElement("span");
  legend.className = "legend";
  for (const [kind, label, count] of categories) {
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
  get("pair-caption").replaceChildren(
    legend,
    "Each mark represents one matched pair of episodes.",
  );
  const interpretation =
    c.ci[0] > -5
      ? "The lower bound clears the prespecified −5-point non-inferiority margin."
      : "The lower bound falls below the prespecified −5-point margin, so the experiment leaves non-inferiority unestablished.";
  const context =
    index === 0
      ? " The pooled analysis includes 300 pairs added after the 200-pair interim analysis."
      : index === 1
        ? " This one-step confirmation was specified before its run on 300 additional pairs."
        : "";
  get("decision").textContent = interpretation + context;
  const table = document.createElement("table");
  table.innerHTML =
    "<caption>Successful episodes by bowl location</caption><thead><tr><th scope='col'>Target bowl</th><th scope='col'>Released</th><th scope='col'>Variant</th></tr></thead>";
  const body = table.createTBody();
  for (const task of c.tasks) {
    const row = body.insertRow();
    row.insertCell().textContent = task.name;
    for (const count of [task.baseline, task.variant])
      row.insertCell().textContent = count + " / " + task.n;
  }
  get("tasks").replaceChildren(table);
}

for (const [index, comparison] of RESEARCH.comparisons.entries()) {
  const label = comparison.label + " · " + comparison.n + " pairs";
  get("cohort").add(new Option(label, index));
}
get("cohort").addEventListener("change", (event) =>
  showPairs(Number(event.target.value)),
);
setControls("steps", illustrateSteps);
setControls("timing", showLatency);
illustrateSteps(10);
showLatency("isolated");
fillTimingTable();
showPairs(0);
document.documentElement.classList.add("ready");
