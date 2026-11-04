// Data layer. Same API whether running on Supabase (live) or localStorage (demo).
(function () {
  const C = window.HAISE_CONFIG || {};
  const LIVE = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  const sb = LIVE ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  const BUCKET = "order-files";

  const DEFAULT_SETTINGS = {
    businessName: "Haise Design",
    tagline: "Premium Quality Design",
    regNo: "003091253-D",
    address: "No. 2 Jalan 2/4A - 1,\nSeksyen 2, 43650 Bandar Baru Bangi,\nSelangor Darul Ehsan.",
    phone: "011-3210 1830",
    email: "designhaise@gmail.com",
    instagram: "@haisedesign",
    bankAccount: "1622 6359 9213",
    bankHolder: "MUHAMMAD AIMAN BIN ZAINAL ABIDIN",
    bankName: "MAYBANK",
    validity: "30 DAYS from date of Quotation.",
    terms: "30 Days.",
    thanks: "Thank you for your business",
    depositPct: 50,
    nextSeq: 20,
    priceList: [
      { name: "Roundneck Shortsleeve", price: 34 },
      { name: "Roundneck Longsleeve", price: 36 },
      { name: "Polo Shortsleeve", price: 36 },
      { name: "Polo Longsleeve", price: 38 },
      { name: "Retro Collar", price: 38 },
      { name: "V-neck Collar", price: 35 },
      { name: "Muslimah", price: 40 },
      { name: "Jersey Design (design only)", price: 80 },
      { name: "Logo Design", price: 150 },
      { name: "Poster Design", price: 60 },
    ],
  };

  // ---------- local (demo) helpers ----------
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const readAsDataURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const safeName = (n) => n.replace(/[^\w.\-]+/g, "_").slice(-80);

  function orderNo() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `HD-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${rand}`;
  }

  const Store = {
    live: LIVE,

    // ----- customer side -----
    async submitOrder(order, files, onProgress) {
      const id = uid();
      const no = orderNo();
      const saved = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        onProgress && onProgress(i, files.length, f.name);
        if (LIVE) {
          const path = `${id}/${i + 1}-${safeName(f.name)}`;
          const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || "application/octet-stream" });
          if (error) throw new Error(`Could not upload ${f.name}: ${error.message}`);
          saved.push({ name: f.name, type: f.type, size: f.size, path });
        } else {
          // Demo: keep small files in the browser so you can preview them in admin.
          const small = f.size < 1.2 * 1024 * 1024;
          saved.push({ name: f.name, type: f.type, size: f.size, dataUrl: small ? await readAsDataURL(f) : null });
        }
      }
      const row = { id, order_no: no, status: "new", customer: order.customer, details: order.details, files: saved, created_at: new Date().toISOString() };
      if (LIVE) {
        const { error } = await sb.from("orders").insert(row);
        if (error) throw new Error(error.message);
      } else {
        const all = ls.get("hd_orders", []);
        all.unshift(row);
        if (!ls.set("hd_orders", all)) {
          row.files.forEach((x) => (x.dataUrl = null));
          ls.set("hd_orders", all);
        }
      }
      return no;
    },

    // ----- admin auth -----
    async session() {
      if (!LIVE) return { demo: true };
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signOut() { if (LIVE) await sb.auth.signOut(); },

    // ----- orders -----
    async listOrders() {
      if (!LIVE) return ls.get("hd_orders", []);
      const { data, error } = await sb.from("orders").select("*").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
    async setOrderStatus(id, status) {
      if (!LIVE) { const all = ls.get("hd_orders", []); const o = all.find((x) => x.id === id); if (o) o.status = status; ls.set("hd_orders", all); return; }
      const { error } = await sb.from("orders").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    async deleteOrder(o) {
      if (!LIVE) { ls.set("hd_orders", ls.get("hd_orders", []).filter((x) => x.id !== o.id)); return; }
      const paths = (o.files || []).map((f) => f.path).filter(Boolean);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      const { error } = await sb.from("orders").delete().eq("id", o.id);
      if (error) throw new Error(error.message);
    },
    async fileUrl(f) {
      if (!LIVE) return f.dataUrl || null;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.path, 3600);
      return error ? null : data.signedUrl;
    },

    // ----- invoices & receipts -----
    async listDocs() {
      if (!LIVE) return ls.get("hd_docs", []);
      const { data, error } = await sb.from("documents").select("*").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
    async saveDoc(doc) {
      const row = { id: doc.id || uid(), doc_no: doc.number, doc_type: doc.type, order_id: doc.orderId || null, data: doc, created_at: doc.createdAt || new Date().toISOString() };
      row.data.id = row.id; row.data.createdAt = row.created_at;
      if (!LIVE) { const all = ls.get("hd_docs", []).filter((x) => x.id !== row.id); all.unshift(row); ls.set("hd_docs", all); return row.id; }
      const { error } = await sb.from("documents").upsert(row);
      if (error) throw new Error(error.message);
      return row.id;
    },
    async deleteDoc(id) {
      if (!LIVE) { ls.set("hd_docs", ls.get("hd_docs", []).filter((x) => x.id !== id)); return; }
      const { error } = await sb.from("documents").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },

    // ----- settings -----
    async getSettings() {
      let s = null;
      if (!LIVE) s = ls.get("hd_settings", null);
      else { const { data } = await sb.from("settings").select("data").eq("id", 1).maybeSingle(); s = data && data.data; }
      return Object.assign({}, DEFAULT_SETTINGS, s || {});
    },
    async saveSettings(s) {
      if (!LIVE) { ls.set("hd_settings", s); return; }
      const { error } = await sb.from("settings").upsert({ id: 1, data: s });
      if (error) throw new Error(error.message);
    },
  };

  window.Store = Store;
})();
