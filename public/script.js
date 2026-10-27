const CATEGORIES = {
    Food: "--c-food",
    Travel: "--c-travel",
    Shopping: "--c-shopping",
    Bills: "--c-bills",
    Education: "--c-education",
    Others: "--c-others",
};

// Anonymous per-browser ID so each visitor sees only their own expenses.
function getClientId() {
    let id = localStorage.getItem("ledger-client-id");
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem("ledger-client-id", id);
    }
    return id;
}
const headers = { "Content-Type": "application/json", "X-Client-Id": getClientId() };

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const money = (n) => fmt.format(n);

const $ = (id) => document.getElementById(id);
const form = $("expenseForm");
const els = {
    title: $("title"), amount: $("amount"), date: $("date"),
    chips: $("categoryChips"), error: $("formError"), submit: $("submitBtn"),
    list: $("expenses"), total: $("total"), totalCount: $("totalCount"),
    search: $("search"), filter: $("filter"), filteredTotal: $("filteredTotal"),
    breakdown: $("breakdown"), statMonth: $("statMonth"), statAvg: $("statAvg"), statTop: $("statTop"),
};

let expenses = [];
let selectedCategory = "Food";

// ---------- Setup ----------
const today = () => new Date().toLocaleDateString("en-CA");
els.date.value = today();

for (const [name, cssVar] of Object.entries(CATEGORIES)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = name;
    chip.setAttribute("role", "radio");
    chip.style.setProperty("--c", `var(${cssVar})`);
    chip.addEventListener("click", () => selectCategory(name));
    els.chips.append(chip);

    els.filter.append(new Option(name, name));
}

function selectCategory(name) {
    selectedCategory = name;
    for (const chip of els.chips.children) {
        chip.setAttribute("aria-checked", String(chip.textContent === name));
    }
}
selectCategory(selectedCategory);

// ---------- API ----------
async function api(path, options = {}) {
    const res = await fetch(path, { headers, ...options });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
}

async function load() {
    try {
        expenses = await api("/api/expenses");
    } catch (err) {
        toast("Couldn't load expenses: " + err.message, true);
    }
    render();
}

// ---------- Rendering ----------
function render() {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    els.total.textContent = money(total);
    els.totalCount.textContent = `${expenses.length} ${expenses.length === 1 ? "entry" : "entries"}`;

    renderStats(total);
    renderBreakdown(total);
    renderList();
}

function renderStats(total) {
    const month = today().slice(0, 7);
    const monthTotal = expenses.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + e.amount, 0);
    els.statMonth.textContent = money(monthTotal);
    els.statAvg.textContent = money(expenses.length ? total / expenses.length : 0);

    const byCat = totalsByCategory();
    els.statTop.textContent = byCat.length ? byCat[0][0] : "—";
}

function totalsByCategory() {
    const map = {};
    for (const e of expenses) map[e.category] = (map[e.category] || 0) + e.amount;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function renderBreakdown(total) {
    const rows = totalsByCategory();
    els.breakdown.innerHTML = "";
    if (!rows.length) {
        els.breakdown.innerHTML = '<li class="empty">Add an expense to see your breakdown.</li>';
        return;
    }
    for (const [cat, amt] of rows) {
        const li = document.createElement("li");
        li.className = "bar-row";
        li.title = `Show only ${cat}`;
        li.style.setProperty("--c", `var(${CATEGORIES[cat] || CATEGORIES.Others})`);
        const pct = total ? (amt / total) * 100 : 0;
        li.innerHTML = `
            <span class="bar-name"></span>
            <span class="bar-amt">${money(amt)} · ${pct.toFixed(0)}%</span>
            <div class="bar-track"><div class="bar-fill"></div></div>`;
        li.querySelector(".bar-name").textContent = cat;
        li.addEventListener("click", () => {
            els.filter.value = els.filter.value === cat ? "" : cat;
            renderList();
        });
        els.breakdown.append(li);
        requestAnimationFrame(() => (li.querySelector(".bar-fill").style.width = pct + "%"));
    }
}

function renderList() {
    const q = els.search.value.trim().toLowerCase();
    const cat = els.filter.value;
    const visible = expenses.filter(
        (e) => (!cat || e.category === cat) && (!q || e.title.toLowerCase().includes(q))
    );

    els.list.innerHTML = "";
    if (!visible.length) {
        els.list.innerHTML = `<li class="empty">${expenses.length ? "No expenses match your filters." : "No expenses added yet."}</li>`;
    }
    for (const e of visible) els.list.append(itemEl(e));

    const filtered = q || cat;
    els.filteredTotal.textContent = filtered && visible.length
        ? `Showing ${visible.length} of ${expenses.length} · ${money(visible.reduce((s, e) => s + e.amount, 0))}`
        : "";
}

function itemEl(e) {
    const li = document.createElement("li");
    li.className = "item";
    li.style.setProperty("--c", `var(${CATEGORIES[e.category] || CATEGORIES.Others})`);
    const dateStr = new Date(e.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    li.innerHTML = `
        <span class="item-dot"></span>
        <div><div class="item-title"></div><div class="item-meta"></div></div>
        <span class="item-amt">${money(e.amount)}</span>
        <button class="item-del" aria-label="Delete expense" title="Delete">✕</button>`;
    li.querySelector(".item-dot").textContent = e.category[0];
    li.querySelector(".item-title").textContent = e.title;
    li.querySelector(".item-meta").textContent = `${e.category} · ${dateStr}`;
    li.querySelector(".item-del").addEventListener("click", () => remove(e, li));
    return li;
}

// ---------- Actions ----------
form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    els.error.textContent = "";
    for (const f of [els.title, els.amount, els.date]) f.classList.toggle("invalid", !f.checkValidity());

    const title = els.title.value.trim();
    const amount = parseFloat(els.amount.value);
    if (!title) return showError("Please enter an expense name.", els.title);
    if (!(amount > 0)) return showError("Please enter an amount greater than 0.", els.amount);
    if (!els.date.value) return showError("Please pick a date.", els.date);

    els.submit.disabled = true;
    els.submit.textContent = "Adding…";
    try {
        const created = await api("/api/expenses", {
            method: "POST",
            body: JSON.stringify({ title, amount, category: selectedCategory, date: els.date.value }),
        });
        expenses.unshift(created);
        expenses.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        render();
        bumpTotal();
        toast(`Added ${title} — ${money(amount)}`);
        els.title.value = "";
        els.amount.value = "";
        els.title.focus();
    } catch (err) {
        showError(err.message);
    } finally {
        els.submit.disabled = false;
        els.submit.textContent = "Add expense";
    }
});

function showError(msg, field) {
    els.error.textContent = msg;
    field?.focus();
}

async function remove(e, li) {
    li.classList.add("removing");
    try {
        await api(`/api/expenses/${e.id}`, { method: "DELETE" });
        expenses = expenses.filter((x) => x.id !== e.id);
        setTimeout(() => { render(); bumpTotal(); }, 200);
        toast(`Deleted ${e.title}`);
    } catch (err) {
        li.classList.remove("removing");
        toast("Couldn't delete: " + err.message, true);
    }
}

els.search.addEventListener("input", renderList);
els.filter.addEventListener("change", renderList);

// ---------- Feedback ----------
function bumpTotal() {
    const badge = document.querySelector(".total-badge");
    badge.classList.remove("bump");
    void badge.offsetWidth;
    badge.classList.add("bump");
}

let toastTimer;
function toast(msg, isError = false) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("error", isError);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

load();
