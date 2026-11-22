const PER_PERSON_TARGET = 155000;
const PER_PERSON_MINIMUM = 75000;
const STORAGE_KEY = "roam-fund-vietnam-v2";
const CLIENT_KEY = "roam-fund-client-id";
const MIGRATION_KEY = "roam-fund-shared-migration-v1";

const defaultState = {
  travellers: 1,
  tripDate: "2027-11",
  contributions: [],
  totalSaved: 0,
  loading: true
};

let legacyContributions = [];
let state = loadState();
const clientId = getClientId();

const els = {
  depositForm: document.querySelector("#depositForm"),
  amountInput: document.querySelector("#amountInput"),
  savedDisplay: document.querySelector("#savedDisplay"),
  goalDisplay: document.querySelector("#goalDisplay"),
  remainingDisplay: document.querySelector("#remainingDisplay"),
  percentDisplay: document.querySelector("#percentDisplay"),
  progressFill: document.querySelector("#progressFill"),
  progressTrack: document.querySelector(".progress-track"),
  minimumMarker: document.querySelector("#minimumMarker"),
  minimumGoal: document.querySelector("#minimumGoal"),
  minimumDisplay: document.querySelector("#minimumDisplay"),
  minimumStatus: document.querySelector("#minimumStatus"),
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
    legacyContributions = Array.isArray(stored?.contributions) ? stored.contributions : [];
    return {
      ...structuredClone(defaultState),
      travellers: Number(stored?.travellers) || defaultState.travellers,
      tripDate: stored?.tripDate || defaultState.tripDate
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function getClientId() {
  const stored = localStorage.getItem(CLIENT_KEY);
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(CLIENT_KEY, id);
  return id;
}

function savePreferences() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    travellers: state.travellers,
    tripDate: state.tripDate
  }));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function getMonthsRemaining() {
  if (!state.tripDate) return 0;
  const [year, month] = state.tripDate.split("-").map(Number);
  const now = new Date();
  return Math.max(1, (year - now.getFullYear()) * 12 + month - now.getMonth());
}

function render() {
  const target = PER_PERSON_TARGET * state.travellers;
  const minimum = PER_PERSON_MINIMUM * state.travellers;
  const saved = state.totalSaved;
  const remaining = Math.max(0, target - saved);
  const minimumRemaining = Math.max(0, minimum - saved);
  const percent = Math.min(100, Math.round((saved / target) * 100));
  const months = getMonthsRemaining();

  els.savedDisplay.textContent = state.loading ? "—" : formatCurrency(saved);
  els.goalDisplay.textContent = formatCurrency(target);
  els.remainingDisplay.textContent = formatCurrency(remaining);
  els.percentDisplay.textContent = `${percent}%`;
  els.progressFill.style.width = `${percent}%`;
  els.progressTrack.setAttribute("aria-valuenow", percent);
  els.progressTrack.setAttribute("aria-valuetext", `${formatCurrency(saved)} saved; minimum ${formatCurrency(minimum)}; comfort target ${formatCurrency(target)}`);
  els.minimumMarker.style.left = `${(minimum / target) * 100}%`;
  els.minimumDisplay.textContent = formatCurrency(minimum);
  els.minimumGoal.classList.toggle("reached", minimumRemaining === 0 && !state.loading);
  els.minimumStatus.textContent = state.loading
    ? "Loading the shared fund…"
    : minimumRemaining === 0
      ? "Minimum reached — you’re ready to go!"
      : `${formatCurrency(minimumRemaining)} left to be ready to go`;
  els.travellerCount.textContent = state.travellers;
  els.tripDate.value = state.tripDate;

  if (state.loading) {
    els.paceDisplay.textContent = "Syncing shared savings…";
  } else if (!saved) {
    els.paceDisplay.textContent = "Start the shared fund";
  } else if (!remaining) {
    els.paceDisplay.textContent = "Target reached — Vietnam awaits!";
  } else if (months) {
    els.paceDisplay.textContent = `${formatCurrency(Math.ceil(remaining / months))}/month to goal`;
  }

  renderActivity();
}

