const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const rm = (n) => "RM " + (Math.round(n * 100) % 100 ? n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(n).toLocaleString("en-MY"));
const today = () => new Date().toISOString().slice(0, 10);
const dmy = (iso) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d} / ${m} / ${y}`; };
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

let S = null;          // settings
let orders = [];
let doc = null;        // current invoice / receipt
let orderFilter = "all";
const STATUS = { new: "New", quoted: "Quoted", progress: "In progress", done: "Done" };

// ================= boot / auth =================
async function boot() {
  if (!Store.live) $("#demoBanner").hidden = false;
  const sess = await Store.session();
  if (!sess) { $("#loginView").hidden = false; return; }
  $("#loginView").hidden = true;
  $("#appView").hidden = false; $("#tabs").hidden = false; $("#logout").hidden = !Store.live;
  S = await Store.getSettings();
  migratePrices();
  doc = blankDoc();
  fillBuilder(); renderSettings(); loadOrders();
}
$("#lBtn").onclick = async () => {
  $("#lErr").textContent = "";
  try { await Store.signIn($("#lEmail").value, $("#lPass").value); boot(); } catch (e) { $("#lErr").textContent = e.message; }
};
$("#lPass").addEventListener("keydown", (e) => e.key === "Enter" && $("#lBtn").click());
$("#logout").onclick = async () => { await Store.signOut(); location.reload(); };

// ================= tabs =================
function showTab(name) {
  $$("#tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== name));
  if (name === "history") loadHistory();
  if (name === "builder") requestAnimationFrame(fitPreview);
}
$$("#tabs [data-tab]").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

// ================= orders =================
async function loadOrders() {
  try { orders = await Store.listOrders(); } catch (e) { toast(e.message); orders = []; }
  drawOrders();
}
$("#refresh").onclick = loadOrders;
function drawOrders() {
  const counts = { all: orders.length }; orders.forEach((o) => (counts[o.status] = (counts[o.status] || 0) + 1));
  $("#filters").innerHTML = [["all", "All"], ...Object.entries(STATUS)].map(([k, l]) => `<button class="btn small ${orderFilter === k ? "primary" : ""}" data-f="${k}">${l} (${counts[k] || 0})</button>`).join("");
  const list = orders.filter((o) => orderFilter === "all" || o.status === orderFilter);
  $("#olist").innerHTML = list.length ? list.map((o) => {
    const d = o.details || {}, c = o.customer || {};
    const types = d.items?.length ? d.items.map(itemLabel) : (d.shirtTypes || []);
    const what = `${d.designType || ""}${types.length ? " · " + types.join(", ") : ""}`;
    const qty = d.printing ? ` · ${d.printing.qty} pcs` : "";
    return `<div class="card orow" data-id="${o.id}">
      <div><div class="t">${esc(c.name)} ${c.org ? `<span class="muted">· ${esc(c.org)}</span>` : ""}</div>
      <div class="s">${esc(o.order_no)} · ${d.service === "design_print" ? "Design + Printing" : "Design only"} · ${esc(what)}${qty}</div></div>
      <div style="text-align:right"><span class="pill ${o.status}">${STATUS[o.status] || o.status}</span><div class="s" style="margin-top:4px">${new Date(o.created_at).toLocaleDateString("en-GB")}</div></div></div>`;
  }).join("") : `<div class="card empty">No orders yet. Share your order page link with customers and their orders will show up here.</div>`;
}
$("#filters").onclick = (e) => { if (e.target.dataset.f) { orderFilter = e.target.dataset.f; drawOrders(); } };
$("#olist").onclick = (e) => { const r = e.target.closest(".orow"); if (r) openOrder(r.dataset.id); };

async function openOrder(id) {
  const o = orders.find((x) => x.id === id); if (!o) return;
  const d = o.details || {}, c = o.customer || {}, p = d.printing;
  const waNo = (c.phone || "").replace(/\D/g, "").replace(/^0/, "60");
  const kv = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : "");
  const box = $("#orderDetail");
  box.innerHTML = `<button class="btn small ghost" id="back">← All orders</button>
  <div class="card detail" style="margin-top:10px">
    <div class="row" style="justify-content:space-between">
      <div><h2 style="font-size:20px">${esc(c.name)}</h2><div class="muted">${esc(o.order_no)} · ${new Date(o.created_at).toLocaleString("en-GB")}</div></div>
      <div class="row">
        <select id="status" style="width:auto">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        <a class="btn" href="https://wa.me/${waNo}" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn primary" id="mkInv">Create invoice</button>
      </div>
    </div>
    <dl class="kv">
      ${kv("Phone", esc(c.phone))}${kv("Email", esc(c.email))}${kv("Team / company", esc(c.org))}
      ${kv("Service", d.service === "design_print" ? "Design + Printing" : "Design only")}
      ${kv("Design", esc(d.designType))}
      ${kv("Shirt type", esc((d.shirtTypes || []).join(", ")))}
      ${d.items?.length && !p ? kv(d.designType === "Shirt" ? "Shirt type" : "Jersey type", esc(d.items.map(itemLabel).join(", "))) : ""}
      ${d.items?.length ? kv("Names on jersey", { none: "No names", name: "Name", name_number: "Name + number" }[d.nameOption] || "") : ""}
      ${d.colors?.length || d.colorNotes ? `<dt>Colour theme</dt><dd><div class="swatches">${(d.colors || []).map((x) => `<i style="background:${esc(x)}" title="${esc(x)}"></i>`).join("")}</div>${esc(d.colorNotes)}</dd>` : ""}
      ${d.logo ? kv("Logo text", esc([d.logo.name, d.logo.slogan].filter(Boolean).join(" / "))) : ""}
      ${d.poster ? kv("Poster", esc(d.poster.size + (d.poster.text ? " · " + d.poster.text : ""))) : ""}
      ${kv("Brief", esc(d.brief))}
      ${kv("Names / numbers", esc(d.names))}
      ${p && p.sizes ? kv("Sizes", esc(Object.entries(p.sizes).map(([s, q]) => `${s}: ${q}`).join("   ")) + ` <b>(${p.qty} pcs)</b>`) : ""}
      ${p ? kv("Material", esc(p.material)) : ""}${p ? kv("Needed by", esc(dmy(p.needBy))) : ""}
      ${p ? kv("Collection", p.delivery === "postage" ? "Postage: " + esc(c.address) : "Self pickup") : ""}
    </dl>
    ${p && d.items?.length ? `<div><h3 style="font-size:15px;margin-bottom:10px">Printing · ${p.qty} pcs</h3><div class="jitems">${d.items.map(jItemHTML).join("")}</div></div>` : ""}
    <div><h3 style="font-size:15px;margin-bottom:10px">Attachments (${(o.files || []).length})</h3><div class="gallery" id="gal">${(o.files || []).length ? "" : `<span class="muted">No files attached.</span>`}</div></div>
    <div class="row"><button class="btn small danger" id="delOrder">Delete order</button><span class="muted" id="delConfirm"></span></div>
  </div>`;
  $("#ordersList").hidden = true; box.hidden = false; window.scrollTo(0, 0);
  $("#back").onclick = () => { box.hidden = true; $("#ordersList").hidden = false; drawOrders(); };
  $("#status").onchange = async (e) => { try { await Store.setOrderStatus(o.id, e.target.value); o.status = e.target.value; toast("Status updated"); } catch (er) { toast(er.message); } };
  $("#mkInv").onclick = () => invoiceFromOrder(o);
  let armed = false;
  $("#delOrder").onclick = async () => {
    if (!armed) { armed = true; $("#delOrder").textContent = "Click again to delete"; $("#delConfirm").textContent = "This also removes the attached files."; return; }
    try { await Store.deleteOrder(o); orders = orders.filter((x) => x.id !== o.id); $("#back").click(); toast("Order deleted"); } catch (er) { toast(er.message); }
  };
  const tags = d.fileTags || [];
  for (const [i, f] of (o.files || []).entries()) {
    const url = await Store.fileUrl(f);
    const isImg = (f.type || "").startsWith("image/");
    const a = document.createElement(url ? "a" : "div");
    if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; a.download = f.name; }
    a.innerHTML = `<div class="ph" style="${isImg && url ? `background-image:url('${url}')` : ""}">${isImg && url ? "" : esc((f.name.split(".").pop() || "").toUpperCase())}</div><span title="${esc(f.name)}">${esc(f.name)}</span><span class="muted">${esc(tags[i] || "")}${url ? "" : " · preview not kept in demo"}</span>`;
    $("#gal").appendChild(a);
  }
}

const itemLabel = (it) => it.name + (it.collar ? ` (${it.collar})` : "");
function jItemHTML(it) {
  const sizes = Object.entries(it.sizes || {}).map(([s, q]) => `<span class="chipv">${esc(s)} <b>${q}</b></span>`).join("");
  const people = it.people?.length ? `<div class="tablewrap"><table class="list ppl"><thead><tr><th>#</th><th>Name</th>${it.people.some((x) => x.number) ? "<th>No.</th>" : ""}<th>Size</th></tr></thead><tbody>${it.people.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td>${it.people.some((y) => y.number) ? `<td>${esc(x.number)}</td>` : ""}<td>${esc(x.size)}</td></tr>`).join("")}</tbody></table></div>` : "";
  return `<div class="jitem"><div class="row" style="justify-content:space-between"><b>${esc(itemLabel(it))}</b><span class="muted">${it.qty} pcs × ${rm(num(it.price))}</span></div><div class="row">${sizes}</div>${people}</div>`;
}

