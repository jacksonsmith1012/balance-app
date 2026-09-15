import { clamp } from "./math.js";

/**
 * Creates a vertical drag slider DOM element.
 * options: { color, label, sub, value, onChange(value), onCommit(value), interactive }
 * Returns { el, setValue(value), setSub(text) }.
 */
export function createVerticalSlider(options) {
  const {
    color,
    label,
    sub = "",
    value = 50,
    onChange = () => {},
    onCommit = () => {},
    interactive = true,
  } = options;

  const col = document.createElement("div");
  col.className = "slider-col";
  col.style.setProperty("--slider-color", color);

  const valueEl = document.createElement("div");
  valueEl.className = "slider-value";

  const shell = document.createElement("div");
  shell.className = "slider-shell";

  const fill = document.createElement("div");
  fill.className = "slider-fill";

  const thumb = document.createElement("div");
  thumb.className = "slider-thumb";

  shell.appendChild(fill);
  shell.appendChild(thumb);

  const labelEl = document.createElement("div");
  labelEl.className = "slider-label";
  labelEl.textContent = label;

  const subEl = document.createElement("div");
  subEl.className = "slider-sub";
  subEl.textContent = sub;
  labelEl.appendChild(document.createElement("br"));
  labelEl.appendChild(subEl);

  col.appendChild(valueEl);
  col.appendChild(shell);
  col.appendChild(labelEl);

  let current = clamp(value);

  function render() {
    fill.style.height = `${current}%`;
    thumb.style.bottom = `${current}%`;
    valueEl.textContent = `${Math.round(current)}%`;
  }
  render();

  function setValue(v, opts = {}) {
    current = clamp(v);
    render();
    if (!opts.silent) onChange(current);
  }

  function setSub(text) {
    subEl.textContent = text;
  }

  if (interactive) {
    let dragging = false;

    function valueFromClientY(clientY) {
      const rect = shell.getBoundingClientRect();
      const ratio = 1 - (clientY - rect.top) / rect.height;
      return clamp(ratio * 100);
    }

    function pointerDown(e) {
      dragging = true;
      shell.style.cursor = "grabbing";
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      setValue(valueFromClientY(clientY));
      e.preventDefault();
    }

    function pointerMove(e) {
      if (!dragging) return;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      setValue(valueFromClientY(clientY));
      e.preventDefault();
    }

    function pointerUp() {
      if (!dragging) return;
      dragging = false;
      shell.style.cursor = "grab";
      onCommit(current);
    }

    shell.addEventListener("mousedown", pointerDown);
    shell.addEventListener("touchstart", pointerDown, { passive: false });
    window.addEventListener("mousemove", pointerMove);
    window.addEventListener("touchmove", pointerMove, { passive: false });
    window.addEventListener("mouseup", pointerUp);
    window.addEventListener("touchend", pointerUp);
  }

  return { el: col, setValue, setSub, get value() { return current; } };
}