function renderActivity() {
  els.activityList.innerHTML = "";
  els.emptyState.hidden = state.loading || state.contributions.length > 0;
  els.clearActivity.hidden = !state.contributions.some((item) => item.isOwn);

  state.contributions.slice(0, 8).forEach((item) => {
    const li = document.createElement("li");
    const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.date));
    const action = item.isOwn
      ? `<button class="delete-entry" type="button" aria-label="Delete ${formatCurrency(item.amount)} contribution" data-id="${item.id}">×</button>`
      : `<span class="shared-entry">Shared</span>`;
    li.innerHTML = `
      <span class="activity-dot">+</span>
      <span class="activity-copy"><strong>${item.isOwn ? "Your contribution" : "Fund contribution"}</strong><small>${date}</small></span>
      <span class="activity-amount">+${formatCurrency(item.amount)}</span>
      ${action}
    `;
    els.activityList.appendChild(li);
  });
}

async function requestSavings(path = "", options = {}) {
  const response = await fetch(`/api/savings${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The shared fund could not be updated");
  return data;
}

async function fetchSavings({ quiet = false } = {}) {
  try {
    const data = await requestSavings(`?clientId=${encodeURIComponent(clientId)}`);
    state.contributions = data.contributions;
    state.totalSaved = data.total;
    state.loading = false;
    render();
  } catch (error) {
    state.loading = false;
    render();
    if (!quiet) showToast(error.message || "Could not load shared savings");
  }
}

async function migrateLegacySavings() {
  if (!legacyContributions.length || localStorage.getItem(MIGRATION_KEY)) return;
  for (const item of legacyContributions) {
    await requestSavings("", {
      method: "POST",
      body: JSON.stringify({ amount: item.amount, clientId })
    });
  }
  localStorage.setItem(MIGRATION_KEY, "done");
  legacyContributions = [];
  savePreferences();
}

async function addContribution(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  setSaving(true);
  try {
    const data = await requestSavings("", {
      method: "POST",
      body: JSON.stringify({ amount: Math.round(amount), clientId })
    });
    state.contributions.unshift(data.contribution);
    state.totalSaved = data.total;
    render();
    showToast(`${formatCurrency(amount)} added to the shared fund`);
  } catch (error) {
    showToast(error.message || "Savings could not be added");
  } finally {
    setSaving(false);
  }
}

function setSaving(isSaving) {
  els.amountInput.disabled = isSaving;
  els.depositForm.querySelector(".primary-button").disabled = isSaving;
  document.querySelectorAll("[data-amount]").forEach((button) => { button.disabled = isSaving; });
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2800);
}

els.depositForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addContribution(Number(els.amountInput.value));
  els.amountInput.value = "";
  els.amountInput.focus();
});

document.querySelectorAll("[data-amount]").forEach((button) => {
  button.addEventListener("click", () => addContribution(Number(button.dataset.amount)));
});

document.querySelector("#decreaseTravellers").addEventListener("click", () => {
  state.travellers = Math.max(1, state.travellers - 1);
  savePreferences();
  render();
});

document.querySelector("#increaseTravellers").addEventListener("click", () => {
  state.travellers = Math.min(12, state.travellers + 1);
  savePreferences();
  render();
});

els.tripDate.addEventListener("change", () => {
  state.tripDate = els.tripDate.value;
  savePreferences();
  render();
});

els.activityList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  button.disabled = true;
  try {
    const data = await requestSavings(`/${encodeURIComponent(button.dataset.id)}`, {
      method: "DELETE",
      body: JSON.stringify({ clientId })
    });
    state.contributions = state.contributions.filter((item) => item.id !== button.dataset.id);
    state.totalSaved = data.total;
    render();
    showToast("Contribution removed from the shared fund");
  } catch (error) {
    button.disabled = false;
    showToast(error.message || "Contribution could not be removed");
  }
});

els.clearActivity.addEventListener("click", async () => {
  try {
    const data = await requestSavings("", {
      method: "DELETE",
      body: JSON.stringify({ clientId })
    });
    state.contributions = state.contributions.filter((item) => !item.isOwn);
    state.totalSaved = data.total;
    render();
    showToast("Your contributions were cleared");
  } catch (error) {
    showToast(error.message || "Contributions could not be cleared");
  }
});

document.querySelector("#resetButton").addEventListener("click", () => {
  if (!window.confirm("Reset traveller count and trip month? Shared savings will stay intact.")) return;
  state.travellers = defaultState.travellers;
  state.tripDate = defaultState.tripDate;
  savePreferences();
  render();
  showToast("Trip settings reset");
});

async function start() {
  render();
  try {
    await migrateLegacySavings();
  } catch {
    showToast("Your previous browser savings could not be migrated yet");
  }
  await fetchSavings();
  window.setInterval(() => fetchSavings({ quiet: true }), 15000);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") fetchSavings({ quiet: true });
});

start();