// ================= invoice / receipt builder =================
function nextNumber(dateIso) {
  const [y, m, d] = (dateIso || today()).split("-");
  return `${y.slice(2)}${d}${m}${String(S.nextSeq).padStart(2, "0")}`;
}
function blankDoc(type = "invoice") {
  return { type, number: nextNumber(today()), date: today(), name: "", addr1: "", addr2: "", items: [{ desc: "", price: "", qty: "" }], depositPct: S.depositPct, totalPaid: 0, ref: "", prevPaid: 0, received: 0, method: "Online transfer", payRef: "", orderId: null };
}
function invoiceFromOrder(o) {
  const d = o.details || {}, c = o.customer || {};
  doc = blankDoc("invoice");
  doc.name = c.name; doc.addr1 = c.org || ""; doc.addr2 = d.printing?.delivery === "postage" ? c.address.replace(/\n/g, ", ") : ""; doc.orderId = o.id;
  const priceOf = (n) => (S.priceList.find((p) => p.name.toLowerCase() === n.toLowerCase()) || {}).price ?? "";
  if (d.printing && d.items?.length) {
    doc.items = d.items.map((it) => ({ desc: itemLabel(it), price: it.price ?? priceOf(it.name), qty: it.qty }));
  } else if (d.printing) {
    // Older orders: map the customer's shirt-type choice to your price-list names.
    const MAP = { "Roundneck": "Roundneck Shortsleeve", "Longsleeve": "Roundneck Longsleeve", "Polo collar": "Polo Shortsleeve", "Retro collar": "Retro Collar", "V-neck collar": "V-neck Collar", "Muslimah": "Muslimah" };
    const types = d.shirtTypes?.length ? d.shirtTypes.map((t) => MAP[t] || t) : [d.designType];
    // One type: whole quantity on that line. Several types: fill quantities after confirming the split with the customer.
    doc.items = types.map((t) => ({ desc: t, price: priceOf(t), qty: types.length === 1 ? d.printing.qty : "" }));
  } else {
    const label = d.designType === "Logo" ? "Logo Design" : d.designType === "Poster" ? "Poster Design" : `${d.designType} Design (design only)`;
    if (d.items?.length) { doc.items = [{ desc: `${label} · ${d.items.map(itemLabel).join(", ")}`, price: priceOf(label), qty: 1 }]; fillBuilder(); showTab("builder"); toast("Invoice started from " + o.order_no); return; }
    doc.items = [{ desc: label, price: priceOf(label), qty: 1 }];
  }
  fillBuilder(); showTab("builder"); toast("Invoice started from " + o.order_no);
}
const totals = () => {
  const sub = doc.items.reduce((a, i) => a + num(i.price) * num(i.qty), 0);
  const deposit = sub * num(doc.depositPct) / 100;
  const paid = doc.type === "receipt" ? num(doc.prevPaid) + num(doc.received) : num(doc.totalPaid);
  return { sub, deposit, paid, bal: Math.max(0, sub - paid) };
};

