export function confirmModal({ title, body, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-title">${title}</div>
        <div class="modal-body">${body}</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="modalCancel">Cancel</button>
          <button class="btn ${danger ? "btn-primary" : "btn-primary"}" id="modalConfirm" style="${
      danger ? "background:var(--red);color:#2a0f0f;" : ""
    }">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector("#modalCancel").addEventListener("click", () => cleanup(false));
    overlay.querySelector("#modalConfirm").addEventListener("click", () => cleanup(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}

export function customSheet(innerHTML, mount) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-sheet">${innerHTML}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  const sheet = overlay.querySelector(".modal-sheet");
  if (mount) mount(sheet, () => overlay.remove());
  return { overlay, sheet, close: () => overlay.remove() };
}
