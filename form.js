(function () {
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const C = window.HAISE_CONFIG, K = window.HAISE_CATALOG;
const MAX_MB = C.MAX_FILE_MB || 15;
const FILE_TAGS = ["Reference", "Logo", "Sketch / draft", "Other"];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rm = (n) => "RM " + n.toLocaleString("en-MY");

$("#maxMb").textContent = MAX_MB;
if (!Store.live) $("#demoBanner").hidden = false;

const form = $("#orderForm");
// Per jersey type state: { collar, sizes: {M: 3}, people: [{name, number, size}] }
const picked = {};
const typeById = Object.fromEntries(K.jerseyTypes.map((t) => [t.id, t]));

// ---------- jersey type cards ----------
$("#types").innerHTML = K.jerseyTypes.map((t) => `<div class="type" data-type="${t.id}">
  <label><input type="checkbox" name="jtype" value="${t.id}"><span>${esc(t.name)}</span>
    <span style="display:flex;gap:10px;align-items:center"><span class="price" data-price>${rm(t.price)}</span><span class="tick"></span></span></label>
  ${t.collar ? `<div class="collar" hidden><div class="seg" role="radiogroup" aria-label="${esc(t.name)} collar">${K.collarOptions.map((c, i) => `<label><input type="radio" name="collar-${t.id}" value="${esc(c)}" ${i === 0 ? "checked" : ""}>${esc(c)}</label>`).join("")}</div></div>` : ""}
</div>`).join("");
$("#materials").innerHTML = K.materials.map((m, i) => `<label><input type="radio" name="material" value="${esc(m)}" ${i === 0 ? "checked" : ""}>${esc(m)}</label>`).join("");

const service = () => form.service.value;
const dtype = () => form.designType.value;
const printing = () => service() === "design_print";
const nameOpt = () => form.nameOpt.value;
const selectedIds = () => $$("[name=jtype]:checked").map((i) => i.value);

function sync() {
  const p = printing();
  // Printing is for jerseys only
  ["Shirt", "Logo", "Poster"].forEach((v) => { const i = $(`[name=designType][value=${v}]`); i.disabled = p; if (p && i.checked) i.checked = false; });
  if (p && !dtype()) $("#dt-jersey").checked = true;
  $("#printOnlyHint").hidden = !p;

  const type = dtype();
  const garment = type === "Jersey" || type === "Shirt";
  $("#detailsSec").hidden = !type;
  $("#detailsTitle").textContent = type ? `${type} design details` : "Design details";
  $("#typeBox").hidden = !garment;
  $("#typeLabel").textContent = type === "Shirt" ? "Shirt type" : "Jersey type";
  $("#nameBox").hidden = !garment;
  $("#posterBox").hidden = type !== "Poster";
  $("#logoBox").hidden = type !== "Logo";
  $$("[data-price]").forEach((el) => (el.hidden = !p));
  $$(".type").forEach((el) => { const c = el.querySelector(".collar"); if (c) c.hidden = !el.querySelector("[name=jtype]").checked; });

  $("#printSec").hidden = !(p && type === "Jersey");
  $("#contactN").textContent = !type ? 3 : (p ? 5 : 4);
  $("#addrBox").hidden = $("#delivery").value !== "postage";
  drawPrintItems();
}

// ---------- printing: per type sizes / names ----------
const blankPerson = () => ({ name: "", number: "", size: "M" });
function itemQty(id) {
  const s = picked[id];
  if (!s) return 0;
  return nameOpt() === "none" ? Object.values(s.sizes).reduce((a, b) => a + (+b || 0), 0) : s.people.filter((x) => x.name.trim()).length;
}
function drawPrintItems() {
  if ($("#printSec").hidden) return;
  const ids = selectedIds();
  ids.forEach((id) => (picked[id] = picked[id] || { sizes: {}, people: [blankPerson()] }));
  const withNames = nameOpt() !== "none", withNum = nameOpt() === "name_number";
  $("#printItems").innerHTML = ids.length ? ids.map((id) => {
    const t = typeById[id], s = picked[id];
    const collar = t.collar ? ` · ${esc(collarOf(id))} collar` : "";
    const body = !withNames
      ? `<div class="sizes">${K.sizes.map((z) => `<label>${z}<input type="number" min="0" inputmode="numeric" data-item="${id}" data-size="${z}" value="${s.sizes[z] || ""}" placeholder="0" id="q-${id}-${z}"></label>`).join("")}</div>`
      : `<div class="people">
          <div class="person ${withNum ? "" : "no-num"} people-head"><span></span><span>Name on jersey</span>${withNum ? "<span>No.</span>" : ""}<span>Size</span><span></span></div>
          ${s.people.map((x, i) => `<div class="person ${withNum ? "" : "no-num"}"><span class="i">${i + 1}</span>
            <input data-item="${id}" data-p="${i}" data-k="name" value="${esc(x.name)}" placeholder="e.g. AIMAN" aria-label="Name ${i + 1}" id="n-${id}-${i}">
            ${withNum ? `<input data-item="${id}" data-p="${i}" data-k="number" value="${esc(x.number)}" inputmode="numeric" placeholder="No." aria-label="Number ${i + 1}" id="no-${id}-${i}">` : ""}
            <select data-item="${id}" data-p="${i}" data-k="size" aria-label="Size ${i + 1}" id="s-${id}-${i}">${K.sizes.map((z) => `<option ${z === x.size ? "selected" : ""}>${z}</option>`).join("")}</select>
            <button type="button" data-item="${id}" data-rmp="${i}" aria-label="Remove person">×</button></div>`).join("")}
          <div><button type="button" class="btn small" data-item="${id}" data-addp>+ Add person</button></div></div>`;
    return `<div class="pitem"><div class="pitem-h"><b>${esc(t.name)}${collar}</b><span data-sum="${id}"></span></div>${body}</div>`;
  }).join("") : `<p class="hint">Pick at least one jersey type in step 3 to enter sizes${withNames ? " and names" : ""}.</p>`;
  updateTotals();
}
function collarOf(id) { const r = $(`[name=collar-${id}]:checked`); return r ? r.value : ""; }
function updateTotals() {
  let pcs = 0, est = 0;
  selectedIds().forEach((id) => {
    const q = itemQty(id), t = typeById[id];
    pcs += q; est += q * t.price;
    const el = $(`[data-sum="${id}"]`); if (el) el.textContent = `${q} pcs × ${rm(t.price)} = ${rm(q * t.price)}`;
  });
  $("#estimate").innerHTML = `<span>Total <b>${pcs} pcs</b></span><span>Estimated <b>${rm(est)}</b> <span class="hint">(final price in your quotation)</span></span>`;
}
$("#printItems").addEventListener("input", (e) => {
  const d = e.target.dataset, s = picked[d.item]; if (!s) return;
  if (d.size) s.sizes[d.size] = +e.target.value || 0;
  if (d.k) s.people[d.p][d.k] = e.target.value;
  updateTotals();
});
$("#printItems").addEventListener("change", (e) => { const d = e.target.dataset; if (d.k === "size") picked[d.item].people[d.p].size = e.target.value; });
$("#printItems").addEventListener("click", (e) => {
  const d = e.target.dataset, s = picked[d.item]; if (!s) return;
  if (d.addp !== undefined) {
    const last = s.people[s.people.length - 1];
    s.people.push({ name: "", number: "", size: last ? last.size : "M" });
    drawPrintItems();
    const inp = $(`#n-${d.item}-${s.people.length - 1}`); inp && inp.focus();
  }
  if (d.rmp !== undefined) { s.people.splice(+d.rmp, 1); if (!s.people.length) s.people.push(blankPerson()); drawPrintItems(); }
});
// Enter in a name field adds the next person
$("#printItems").addEventListener("keydown", (e) => {
  const d = e.target.dataset;
  if (e.key === "Enter" && d.k) { e.preventDefault(); const s = picked[d.item]; if (+d.p === s.people.length - 1) $(`[data-addp][data-item="${d.item}"]`).click(); else $(`#n-${d.item}-${+d.p + 1}`)?.focus(); }
});

form.addEventListener("change", (e) => { if (e.target.closest("#printItems")) return; sync(); });

// ---------- colours ----------
let colors = ["#1b2a4a", "#d4af37"];
function drawColors() {
  $("#colors").innerHTML = colors.map((c, i) => `<div class="sw" style="background:${c}"><input type="color" value="${c}" data-i="${i}" aria-label="Colour ${i + 1}" id="col-${i}"><button type="button" data-rm="${i}" aria-label="Remove colour">×</button></div>`).join("")
    + (colors.length < 6 ? `<button type="button" class="btn small" id="addColor">+ Add colour</button>` : "");
}
$("#colors").addEventListener("input", (e) => { if (e.target.dataset.i) { colors[e.target.dataset.i] = e.target.value; e.target.parentElement.style.background = e.target.value; } });
$("#colors").addEventListener("click", (e) => {
  if (e.target.id === "addColor") { colors.push("#5fa69b"); drawColors(); }
  if (e.target.dataset.rm) { colors.splice(+e.target.dataset.rm, 1); drawColors(); }
});
drawColors();

// ---------- files ----------
let files = [];
function addFiles(list) {
  for (const f of list) {
    if (f.size > MAX_MB * 1024 * 1024) { $("#err").textContent = `${f.name} is larger than ${MAX_MB} MB.`; continue; }
    const img = f.type.startsWith("image/");
    files.push({ file: f, tag: img ? "Reference" : "Other", url: img ? URL.createObjectURL(f) : null });
  }
  drawFiles();
}
function drawFiles() {
  $("#fileList").innerHTML = files.map((x, i) => `<div class="file">
    <div class="th" style="${x.url ? `background-image:url(${x.url})` : ""}">${x.url ? "" : esc((x.file.name.split(".").pop() || "").toUpperCase().slice(0, 4))}</div>
    <div class="meta"><div class="nm">${esc(x.file.name)}</div>
      <select data-tag="${i}" aria-label="What is this file?">${FILE_TAGS.map((t) => `<option ${t === x.tag ? "selected" : ""}>${t}</option>`).join("")}</select></div>
    <button type="button" class="btn small ghost" data-rmf="${i}">Remove</button></div>`).join("");
}
const drop = $("#drop"), fileInput = $("#fileInput");
drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
$("#fileList").addEventListener("change", (e) => { if (e.target.dataset.tag) files[e.target.dataset.tag].tag = e.target.value; });
$("#fileList").addEventListener("click", (e) => { if (e.target.dataset.rmf) { files.splice(+e.target.dataset.rmf, 1); drawFiles(); } });

// ---------- submit ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#err"); err.textContent = "";
  const type = dtype(), svc = service(), garment = type === "Jersey" || type === "Shirt";
  const ids = garment ? selectedIds() : [];
  const nOpt = garment ? nameOpt() : "none";
  const isPrint = svc === "design_print";

  if (!svc) return (err.textContent = "Choose design only or design + printing.");
  if (!type) return (err.textContent = "Choose what we should design.");
  if (garment && !ids.length) return (err.textContent = `Pick at least one ${type.toLowerCase()} type.`);

  const items = ids.map((id) => {
    const t = typeById[id];
    const it = { id, name: t.name, collar: t.collar ? collarOf(id) : "", price: t.price };
    if (isPrint) {
      const s = picked[id] || { sizes: {}, people: [] };
      if (nOpt === "none") { it.sizes = Object.fromEntries(Object.entries(s.sizes).filter(([, q]) => q > 0)); it.qty = itemQty(id); }
      else {
        it.people = s.people.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), number: nOpt === "name_number" ? x.number.trim() : "", size: x.size }));
        it.qty = it.people.length;
        it.sizes = it.people.reduce((a, x) => ((a[x.size] = (a[x.size] || 0) + 1), a), {});
      }
    }
    return it;
  });
  if (isPrint) {
    const empty = items.find((i) => !i.qty);
    if (empty) return (err.textContent = nOpt === "none" ? `Enter quantities by size for ${empty.name}.` : `Add at least one name for ${empty.name}.`);
  }
  if (!$("#name").value.trim() || !$("#phone").value.trim()) return (err.textContent = "Enter your name and WhatsApp number.");

  const qty = items.reduce((a, i) => a + (i.qty || 0), 0);
  const details = {
    v: 2, service: svc, designType: type, items, nameOption: nOpt,
    colors, colorNotes: $("#colorNotes").value.trim(),
    brief: $("#brief").value.trim(),
    poster: type === "Poster" ? { size: $("#posterSize").value, text: $("#posterText").value.trim() } : null,
    logo: type === "Logo" ? { name: $("#logoName").value.trim(), slogan: $("#logoSlogan").value.trim() } : null,
    printing: isPrint ? { qty, material: form.material.value, needBy: $("#needBy").value, delivery: $("#delivery").value } : null,
    fileTags: files.map((x) => x.tag),
  };
  const customer = { name: $("#name").value.trim(), phone: $("#phone").value.trim(), email: $("#email").value.trim(), org: $("#org").value.trim(), address: $("#address").value.trim() };

  const btn = $("#submitBtn"); btn.disabled = true; btn.textContent = "Sending…";
  try {
    const no = await Store.submitOrder({ customer, details }, files.map((x) => x.file), (i, n) => { btn.textContent = `Uploading ${i + 1} of ${n}…`; });
    $("#orderNo").textContent = no;
    const msg = `Hi Haise Design, I just placed order ${no} (${type}, ${isPrint ? `design + printing, ${qty} pcs` : "design only"}). Name: ${customer.name}`;
    $("#waBtn").href = `https://wa.me/${C.WHATSAPP}?text=${encodeURIComponent(msg)}`;
    $("#formView").hidden = true; $("#doneView").hidden = false; window.scrollTo(0, 0);
  } catch (ex) {
    err.textContent = "Your order wasn't sent: " + ex.message + ". Please try again.";
    btn.disabled = false; btn.textContent = "Send my order";
  }
});
$("#againBtn").addEventListener("click", () => location.reload());
sync();
})();