function fillBuilder() {
  $$("#docType button").forEach((b) => b.classList.toggle("on", b.dataset.t === doc.type));
  $("#dName").value = doc.name; $("#dAddr1").value = doc.addr1; $("#dAddr2").value = doc.addr2;
  $("#dNo").value = doc.number; $("#dDate").value = doc.date; $("#dRef").value = doc.ref;
  $("#dDep").value = doc.depositPct; $("#dPaid").value = doc.totalPaid || "";
  $("#dPrev").value = doc.prevPaid || ""; $("#dRecv").value = doc.received || ""; $("#dMethod").value = doc.method; $("#dPref").value = doc.payRef;
  const isR = doc.type === "receipt";
  $("#numLabel").textContent = isR ? "Receipt #" : "Invoice #";
  $("#refBox").hidden = !isR; $("#invPay").hidden = isR; $("#rcpPay").hidden = !isR; $("#toReceipt").hidden = isR;
  drawItems(); drawPresets(); render();
}
function drawItems() {
  $("#items").innerHTML = doc.items.map((it, i) => `<div class="item">
    <input data-k="desc" data-i="${i}" value="${esc(it.desc)}" placeholder="e.g. Roundneck Shortsleeve" aria-label="Description">
    <input data-k="price" data-i="${i}" value="${esc(it.price)}" type="number" step="0.01" min="0" aria-label="Price">
    <input data-k="qty" data-i="${i}" value="${esc(it.qty)}" type="number" min="0" aria-label="Quantity">
    <button data-rm="${i}" aria-label="Remove line">×</button></div>`).join("");
}
function drawPresets() { $("#presets").innerHTML = S.priceList.map((p, i) => `<button class="btn small" data-p="${i}">${esc(p.name)} · ${rm(num(p.price))}</button>`).join(""); }

