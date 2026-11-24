{
  const player = document.getElementById("rollout");
  const video = player.querySelector("video");
  const playButton = document.getElementById("run-play");
  const playText = document.getElementById("run-play-text");
  const scrubber = document.getElementById("run-time");
  const trace = document.getElementById("run-trace");
  const stepDisplay = document.getElementById("run-step");
  const gripperDisplay = document.getElementById("run-gripper");
  const status = document.getElementById("run-status");
  const policyButtons = player.querySelectorAll("[data-run]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const fps = 20;
  const sceneSelect = document.getElementById("scene-select");
  let scene = SCENES.ramekin;
  let policy = "variant";
  let run = scene.runs[policy];
  let allowPlayback = !reducedMotion.matches;
  let inView = false;
  let frameRequest;

  function setTelemetry(time) {
    const step = Math.min(Math.floor(time * fps + 0.001), run.steps);
    const stepNumber = String(step).padStart(3, "0");
    const total = String(run.steps).padStart(3, "0");
    const command = run.closed.some(
      ([start, end]) => start <= step && step < end,
    );
    stepDisplay.textContent = stepNumber + " / " + total;
    gripperDisplay.textContent =
      step === run.steps ? "End of run" : command ? "Close" : "Open";
    scrubber.value = step;
    scrubber.setAttribute(
      "aria-valuetext",
      step + " of " + run.steps + " control steps",
    );
    trace.style.setProperty("--playhead", (step / run.steps) * 100 + "%");
    player.toggleAttribute("data-gripping", command);
  }

  function followFrames() {
    cancelAnimationFrame(frameRequest);
    if (video.paused) return;
    setTelemetry(video.currentTime);
    frameRequest = requestAnimationFrame(followFrames);
  }

  function playIfVisible() {
    if (allowPlayback && inView && !document.hidden) {
      video.play().catch(() => {
        // Native autoplay restrictions still allow the visitor to press Play.
      });
    }
  }

  function updateTransport() {
    const playing = !video.paused && !video.ended;
    player.toggleAttribute("data-playing", playing);
    playButton.setAttribute(
      "aria-label",
      playing ? "Pause recording" : "Play recording",
    );
    playText.textContent = playing ? "Pause" : "Play";
    if (playing) followFrames();
    else {
      cancelAnimationFrame(frameRequest);
      setTelemetry(video.currentTime);
    }
  }

  function setRun(nextRun) {
    run = nextRun;
    scrubber.max = run.steps;
    const spans = run.closed.map(([start, end]) => {
      const block = document.createElement("i");
      block.style.left = (start / run.steps) * 100 + "%";
      block.style.width = ((end - start) / run.steps) * 100 + "%";
      return block;
    });
    trace.replaceChildren(...spans);
    setTelemetry(0);
    status.textContent =
      run.label + " · " + run.outcome + " after " + run.steps + " actions.";
  }

  function loadRun() {
    video.pause();
    setRun(scene.runs[policy]);
    video.poster = run.poster;
    video.src = run.clip;
    video.setAttribute(
      "aria-label",
      "Recorded simulation of the " + run.label + " policy",
    );
    playIfVisible();
  }

  for (const button of policyButtons) {
    button.addEventListener("click", () => {
      if (policy === button.dataset.run) return;
      policy = button.dataset.run;
      for (const other of policyButtons)
        other.setAttribute("aria-pressed", String(other === button));
      loadRun();
    });
  }

  sceneSelect.addEventListener("change", () => {
    scene = SCENES[sceneSelect.value];
    document.getElementById("scene-id").textContent =
      "Task " + scene.task + " / State " + scene.state;
    document.getElementById("scene-prompt").textContent = scene.description;
    for (const [id, clip] of Object.entries(scene.runs)) {
      document.getElementById(id + "-summary").textContent =
        clip.steps + " steps · " + clip.outcome;
    }
    loadRun();
  });

  playButton.addEventListener("click", () => {
    allowPlayback = video.paused;
    if (allowPlayback)
      video.play().catch(() => {
        status.textContent =
          "The recording could not play. Try the videos below.";
      });
    else video.pause();
  });
  scrubber.addEventListener("input", () => {
    allowPlayback = false;
    video.pause();
    const time = Number(scrubber.value) / fps;
    video.currentTime = time;
    setTelemetry(time);
  });

  for (const event of ["play", "pause", "ended"])
    video.addEventListener(event, updateTransport);
  for (const event of ["seeked", "loadedmetadata"]) {
    video.addEventListener(event, () => setTelemetry(video.currentTime));
  }
  video.addEventListener("error", () => {
    status.textContent =
      "This clip could not load. Try the other recording or use the links below.";
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.intersectionRatio >= 0.4;
        if (inView) playIfVisible();
        else video.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) video.pause();
    else playIfVisible();
  });
  reducedMotion.addEventListener("change", (event) => {
    allowPlayback = !event.matches;
    if (allowPlayback) playIfVisible();
    else video.pause();
  });

  video.loop = true;
  video.controls = false;
  setRun(run);
  player.classList.add("lab-ready");
}

{
  const precision = document.getElementById("lab-precision");
  const steps = document.getElementById("lab-steps");
  const execution = document.getElementById("lab-execution");
  const latency = document.getElementById("lab-value");
  const bar = document.getElementById("lab-bar");
  const qualification = document.getElementById("lab-qualification");

  function updateTimingLab() {
    const row = RESEARCH.isolated.find(
      (item) =>
        item.precision === precision.value &&
        item.steps === Number(steps.value),
    );
    const ms = row[execution.value];
    const baseline = RESEARCH.isolated[0].eager;
    const speedup = baseline / ms;
    latency.textContent =
      ms.toFixed(1) +
      " ms" +
      (speedup > 1
        ? " · " + speedup.toFixed(1) + "× faster"
        : " · released reference");
    bar.style.setProperty("--ratio", ms / baseline);
    if (execution.value === "graph") {
      qualification.textContent =
        "GPU timing only for this setting. The larger paired success study used eager execution.";
    } else if (precision.value === "FP16" && steps.value === "3") {
      qualification.textContent =
        "This eager configuration is the variant in the 500-pair success comparison.";
    } else {
      const baselineConfiguration =
        precision.value === "BF16" && steps.value === "10";
      qualification.textContent = baselineConfiguration
        ? "This is the released policy used as the baseline in the paired success study."
        : "Compare the eager success data and its sample size in the outcome explorer below.";
    }
  }

  for (const input of [precision, steps, execution])
    input.addEventListener("change", updateTimingLab);
  updateTimingLab();
}
