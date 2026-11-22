const PER_PERSON_TARGET = 155000;
const STORAGE_KEY = "roam-fund-vietnam-v2";

const defaultState = {
  travellers: 1,
  tripDate: "2027-11",
  contributions: []
};

let state = loadState();

const els = {
  depositForm: document.querySelector("#depositForm"),
  amountInput: document.querySelector("#amountInput"),
  savedDisplay: document.querySelector("#savedDisplay"),
  goalDisplay: document.querySelector("#goalDisplay"),
  remainingDisplay: document.querySelector("#remainingDisplay"),
  percentDisplay: document.querySelector("#percentDisplay"),
  progressFill: document.querySelector("#progressFill"),
  progressTrack: document.querySelector(".progress-track"),
  paceDisplay: document.querySelector("#paceDisplay"),
  travellerCount: document.querySelector("#travellerCount"),
  tripDate: document.querySelector("#tripDate"),
  activityList: document.querySelector("#activityList"),
  emptyState: document.querySelector("#emptyState"),
  clearActivity: document.querySelector("#clearActivity"),
  toast: document.querySelector("#toast")
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored ? { ...defaultState, ...stored } : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function getSaved() {
  return state.contributions.reduce((total, item) => total + item.amount, 0);
}

function getMonthsRemaining() {
  if (!state.tripDate) return 0;
  const [year, month] = state.tripDate.split("-").map(Number);
  const now = new Date();
  return Math.max(1, (year - now.getFullYear()) * 12 + month - now.getMonth());
}

function render() {
  const target = PER_PERSON_TARGET * state.travellers;
  const saved = getSaved();
  const remaining = Math.max(0, target - saved);
  const percent = Math.min(100, Math.round((saved / target) * 100));
  const months = getMonthsRemaining();

  els.savedDisplay.textContent = formatCurrency(saved);
  els.goalDisplay.textContent = formatCurrency(target);
  els.remainingDisplay.textContent = formatCurrency(remaining);
  els.percentDisplay.textContent = `${percent}%`;
  els.progressFill.style.width = `${percent}%`;
  els.progressTrack.setAttribute("aria-valuenow", percent);
  els.travellerCount.textContent = state.travellers;
  els.tripDate.value = state.tripDate;

  if (!saved) {
    els.paceDisplay.textContent = "Start your first deposit";
  } else if (!remaining) {
    els.paceDisplay.textContent = "Target reached — Vietnam awaits!";
  } else if (months) {
    els.paceDisplay.textContent = `${formatCurrency(Math.ceil(remaining / months))}/month to goal`;
  }

  renderActivity();
}

function renderActivity() {
  els.activityList.innerHTML = "";
  els.emptyState.hidden = state.contributions.length > 0;
  els.clearActivity.hidden = state.contributions.length === 0;

  [...state.contributions].reverse().slice(0, 6).forEach((item) => {
    const li = document.createElement("li");
    const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.date));
    li.innerHTML = `
      <span class="activity-dot">+</span>
      <span class="activity-copy"><strong>Savings added</strong><small>${date}</small></span>
      <span class="activity-amount">+${formatCurrency(item.amount)}</span>
      <button class="delete-entry" type="button" aria-label="Delete ${formatCurrency(item.amount)} contribution" data-id="${item.id}">×</button>
    `;
    els.activityList.appendChild(li);
  });
}

function addContribution(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.contributions.push({ id: crypto.randomUUID(), amount: Math.round(amount), date: new Date().toISOString() });
  saveState();
  render();
  showToast(`${formatCurrency(amount)} added to your fund`);
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

els.depositForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addContribution(Number(els.amountInput.value));
  els.amountInput.value = "";
  els.amountInput.focus();
});

document.querySelectorAll("[data-amount]").forEach((button) => {
  button.addEventListener("click", () => addContribution(Number(button.dataset.amount)));
});

document.querySelector("#decreaseTravellers").addEventListener("click", () => {
  state.travellers = Math.max(1, state.travellers - 1);
  saveState();
  render();
});

document.querySelector("#increaseTravellers").addEventListener("click", () => {
  state.travellers = Math.min(12, state.travellers + 1);
  saveState();
  render();
});

els.tripDate.addEventListener("change", () => {
  state.tripDate = els.tripDate.value;
  saveState();
  render();
});

els.activityList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  state.contributions = state.contributions.filter((item) => item.id !== button.dataset.id);
  saveState();
  render();
  showToast("Contribution removed");
});

els.clearActivity.addEventListener("click", () => {
  state.contributions = [];
  saveState();
  render();
  showToast("Savings activity cleared");
});

document.querySelector("#resetButton").addEventListener("click", () => {
  if (!window.confirm("Reset travellers, date and all savings activity?")) return;
  state = structuredClone(defaultState);
  saveState();
  render();
  showToast("Dashboard reset");
});

render();