$("#items").addEventListener("input", (e) => { const { k, i } = e.target.dataset; if (k) { doc.items[i][k] = e.target.value; render(); } });
$("#items").addEventListener("click", (e) => { if (e.target.dataset.rm) { doc.items.splice(+e.target.dataset.rm, 1); if (!doc.items.length) doc.items.push({ desc: "", price: "", qty: "" }); drawItems(); render(); } });
$("#addItem").onclick = () => { doc.items.push({ desc: "", price: "", qty: "" }); drawItems(); render(); };
$("#presets").onclick = (e) => {
  const p = S.priceList[e.target.dataset.p]; if (!p) return;
  const empty = doc.items.find((i) => !i.desc && !i.price);
  const line = { desc: p.name, price: p.price, qty: 1 };
  empty ? Object.assign(empty, line) : doc.items.push(line);
  drawItems(); render();
};
const bind = (id, key, isNum) => $(id).addEventListener("input", (e) => { doc[key] = isNum ? e.target.value : e.target.value; if (key === "date" && !doc._numEdited && !doc.id) { doc.number = nextNumber(doc.date); $("#dNo").value = doc.number; } render(); });
bind("#dName", "name"); bind("#dAddr1", "addr1"); bind("#dAddr2", "addr2"); bind("#dDate", "date"); bind("#dRef", "ref");
bind("#dDep", "depositPct", 1); bind("#dPaid", "totalPaid", 1); bind("#dPrev", "prevPaid", 1); bind("#dRecv", "received", 1); bind("#dMethod", "method"); bind("#dPref", "payRef");
$("#dNo").addEventListener("input", (e) => { doc.number = e.target.value; doc._numEdited = true; render(); });
$("#dMethod").addEventListener("change", (e) => { doc.method = e.target.value; render(); });

$("#docType").onclick = (e) => { const t = e.target.dataset.t; if (t && t !== doc.type) { doc.type = t; fillBuilder(); } };
$("#newDoc").onclick = () => { doc = blankDoc(doc.type); fillBuilder(); };
$("#toReceipt").onclick = () => {
  const t = totals();
  doc = Object.assign(JSON.parse(JSON.stringify(doc)), { id: undefined, createdAt: undefined, _numEdited: false, type: "receipt", ref: doc.number, prevPaid: t.paid, received: Math.max(0, t.sub - t.paid), date: today() });
  doc.number = nextNumber(doc.date);
  fillBuilder(); toast("Receipt ready. Adjust the amount received if this is a partial payment.");
};

function sheetHTML() {
  const t = totals(), isR = doc.type === "receipt";
  const rows = [...doc.items]; while (rows.length < 4) rows.push({});
  const rowsHtml = rows.slice(0, 7).map((it, i) => {
    const has = it.desc || it.price || it.qty;
    return `<div class="sh-tr body ${i % 2 === 0 ? "alt" : ""}"><span class="num">${i + 1}</span><span>${esc(it.desc || "")}</span>
      <span class="b">${has && it.price !== "" ? rm(num(it.price)) : ""}</span><span class="b c">${has ? esc(it.qty) : ""}</span><span class="b">${has ? rm(num(it.price) * num(it.qty)) : ""}</span></div>`;
  }).join("");
  const totalsHtml = isR
    ? `<div class="l"><span>Sub Total:</span><span>${rm(t.sub)}</span></div>
       <div class="l"><span>Paid Before:</span><span>${rm(num(doc.prevPaid))}</span></div>
       <div class="l"><span>Received:</span><span>${rm(num(doc.received))}</span></div>
       <div class="l grand"><span>Balance:</span><span>${rm(t.bal)}</span></div>`
    : `<div class="l"><span>Sub Total:</span><span>${rm(t.sub)}</span></div>
       <div class="l"><span>Deposit (${esc(doc.depositPct)}%)</span><span>${rm(t.deposit)}</span></div>
       <div class="l grand"><span>Total Paid:</span><span>${rm(t.paid)}</span></div>
       ${t.paid > 0 ? `<div class="l" style="margin-top:4px"><span>Balance Due:</span><span>${rm(t.bal)}</span></div>` : ""}`;
  const leftHtml = isR
    ? `<div><b>PAYMENT METHOD:</b> ${esc(doc.method)}</div>${doc.payRef ? `<div><b>REFERENCE:</b> ${esc(doc.payRef)}</div>` : ""}${doc.ref ? `<div><b>FOR INVOICE:</b> #${esc(doc.ref)}</div>` : ""}`
    : `<div><b>VALIDITY:</b> ${esc(S.validity)}</div><div><b>Payment Terms:</b> ${esc(S.terms)}</div>`;
  return `<div class="sheet">
    <div class="sh-head">
      <div class="sh-brand"><img src="assets/logo.png" alt=""><div><div class="nm">${esc(S.businessName.toUpperCase())}</div><div class="tg">${esc(S.tagline.toUpperCase())}</div>${S.regNo ? `<div class="rg">(${esc(S.regNo)})</div>` : ""}</div></div>
      <div class="sh-title">${isR ? "RECEIPT" : "INVOICE"}</div>
    </div>
    <div class="sh-rule"></div>
    <div class="sh-meta">
      <div class="sh-cust">
        <div class="ln">Name: <span class="val">${esc(doc.name)}</span></div>
        <div class="ln">Address: <span class="val">${esc(doc.addr1)}</span></div>
        <div class="blank">${esc(doc.addr2)}</div>
      </div>
      <div class="sh-ids"><span>${isR ? "Receipt#" : "Invoice#"}</span><span>${esc(doc.number)}</span><span>Date:</span><span>${dmy(doc.date)}</span></div>
    </div>
    <div class="sh-table">
      <div class="sh-tr sh-th"><span>SL.</span><span>Item Description</span><span>Price</span><span class="c">Qty.</span><span>Total</span></div>
      ${rowsHtml}
    </div>
    ${isR && t.bal === 0 && t.sub > 0 ? `<div class="sh-stamp">PAID</div>` : ""}
    <div class="sh-bottom">
      <div class="sh-rule"></div>
      <div class="sh-split">
        <div class="sh-left">${leftHtml}<div class="sh-thanks">${esc(S.thanks)}</div>
          ${isR ? "" : `<div class="sh-pay"><h4>Payment Info:</h4><div><span>Account #:</span><b>${esc(S.bankAccount)}</b><span>A/C Name:</span><b>${esc(S.bankHolder)}</b><span>Bank Details:</span><b>${esc(S.bankName)}</b></div></div>`}
        </div>
        <div class="sh-tot">${totalsHtml}</div>
      </div>
      <div class="sh-foot">
        <div class="sh-addr"><h5>${esc(S.businessName)}</h5>${esc(S.address)}<br><br>Contact: ${esc(S.phone)}<br>Email: ${esc(S.email)}<br>Instagram: ${esc(S.instagram)}</div>
        <div class="sh-sign">Authorised Sign</div>
      </div>
    </div>
    <div class="sh-note">Note: This is a computer generated ${isR ? "receipt" : "invoice"} and signature is not necessary.</div>
  </div>`;
}
function render() {
  const t = totals();
  $("#sSub").textContent = rm(t.sub); $("#sBal").textContent = rm(t.bal);
  $("#pv").innerHTML = sheetHTML(); fitPreview();
}
function fitPreview() {
  const box = $("#pv"), sh = $(".sheet", box); if (!sh || !box.clientWidth) return;
  const k = box.clientWidth / 794; sh.style.transform = `scale(${k})`; box.style.height = 1123 * k + "px";
}
addEventListener("resize", fitPreview);

$("#printBtn").onclick = () => {
  $("#printArea").innerHTML = sheetHTML();
  const prev = document.title; document.title = `${doc.type === "receipt" ? "Receipt" : "Invoice"} ${doc.number} - ${doc.name || "customer"}`;
  const img = $("#printArea img");
  const go = () => { window.print(); document.title = prev; };
  img.complete ? go() : (img.onload = go);
};
$("#saveBtn").onclick = async () => {
  const isNew = !doc.id;
  try {
    doc.total = totals().sub;
    doc.id = await Store.saveDoc(doc);
    if (isNew && doc.number === nextNumber(doc.date)) { S.nextSeq = num(S.nextSeq) + 1; await Store.saveSettings(S); renderSettings(); }
    if (isNew && doc.orderId && doc.type === "invoice") { await Store.setOrderStatus(doc.orderId, "quoted").catch(() => {}); const o = orders.find((x) => x.id === doc.orderId); if (o && o.status === "new") o.status = "quoted"; }
    toast(`${doc.type === "receipt" ? "Receipt" : "Invoice"} ${doc.number} saved`);
  } catch (e) { toast(e.message); }
};

// ================= history =================
let docs = [];
async function loadHistory() {
  try { docs = await Store.listDocs(); } catch (e) { toast(e.message); docs = []; }
  $("#hist").innerHTML = docs.length ? docs.map((r) => `<tr>
    <td><b>${esc(r.doc_no)}</b></td><td><span class="pill ${r.doc_type === "receipt" ? "done" : "quoted"}">${r.doc_type}</span></td>
    <td>${esc(r.data.name)}</td><td>${dmy(r.data.date)}</td><td class="r">${rm(num(r.data.total))}</td>
    <td class="r" style="white-space:nowrap"><button class="btn small" data-open="${r.id}">Open</button> <button class="btn small ghost danger" data-del="${r.id}">Delete</button></td></tr>`).join("")
    : `<tr><td colspan="6" class="empty">Nothing saved yet. Invoices and receipts you save will be listed here.</td></tr>`;
}
$("#hist").onclick = async (e) => {
  const o = e.target.dataset.open, d = e.target.dataset.del;
  if (o) { const r = docs.find((x) => x.id === o); doc = Object.assign(blankDoc(), r.data, { id: r.id, _numEdited: true }); fillBuilder(); showTab("builder"); }
  if (d) {
    if (e.target.dataset.armed) { await Store.deleteDoc(d); loadHistory(); toast("Deleted"); }
    else { e.target.dataset.armed = 1; e.target.textContent = "Confirm delete"; }
  }
};

// ================= settings =================
function renderSettings() {
  $$("[data-s]").forEach((el) => (el.value = S[el.dataset.s] ?? ""));
  $("#plist").innerHTML = S.priceList.map((p, i) => `<div class="p"><input data-pl="name" data-i="${i}" value="${esc(p.name)}" aria-label="Item name"><input data-pl="price" data-i="${i}" value="${esc(p.price)}" type="number" step="0.01" aria-label="Price"><button data-prm="${i}" aria-label="Remove">×</button></div>`).join("");
}
$("#plist").addEventListener("input", (e) => { const { pl, i } = e.target.dataset; if (pl) S.priceList[i][pl] = pl === "price" ? num(e.target.value) : e.target.value; });
$("#plist").addEventListener("click", (e) => { if (e.target.dataset.prm) { S.priceList.splice(+e.target.dataset.prm, 1); renderSettings(); } });
$("#addPrice").onclick = () => { S.priceList.push({ name: "", price: 0 }); renderSettings(); };
$("#saveSettings").onclick = async () => {
  $$("[data-s]").forEach((el) => (S[el.dataset.s] = el.type === "number" ? num(el.value) : el.value));
  S.priceList = S.priceList.filter((p) => p.name.trim());
  try { await Store.saveSettings(S); renderSettings(); drawPresets(); render(); toast("Settings saved"); } catch (e) { toast(e.message); }
};

boot();

// One-time update of the saved price list to the current jersey catalogue.
function migratePrices() {
  if ((S.priceVersion || 1) >= 2) return;
  const old = ["roundneck shortsleeve", "roundneck longsleeve", "polo shortsleeve", "polo longsleeve", "retro collar", "v-neck collar", "muslimah", "collar shortsleeve", "collar longsleeve"];
  S.priceList = [...HAISE_CATALOG.jerseyTypes.map((t) => ({ name: t.name, price: t.price })), ...S.priceList.filter((p) => !old.includes(p.name.toLowerCase()))];
  S.priceVersion = 2;
  Store.saveSettings(S).catch(() => {});
}
