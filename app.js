// =======================
// Fecha/hora Argentina
// =======================
function getArgentinaDateInfo() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Cordoba",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const formatted = formatter.format(now); // "jueves, 13/11/2025, 18:42:31"

  const keyRaw = formatted
    .toLowerCase()
    .replace(/,\s*/g, " ")
    .replace(/\s+/g, " ");

  const noAccents = keyRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const sanitized = noAccents
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return {
    firebaseKey: sanitized,
    display: formatted,
    iso: now.toISOString()
  };
}

// =======================
// Helper fecha de compra
// =======================
function formatFechaCompra(fechaCompra) {
  if (!fechaCompra) return "";
  const v = String(fechaCompra).trim();
  // Si viene como YYYY-MM-DD la paso a DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [yyyy, mm, dd] = v.split("-");
    return `${dd}/${mm}/${yyyy}`;
  }
  return v; // cualquier otro formato lo dejo como viene
}

// =======================
// SweetAlert helpers
// =======================
function showSwalError(title, text) {
  if (window.Swal) {
    Swal.fire({
      icon: "error",
      title,
      text,
      confirmButtonColor: "#0a84ff"
    });
  } else {
    console.error(title, text);
  }
}

// =======================
// Productos (autocomplete)
// =======================

let productosCache = null;
let productosCargando = false;

async function loadProductosIfNeeded() {
  if (productosCache) return productosCache;
  if (productosCargando) return productosCache;

  productosCargando = true;

  try {
    const res = await fetch(PRECIOS_BASE_URL);
    if (!res.ok) throw new Error("No se pudo cargar el listado de productos");

    const data = await res.json();
    if (!data || typeof data !== "object") {
      throw new Error("Estructura inválida en precios.json");
    }

    productosCache = Object.entries(data).map(([key, value]) => {
      const sku = value?.sku || key;
      return {
        sku: String(sku),
        ml: value?.ML ?? value?.ml ?? null,
        contadoWeb: value?.contadoWeb ?? null,
        oferta: value?.oferta ?? null,
        precioSugerido: value?.precioSugerido ?? null,
        stock: value?.stock ?? null
      };
    });

    return productosCache;
  } catch (err) {
    console.error("Error al cargar productos:", err);
    productosCache = [];
    return productosCache;
  } finally {
    productosCargando = false;
  }
}

function filtrarProductosPorSku(term) {
  if (!productosCache) return [];
  const t = String(term).trim();
  return productosCache.filter((p) =>
    p.sku && p.sku.toString().startsWith(t)
  );
}

// =======================
// Multi-SKU helpers
// =======================

function getSkuItems() {
  return Array.from(document.querySelectorAll("#sku-list .sku-item"));
}

function attachSkuAutocompleteHandlers(skuItem) {
  const input = skuItem.querySelector(".sku-input");
  const suggestionsEl = skuItem.querySelector(".sku-suggestions");

  if (!input || !suggestionsEl) return;

  input.addEventListener("input", async (e) => {
    const term = e.target.value.trim().toUpperCase();

    if (term.length < 3) {
      suggestionsEl.classList.add("hidden");
      suggestionsEl.innerHTML = "";
      return;
    }

    await loadProductosIfNeeded();
    const matches = filtrarProductosPorSku(term).slice(0, 8);

    if (!matches.length) {
      suggestionsEl.classList.add("hidden");
      suggestionsEl.innerHTML = "";
      return;
    }

    suggestionsEl.innerHTML = matches
      .map((p) => {
        const precio =
          p.contadoWeb || p.oferta || p.precioSugerido || p.ml || "";
        const precioLabel = precio ? ` $${precio}` : "";
        const stockLabel = p.stock ? ` · Stock: ${p.stock}` : "";
        return `
          <li data-sku="${p.sku}">
            <span class="sku">${p.sku}</span>
            <span class="meta">${precioLabel}${stockLabel}</span>
          </li>
        `;
      })
      .join("");

    suggestionsEl.classList.remove("hidden");
  });

  suggestionsEl.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const sku = li.getAttribute("data-sku");
    if (input) {
      input.value = (sku || "").toUpperCase();
      input.focus();
    }
    suggestionsEl.classList.add("hidden");
    suggestionsEl.innerHTML = "";
  });
}

function handleGlobalClickForSkuSuggestions(e) {
  document.querySelectorAll(".sku-suggestions").forEach((ul) => {
    const item = ul.closest(".sku-item");
    if (!item) return;
    if (!item.contains(e.target)) {
      ul.classList.add("hidden");
    }
  });
}

function updateSkuLabelsAndIndices() {
  const items = getSkuItems();

  items.forEach((item, idx) => {
    const index = idx + 1;
    item.dataset.index = String(index);

    const pill = item.querySelector(".sku-pill");
    if (pill) pill.textContent = `SKU ${index}`;

    const fallaLabel = item.querySelector(".falla-label-sku");
    if (fallaLabel) fallaLabel.textContent = `Falla SKU ${index}`;

    const skuInput = item.querySelector(".sku-input");
    if (skuInput) {
      skuInput.id = `producto-${index}`;
      skuInput.name = `producto-${index}`;
    }

    const fallaInput = item.querySelector(".falla-input");
    if (fallaInput) {
      fallaInput.id = `falla-${index}`;
      fallaInput.name = `falla-${index}`;
    }
  });

  // Habilitar/deshabilitar botón borrar
  items.forEach((item) => {
    const removeBtn = item.querySelector(".sku-remove-btn");
    if (removeBtn) {
      removeBtn.disabled = items.length === 1;
    }
  });
}

function removeSkuItem(item) {
  if (!item) return;
  item.remove();
  updateSkuLabelsAndIndices();
}

// Confirm de borrado con SweetAlert2 (sin alert/confirm nativos)
async function confirmAndRemoveSkuItem(item) {
  const items = getSkuItems();
  if (items.length === 1) {
    // No se permite borrar el último SKU
    return;
  }

  const idx = Number(item.dataset.index || 0) || 0;
  const skuInput = item.querySelector(".sku-input");
  const skuValue = (skuInput?.value || "").trim().toUpperCase();

  const title =
    skuValue && idx
      ? `Quitar SKU ${idx} (${skuValue})`
      : `Quitar SKU`;

  const text =
    "Se eliminará este SKU y su descripción de falla del ticket. Esta acción no se puede deshacer dentro del formulario.";

  if (window.Swal) {
    const result = await Swal.fire({
      title,
      text,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#0a84ff",
      cancelButtonColor: "#6b7280",
      reverseButtons: true
    });

    if (result.isConfirmed) {
      removeSkuItem(item);
    }
  } else {
    // Si por algún motivo no está SweetAlert, borramos sin confirmar
    console.warn("SweetAlert no disponible, se borra el SKU sin confirmación");
    removeSkuItem(item);
  }
}

function createSkuItem(index) {
  const div = document.createElement("div");
  div.className = "sku-item";
  div.dataset.index = String(index);

  div.innerHTML = `
    <div class="sku-item-header">
      <span class="sku-pill">SKU ${index}</span>
      <button
        type="button"
        class="btn-icon btn-icon-xs sku-remove-btn"
        title="Quitar SKU"
      >
        <i class="bi bi-x-lg"></i>
      </button>
    </div>

    <div class="product-input-wrapper">
      <input
        type="text"
        id="producto-${index}"
        name="producto-${index}"
        class="form-control uppercase-input sku-input"
        placeholder="Ej: 061"
        maxlength="10"
        autocomplete="off"
        required
      />
      <ul class="suggestions hidden list-unstyled sku-suggestions"></ul>
    </div>

    <div class="falla-row-sku">
      <label for="falla-${index}" class="falla-label-sku">
        Falla SKU ${index}
      </label>
      <textarea
        id="falla-${index}"
        name="falla-${index}"
        class="form-control falla-input"
        rows="4"
        placeholder="Describí la falla de este SKU…"
        required
      ></textarea>
    </div>
  `;

  const removeBtn = div.querySelector(".sku-remove-btn");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      confirmAndRemoveSkuItem(div);
    });
  }

  attachSkuAutocompleteHandlers(div);

  return div;
}

function addNewSkuItem() {
  const skuListEl = document.getElementById("sku-list");
  if (!skuListEl) return;

  const newIndex = getSkuItems().length + 1;
  const item = createSkuItem(newIndex);
  skuListEl.appendChild(item);
  updateSkuLabelsAndIndices();
}

function initSkuSection() {
  const skuListEl = document.getElementById("sku-list");
  const addSkuBtn = document.getElementById("add-sku-btn");
  if (!skuListEl) return;

  if (!getSkuItems().length) {
    const firstItem = createSkuItem(1);
    skuListEl.appendChild(firstItem);
  }

  updateSkuLabelsAndIndices();

  if (addSkuBtn) {
    addSkuBtn.addEventListener("click", () => {
      addNewSkuItem();
    });
  }

  document.addEventListener("click", handleGlobalClickForSkuSuggestions);
}

// Arma producto/falla compuestos a partir de los SKUs del formulario
function collectSkuAndFallasFromForm() {
  const items = getSkuItems();
  const skuList = [];
  const fallaPartes = [];

  items.forEach((item, idx) => {
    const index = idx + 1;
    const skuInput = item.querySelector(".sku-input");
    const fallaInput = item.querySelector(".falla-input");
    const sku = (skuInput?.value || "").trim().toUpperCase();
    const falla = (fallaInput?.value || "").trim();

    if (!sku || !falla) {
      return;
    }

    skuList.push(sku);
    fallaPartes.push(`Falla SKU ${index} (${sku}): ${falla}`);
  });

  return {
    productoCompuesto: skuList.join(", "),
    fallaCompuesta: fallaPartes.join(", ")
  };
}

// =======================
// Firebase: guardar ticket
// =======================

async function guardarTicketEnFirebase(ticketData) {
  const { firebaseKey } = getArgentinaDateInfo();
  const url = `${FIREBASE_SNP_BASE_URL}/snp/${encodeURIComponent(
    firebaseKey
  )}.json`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticketData)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Error al guardar en Firebase: " + text);
  }

  const resultado = await res.json().catch(() => null);
  return { key: firebaseKey, data: resultado };
}

// =======================
// Apps Script → Google Sheets
// =======================

async function registrarTicketEnSheet(ticketData) {
  // Enviar como x-www-form-urlencoded + no-cors
  const payload = {
    sucursal: ticketData.sucursal,
    sucursalGerenteNombre: ticketData.sucursalGerenteNombre,
    sucursalGerenteEmail: ticketData.sucursalGerenteEmail,
    cliente: ticketData.cliente,
    nroCliente: ticketData.nroCliente,
    direccion: ticketData.direccion,
    telefono: ticketData.telefono,
    producto: ticketData.producto,
    falla: ticketData.falla,
    createdAtDisplay: ticketData.createdAtDisplay,
    createdAtIso: ticketData.createdAtIso,
    firebaseKey: ticketData.firebaseKey,
    fechaCompra: ticketData.fechaCompra
  };

  const body = new URLSearchParams({
    payload: JSON.stringify(payload)
  });

  // mode: "no-cors" → el request se envía igual, pero no se puede leer el response
  await fetch(APPSCRIPT_SHEET_ENDPOINT, {
    method: "POST",
    body,
    mode: "no-cors"
  });

  // No devolvemos JSON porque el response es opaco
  return { ok: true };
}

// =======================
// Email template HTML
// =======================

function buildTicketEmailHtml(ticket, tipo) {
  const {
    sucursal,
    sucursalGerenteNombre,
    sucursalGerenteEmail,
    cliente,
    nroCliente,
    direccion,
    telefono,
    producto,
    falla,
    fechaCompra,
    fechaDisplay,
    fechaIso
  } = ticket;

  const tituloBase =
    tipo === "gerente"
      ? "Copia de ticket a SNP"
      : `Nuevo ticket cargado por sucursal ${sucursal}`;

  const titulo =
    nroCliente && nroCliente.trim()
      ? `${tituloBase} · Cliente N° ${nroCliente}`
      : tituloBase;

  const leadText =
    tipo === "gerente"
      ? "Recibiste esta copia porque figurás como gerente de la sucursal."
      : "Se cargó un nuevo ticket desde una sucursal de Novogar.";

  const fechaCompraLabel = formatFechaCompra(fechaCompra);

  return `
  <!DOCTYPE html>
  <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>${titulo}</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, system-ui,
            "SF Pro Text", "Helvetica Neue", sans-serif;
          color: #0f172a;
        }
        .root {
          padding: 24px 0;
        }
        .card {
          max-width: 640px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 18px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 22px 55px rgba(15, 23, 42, 0.16);
          overflow: hidden;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 18px;
          border-bottom: 1px solid #e2e8f0;
          background: linear-gradient(
            135deg,
            #f9fafb,
            #e5f0ff
          );
        }
        .title-block h1 {
          margin: 0;
          font-size: 18px;
          color: #0f172a;
        }
        .title-block p {
          margin: 2px 0 0;
          font-size: 12px;
          color: #64748b;
        }
        .body {
          padding: 18px 20px 16px;
        }
        .lead {
          font-size: 13px;
          margin: 0 0 14px;
          color: #334155;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 999px;
          background: #e0edff;
          color: #1d4ed8;
          margin-bottom: 12px;
        }
        .pill-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #22c55e;
        }
        .section-title {
          font-size: 13px;
          font-weight: 600;
          margin: 14px 0 6px;
          color: #0f172a;
        }
        .meta-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .meta-table th,
        .meta-table td {
          padding: 6px 0;
          text-align: left;
        }
        .meta-table th {
          width: 160px;
          color: #64748b;
          font-weight: 500;
          padding-right: 8px;
        }
        .meta-table tr + tr td,
        .meta-table tr + tr th {
          border-top: 1px dashed #e2e8f0;
        }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          font-size: 11px;
          border-radius: 999px;
          background: #dbeafe;
          color: #1d4ed8;
        }
        .falla-box {
          margin-top: 8px;
          padding: 10px 12px;
          border-radius: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          font-size: 12px;
          color: #0f172a;
          white-space: pre-wrap;
        }
        .footer {
          margin-top: 18px;
          font-size: 11px;
          color: #64748b;
        }
        .footer strong {
          color: #0f172a;
        }
        @media (max-width: 600px) {
          .card {
            margin: 0 10px;
          }
          .body {
            padding: 14px 14px 12px;
          }
        }
      </style>
    </head>
    <body>
      <div class="root">
        <div class="card">
          <div class="header">
            <div class="title-block">
              <h1>SNP · Ticket de reclamo</h1>
              <p>${titulo}</p>
            </div>
          </div>
          <div class="body">
            <p class="lead">${leadText}</p>

            <div class="pill">
              <span class="pill-dot"></span>
              <span>Fecha y hora (ARG): ${fechaDisplay}</span>
            </div>

            <div class="section">
              <div class="section-title">Datos de sucursal</div>
              <table class="meta-table">
                <tr>
                  <th>Sucursal</th>
                  <td>${sucursal}</td>
                </tr>
                <tr>
                  <th>Gerente</th>
                  <td>${sucursalGerenteNombre || "-"} &lt;${
    sucursalGerenteEmail || "-"
  }&gt;</td>
                </tr>
              </table>
            </div>

            <div class="section">
              <div class="section-title">Datos del cliente</div>
              <table class="meta-table">
                <tr>
                  <th>Cliente</th>
                  <td>${cliente}</td>
                </tr>
                <tr>
                  <th>Número de cliente</th>
                  <td>${nroCliente || "-"}</td>
                </tr>
                <tr>
                  <th>Dirección</th>
                  <td>${direccion}</td>
                </tr>
                <tr>
                  <th>Teléfono</th>
                  <td>${telefono}</td>
                </tr>
              </table>
            </div>

            <div class="section">
              <div class="section-title">Producto</div>
              <table class="meta-table">
                <tr>
                  <th>SKU(s)</th>
                  <td><span class="badge">${producto}</span></td>
                </tr>
                <tr>
                  <th>Fecha de compra</th>
                  <td>${fechaCompraLabel || "-"}</td>
                </tr>
              </table>

              <div class="section-title">Falla / Reclamo</div>
              <div class="falla-box">
                ${(falla || "")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")}
              </div>
            </div>

            <div class="footer">
              <div><strong>Ticket SNP</strong> · ${fechaIso}</div>
              <div>
                Este correo fue generado automáticamente desde el formulario SNP
                Novogar.
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
}

// =======================
// Envío MailUp
// =======================

async function sendEmailSnp({ toName, toEmail, subject, htmlBody }) {
  const safeEmail = String(toEmail || "").trim();
  if (!safeEmail) {
    console.warn("Email destino vacío, no se envía:", toEmail);
    return { ok: false, error: "Email vacío" };
  }

  const emailData = {
    Html: {
      DocType: null,
      Head: null,
      Body: htmlBody,
      BodyTag: "<body>"
    },
    Text: "",
    Subject: subject,
    From: { Name: "SNP Novogar", Email: "posventa@novogar.com.ar" },
    To: [{ Name: toName || safeEmail, Email: safeEmail }],
    Cc: [],
    Bcc: [],
    ReplyTo: null,
    CharSet: "utf-8",
    ExtendedHeaders: null,
    Attachments: null,
    EmbeddedImages: [],
    XSmtpAPI: {
      CampaignName: "SNP Novogar",
      CampaignCode: "SNP-1001",
      Header: false,
      Footer: true,
      ClickTracking: null,
      ViewTracking: null,
      Priority: null,
      Schedule: null,
      DynamicFields: [],
      CampaignReport: null,
      SkipDynamicFields: null
    },
    User: { Username: SMTP_USERNAME, Secret: SMTP_PASSWORD }
  };

  try {
    const res = await fetch(MAILUP_ENDPOINT, {
      method: "POST",
      headers: {
        "x-cors-api-key": MAILUP_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(emailData)
    });

    const result = await res.json().catch(() => ({}));

    if (result.Status === "done") {
      return { ok: true, result };
    }

    console.error("Error MailUp:", result);
    return { ok: false, result };
  } catch (error) {
    console.error("Error de red al enviar email:", error);
    return { ok: false, error };
  }
}

// =======================
// UI helpers
// =======================

function setFormLoading(loading) {
  const btn = document.getElementById("submit-btn");
  const overlay = document.getElementById("overlay-loading");
  const stepsList = document.getElementById("overlay-steps");
  const mainText = document.getElementById("overlay-main-text");

  if (!btn || !overlay) return;

  btn.disabled = loading;
  if (loading) {
    btn.classList.add("loading");
    overlay.classList.remove("hidden");
    if (stepsList) stepsList.innerHTML = "";
    if (mainText) mainText.textContent = "Enviando ticket…";
  } else {
    btn.classList.remove("loading");
    overlay.classList.add("hidden");
  }
}

function addOverlayStep(text, type = "info") {
  const list = document.getElementById("overlay-steps");
  if (!list) return;

  const li = document.createElement("li");
  let iconClass = "bi-dot text-secondary";

  if (type === "ok") iconClass = "bi-check-circle-fill text-success";
  if (type === "error") iconClass = "bi-exclamation-triangle-fill text-danger";

  li.innerHTML = `<i class="bi ${iconClass} me-1"></i>${text}`;
  list.appendChild(li);
}

function showStatus(message, type = "info") {
  const statusEl = document.getElementById("form-status");
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.classList.remove("error", "success");
  if (type === "error") statusEl.classList.add("error");
  if (type === "success") statusEl.classList.add("success");
}

function showToast() {
  const toast = document.getElementById("global-toast");
  if (!toast) return;
  toast.classList.remove("hidden");
  toast.classList.add("visible");
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 200);
  }, 3500);
}

function initSplash() {
  const splash = document.getElementById("splash");
  const appShell = document.getElementById("app-shell");
  if (!splash || !appShell) return;

  setTimeout(() => {
    splash.classList.add("splash-hide");
    setTimeout(() => {
      splash.style.display = "none";
      appShell.classList.add("ready");
    }, 350);
  }, 2000);
}

// =======================
// Historial de tickets
// =======================

let ticketsCache = null; // array completo ordenado por fecha asc con ticketNumber
let allTicketsDesc = []; // vista ordenada desc para historial
let filteredTickets = [];
let currentHistoryPage = 1;
const HISTORY_PAGE_SIZE = 6;

async function fetchAllTickets() {
  if (ticketsCache) return ticketsCache;

  const url = `${FIREBASE_SNP_BASE_URL}/snp.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo cargar el historial de tickets.");

  const data = await res.json().catch(() => null) || {};

  const arr = Object.entries(data).map(([firebaseKey, value]) => ({
    firebaseKey,
    ...(value || {})
  }));

  // Orden ascendente por fecha para numerar
  arr.sort((a, b) => {
    const aTime = a.createdAtIso ? new Date(a.createdAtIso).getTime() : 0;
    const bTime = b.createdAtIso ? new Date(b.createdAtIso).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return (a.firebaseKey || "").localeCompare(b.firebaseKey || "");
  });

  arr.forEach((t, idx) => {
    t.ticketNumber = idx + 1; // posición en Firebase → número de ticket
  });

  ticketsCache = arr;
  return ticketsCache;
}

function setHistoryLoading(loading) {
  const listEl = document.getElementById("history-list");
  const emptyEl = document.getElementById("history-empty");
  if (!listEl) return;

  if (loading) {
    if (emptyEl) emptyEl.classList.add("d-none");
    listEl.innerHTML = `
      <div class="text-muted small d-flex align-items-center gap-2">
        <div class="spinner-border spinner-border-sm"></div>
        <span>Cargando historial de tickets…</span>
      </div>
    `;
  }
}

async function loadAndRenderTickets(options = {}) {
  const { forceReload = false } = options;
  if (forceReload) {
    ticketsCache = null;
  }

  const listEl = document.getElementById("history-list");
  if (!listEl) return;

  try {
    setHistoryLoading(true);
    const ticketsAsc = await fetchAllTickets();

    // Para mostrar: ordenamos DESC por fecha (más nuevos primero)
    allTicketsDesc = [...ticketsAsc].sort((a, b) => {
      const aTime = a.createdAtIso ? new Date(a.createdAtIso).getTime() : 0;
      const bTime = b.createdAtIso ? new Date(b.createdAtIso).getTime() : 0;
      return bTime - aTime;
    });

    applyHistoryFilters();
  } catch (err) {
    console.error("Error cargando historial:", err);
    listEl.innerHTML =
      '<div class="text-danger small">No se pudo cargar el historial de tickets.</div>';
  }
}

function applyHistoryFilters() {
  const searchInput = document.getElementById("history-search-input");
  const term = (searchInput?.value || "").trim().toLowerCase();

  if (!term) {
    filteredTickets = [...allTicketsDesc];
  } else {
    filteredTickets = allTicketsDesc.filter((t) => {
      const pieces = [
        t.ticketNumber && `ticket ${String(t.ticketNumber).padStart(5, "0")}`,
        t.firebaseKey,
        t.sucursal,
        t.sucursalGerenteNombre,
        t.cliente,
        t.nroCliente,
        t.fechaCompra,
        t.direccion,
        t.telefono,
        t.producto,
        t.falla,
        t.createdAtDisplay
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return pieces.includes(term);
    });
  }

  currentHistoryPage = 1;
  renderHistoryPage();
}

function renderHistoryPage() {
  const listEl = document.getElementById("history-list");
  const emptyEl = document.getElementById("history-empty");
  const pageCurrentEl = document.getElementById("history-page-current");
  const pageTotalEl = document.getElementById("history-page-total");
  const prevBtn = document.getElementById("history-prev-btn");
  const nextBtn = document.getElementById("history-next-btn");

  if (!listEl) return;

  if (!filteredTickets.length) {
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.classList.remove("d-none");
    if (pageCurrentEl) pageCurrentEl.textContent = "0";
    if (pageTotalEl) pageTotalEl.textContent = "0";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  if (emptyEl) emptyEl.classList.add("d-none");

  const totalPages =
    Math.ceil(filteredTickets.length / HISTORY_PAGE_SIZE) || 1;

  if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;

  const start = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
  const end = start + HISTORY_PAGE_SIZE;
  const pageItems = filteredTickets.slice(start, end);

  listEl.innerHTML = pageItems
    .map((t) => {
      const ticketNumberStr = String(t.ticketNumber || "").padStart(5, "0");
      const createdAtDisplay = t.createdAtDisplay || "-";
      const cliente = t.cliente || "-";
      const sucursal = t.sucursal || "-";
      const producto = t.producto || "-";
      const fechaCompraLabel = t.fechaCompra
        ? formatFechaCompra(t.fechaCompra)
        : "";
      const fallaRes =
        t.falla && t.falla.length > 120
          ? `${t.falla.slice(0, 117)}…`
          : t.falla || "";

      return `
        <article class="history-card" data-firebase-key="${t.firebaseKey}">
          <header class="history-card-header">
            <div class="history-card-title">
              <span class="badge-ticket">Ticket #${ticketNumberStr}</span>
              <h3>${cliente}</h3>
            </div>
            <button
              type="button"
              class="btn-icon"
              data-action="reprint"
              title="Reimprimir comprobante"
            >
              <i class="bi bi-printer-fill"></i>
            </button>
          </header>
          <div class="history-card-body">
            <div class="history-row">
              <i class="bi bi-shop"></i>
              <span>${sucursal}</span>
            </div>
            <div class="history-row">
              <i class="bi bi-box-seam"></i>
              <span>SKU(s): <strong>${producto}</strong></span>
            </div>
            <div class="history-row">
              <i class="bi bi-calendar-event"></i>
              <span>${createdAtDisplay}</span>
            </div>
            ${
              fechaCompraLabel
                ? `
            <div class="history-row">
              <i class="bi bi-calendar-check"></i>
              <span>Fecha de compra: <strong>${fechaCompraLabel}</strong></span>
            </div>
            `
                : ""
            }
            <div class="history-row history-row-falla">
              <i class="bi bi-chat-left-text"></i>
              <span>${fallaRes}</span>
            </div>
          </div>
          <footer class="history-card-footer">
            <button
              type="button"
              class="btn btn-xs btn-outline-primary-macos"
              data-action="reprint"
            >
              <i class="bi bi-printer me-1"></i>
              Reimprimir
            </button>
          </footer>
        </article>
      `;
    })
    .join("");

  if (pageCurrentEl) pageCurrentEl.textContent = String(currentHistoryPage);
  if (pageTotalEl) pageTotalEl.textContent = String(totalPages);
  if (prevBtn) prevBtn.disabled = currentHistoryPage <= 1;
  if (nextBtn) nextBtn.disabled = currentHistoryPage >= totalPages;
}

async function handleReprintTicket(firebaseKey) {
  try {
    const tickets = await fetchAllTickets();
    const ticket = tickets.find((t) => t.firebaseKey === firebaseKey);
    if (!ticket) {
      showSwalError(
        "Ticket no encontrado",
        "No se encontró el ticket en el historial."
      );
      return;
    }

    await generateTicketPdf(ticket);
  } catch (err) {
    console.error("Error al reimprimir ticket:", err);
    showSwalError(
      "Error al generar PDF",
      "Ocurrió un error al generar el PDF del comprobante."
    );
  }
}

// =======================
// PDF de comprobante (A4 con 2 mitades)
// =======================

let logoInfoCache = null;

// Cargamos logo + dimensiones para mantener proporción en el PDF
async function loadNovogarLogoInfo() {
  if (logoInfoCache !== null) return logoInfoCache;

  const LOGO_URL = "https://i.postimg.cc/MpgSGZkv/Novogar-N.png";

  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) throw new Error("No se pudo cargar el logo");
    const blob = await res.blob();

    // DataURL
    const dataUrlPromise = new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Dimensiones
    const img = new Image();
    img.crossOrigin = "anonymous";
    const dimPromise = new Promise((resolve, reject) => {
      img.onload = () => {
        resolve({ width: img.width || 1, height: img.height || 1 });
      };
      img.onerror = reject;
    });
    img.src = LOGO_URL;

    const [dataUrl, dim] = await Promise.all([dataUrlPromise, dimPromise]);

    logoInfoCache = {
      dataUrl,
      width: dim.width,
      height: dim.height
    };
    return logoInfoCache;
  } catch (err) {
    console.warn("No se pudo cargar el logo para PDF:", err);
    logoInfoCache = null;
    return null;
  }
}

// Sección de ticket (mitad de hoja)
function drawTicketSection(doc, opts) {
  const { x, y, width, copyLabel, ticket, logoInfo } = opts;
  let cursorY = y;
  const marginX = x;
  const innerWidth = width;

  const ticketNumberStr = String(ticket.ticketNumber || "").padStart(5, "0");

  // Logo + encabezado (manteniendo proporción del logo)
  if (logoInfo && logoInfo.dataUrl) {
    const logoTargetWidth = 18;
    const ratio =
      logoInfo.width > 0 ? logoInfo.height / logoInfo.width : 1;
    const logoTargetHeight = logoTargetWidth * ratio;

    doc.addImage(
      logoInfo.dataUrl,
      "PNG",
      marginX,
      cursorY - 2,
      logoTargetWidth,
      logoTargetHeight
    );
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text(
    "NOVOGAR",
    marginX + (logoInfo ? 22 : 0),
    cursorY + 3
  );

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  doc.text(
    "SNP · Servicio de Posventa",
    marginX + (logoInfo ? 22 : 0),
    cursorY + 8
  );

  // Copy label centrado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text(copyLabel, marginX + innerWidth / 2, cursorY + 2, {
    align: "center"
  });

  cursorY += 18;

  // Título grande
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15);
  doc.text(
    `Ticket SNP #${ticketNumberStr}`,
    marginX + innerWidth / 2,
    cursorY,
    { align: "center" }
  );

  cursorY += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);

  const fecha = ticket.createdAtDisplay || "-";
  const sucursal = ticket.sucursal || "-";

  // Antes iban en la misma línea y se solapaban, ahora las separamos en dos líneas
  doc.text(`Fecha (ARG): ${fecha}`, marginX, cursorY);
  cursorY += 5;
  doc.text(`Sucursal: ${sucursal}`, marginX, cursorY);
  cursorY += 8;

  // Caja cliente / datos principales
  const boxTop = cursorY;
  const boxPadding = 3;
  const boxHeight = 40;

  doc.setDrawColor(190);
  doc.setLineWidth(0.3);
  doc.roundedRect(
    marginX,
    boxTop,
    innerWidth,
    boxHeight,
    2,
    2
  );

  cursorY += boxPadding + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);

  const cliente = ticket.cliente || "-";
  const nroCliente = ticket.nroCliente || "-";
  const telefono = ticket.telefono || "-";

  doc.text(`Cliente: ${cliente}`, marginX + 3, cursorY);

  cursorY += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70);

  doc.text(`N° de cliente: ${nroCliente}`, marginX + 3, cursorY);
  doc.text(`Teléfono: ${telefono}`, marginX + innerWidth / 2, cursorY, {
    align: "right"
  });

  cursorY += 5;

  const direccion = ticket.direccion || "-";
  const direccionLines = doc.splitTextToSize(
    `Dirección: ${direccion}`,
    innerWidth - 6
  );
  doc.text(direccionLines, marginX + 3, cursorY);

  cursorY = boxTop + boxHeight + 6;

  // Producto
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  const producto = ticket.producto || "-";
  doc.text(`Producto (SKU): ${producto}`, marginX, cursorY);

  cursorY += 5;

  // Fecha de compra (si existe)
  const fechaCompraRaw = ticket.fechaCompra || "";
  const fechaCompraLabel = formatFechaCompra(fechaCompraRaw);
  if (fechaCompraLabel) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(70);
    doc.text(`Fecha de compra: ${fechaCompraLabel}`, marginX, cursorY);
    cursorY += 6;
  } else {
    cursorY += 2;
  }

  // Falla
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text("Falla / Reclamo:", marginX, cursorY);

  cursorY += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60);

  const falla = ticket.falla || "-";
  const fallaLines = doc.splitTextToSize(falla, innerWidth);
  doc.text(fallaLines, marginX, cursorY);

  // Pie
  const footerY = boxTop + boxHeight + 26 + 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Este comprobante fue generado desde el sistema SNP Novogar.",
    marginX,
    footerY
  );
}

async function generateTicketPdf(ticket) {
  const jspdfLib = window.jspdf;
  if (!jspdfLib || !jspdfLib.jsPDF) {
    showSwalError(
      "PDF no disponible",
      "No se pudo cargar el generador de PDF (jsPDF)."
    );
    return;
  }

  const { jsPDF } = jspdfLib;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const innerWidth = pageWidth - marginX * 2;
  const halfHeight = pageHeight / 2;

  const logoInfo = await loadNovogarLogoInfo();

  // Mitad superior: copia cliente
  drawTicketSection(doc, {
    x: marginX,
    y: 18,
    width: innerWidth,
    copyLabel: "COPIA PARA EL CLIENTE",
    ticket,
    logoInfo
  });

  // Línea punteada central
  doc.setDrawColor(150);
  doc.setLineWidth(0.3);
  if (doc.setLineDash) {
    doc.setLineDash([1.5, 1.5], 0);
  }
  const yLine = halfHeight;
  doc.line(marginX, yLine, pageWidth - marginX, yLine);

  // Mitad inferior: copia sucursal
  if (doc.setLineDash) {
    doc.setLineDash([]); // reset
  }
  drawTicketSection(doc, {
    x: marginX,
    y: yLine + 12,
    width: innerWidth,
    copyLabel: "COPIA PARA SUCURSAL",
    ticket,
    logoInfo
  });

  const ticketNumberStr = String(ticket.ticketNumber || "").padStart(5, "0");
  doc.save(`ticket-snp-${ticketNumberStr}.pdf`);
}

// Cartel "Imprimir comprobante"

function showPrintBanner(firebaseKey) {
  const banner = document.getElementById("print-ticket-banner");
  if (!banner) return;
  banner.dataset.firebaseKey = firebaseKey;
  banner.classList.remove("hidden");
  banner.classList.add("visible");
}

function hidePrintBanner() {
  const banner = document.getElementById("print-ticket-banner");
  if (!banner) return;
  banner.classList.remove("visible");
  banner.classList.add("hidden");
  banner.removeAttribute("data-firebase-key");
}

// =======================
// DOM + eventos
// =======================

document.addEventListener("DOMContentLoaded", () => {
  initSplash();
  initSkuSection();

  const form = document.getElementById("snp-form");

  const navNew = document.getElementById("nav-new-ticket");
  const navHistory = document.getElementById("nav-history");
  const viewForm = document.getElementById("view-form");
  const viewHistory = document.getElementById("view-history");

  const searchHistoryInput = document.getElementById("history-search-input");
  const historyPrevBtn = document.getElementById("history-prev-btn");
  const historyNextBtn = document.getElementById("history-next-btn");
  const historyListEl = document.getElementById("history-list");
  const refreshHistoryBtn = document.getElementById("refresh-history-btn");

  const printTicketBtn = document.getElementById("print-ticket-btn");

  function setActiveView(view) {
    if (!viewForm || !viewHistory) return;

    if (view === "form") {
      viewForm.classList.add("active");
      viewHistory.classList.remove("active");
      navNew?.classList.add("active");
      navHistory?.classList.remove("active");
    } else {
      viewHistory.classList.add("active");
      viewForm.classList.remove("active");
      navHistory?.classList.add("active");
      navNew?.classList.remove("active");

      // Cargamos historial al entrar
      loadAndRenderTickets();
    }
  }

  if (navNew) {
    navNew.addEventListener("click", () => setActiveView("form"));
  }

  if (navHistory) {
    navHistory.addEventListener("click", () => setActiveView("history"));
  }

  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener("click", () =>
      loadAndRenderTickets({ forceReload: true })
    );
  }

  if (searchHistoryInput) {
    searchHistoryInput.addEventListener("input", () => {
      applyHistoryFilters();
    });
  }

  if (historyPrevBtn) {
    historyPrevBtn.addEventListener("click", () => {
      if (currentHistoryPage > 1) {
        currentHistoryPage -= 1;
        renderHistoryPage();
      }
    });
  }

  if (historyNextBtn) {
    historyNextBtn.addEventListener("click", () => {
      const totalPages =
        Math.ceil(filteredTickets.length / HISTORY_PAGE_SIZE) || 1;
      if (currentHistoryPage < totalPages) {
        currentHistoryPage += 1;
        renderHistoryPage();
      }
    });
  }

  if (historyListEl) {
    historyListEl.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action='reprint']");
      if (!target) return;
      const card = target.closest(".history-card");
      if (!card) return;
      const firebaseKey = card.getAttribute("data-firebase-key");
      if (!firebaseKey) return;
      handleReprintTicket(firebaseKey);
    });
  }

  if (printTicketBtn) {
    printTicketBtn.addEventListener("click", async () => {
      const banner = document.getElementById("print-ticket-banner");
      if (!banner) return;
      const firebaseKey = banner.dataset.firebaseKey;
      if (!firebaseKey) return;

      try {
        const tickets = await fetchAllTickets();
        const ticket = tickets.find((t) => t.firebaseKey === firebaseKey);
        if (!ticket) {
          showSwalError(
            "Ticket no encontrado",
            "No se encontró el ticket en el historial."
          );
          return;
        }
        await generateTicketPdf(ticket);
      } catch (err) {
        console.error("Error al generar PDF del comprobante:", err);
        showSwalError(
          "Error al generar PDF",
          "Ocurrió un error al generar el PDF del comprobante."
        );
      }
    });
  }

  // Envío del formulario
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hidePrintBanner();
      showStatus("");
      setFormLoading(true);
      addOverlayStep("Validando datos del formulario…");

      const sucursalSelect = document.getElementById("sucursal");
      const clienteInput = document.getElementById("cliente");
      const direccionInput = document.getElementById("direccion");
      const telefonoInput = document.getElementById("telefono");
      const nroClienteInput = document.getElementById("nroCliente");
      const fechaCompraInput = document.getElementById("fechaCompra");

      try {
        if (
          !sucursalSelect.value ||
          !clienteInput.value.trim() ||
          !direccionInput.value.trim() ||
          !telefonoInput.value.trim() ||
          !nroClienteInput.value.trim() ||
          !fechaCompraInput.value
        ) {
          throw new Error("Completá todos los campos del formulario.");
        }

        const { productoCompuesto, fallaCompuesta } =
          collectSkuAndFallasFromForm();

        if (!productoCompuesto || !fallaCompuesta) {
          throw new Error(
            "Cargá al menos un SKU y su falla. Si agregaste un SKU vacío, borralo o completalo."
          );
        }

        const opt =
          sucursalSelect.options[sucursalSelect.selectedIndex];
        const sucursal = opt.value;
        const sucursalGerenteEmail =
          (opt.getAttribute("data-gerente-email") || "").trim();
        const sucursalGerenteNombre =
          opt.getAttribute("data-gerente-nombre") || "";

        const { firebaseKey, display, iso } = getArgentinaDateInfo();

        const ticketData = {
          sucursal,
          sucursalGerenteNombre,
          sucursalGerenteEmail,
          cliente: clienteInput.value.trim().toUpperCase(),
          nroCliente: nroClienteInput.value.trim().toUpperCase(),
          direccion: direccionInput.value.trim().toUpperCase(),
          telefono: telefonoInput.value.trim(),
          producto: productoCompuesto,
          falla: fallaCompuesta,
          fechaCompra: fechaCompraInput.value,
          createdAtIso: iso,
          createdAtDisplay: display,
          timezone: "America/Argentina/Cordoba",
          firebaseKey,
          status: "nuevo"
        };

        addOverlayStep("Guardando ticket en Firebase SNP…");
        const saveResult = await guardarTicketEnFirebase({
          ...ticketData
        });
        const savedKey = saveResult?.key || firebaseKey;
        ticketData.firebaseKey = savedKey;

        addOverlayStep("✔ Ticket guardado correctamente.", "ok");

        addOverlayStep("Registrando ticket en Google Sheets…");
        try {
          await registrarTicketEnSheet(ticketData);
          addOverlayStep(
            "✔ Se envió el registro a Google Sheets.",
            "ok"
          );
        } catch (sheetError) {
          console.error(sheetError);
          addOverlayStep(
            "No se pudo registrar el ticket en Sheets.",
            "error"
          );
        }

        const commonEmailData = {
          sucursal: ticketData.sucursal,
          sucursalGerenteNombre: ticketData.sucursalGerenteNombre,
          sucursalGerenteEmail: ticketData.sucursalGerenteEmail,
          cliente: ticketData.cliente,
          nroCliente: ticketData.nroCliente,
          direccion: ticketData.direccion,
          telefono: ticketData.telefono,
          producto: ticketData.producto,
          falla: ticketData.falla,
          fechaCompra: ticketData.fechaCompra,
          fechaDisplay: ticketData.createdAtDisplay,
          fechaIso: ticketData.createdAtIso
        };

        // Armamos sujetos incluyendo nro de cliente si existe
        const nroCliTag = ticketData.nroCliente
          ? ` · Cliente N° ${ticketData.nroCliente}`
          : "";

        const subjectGerente = `Copia de ticket a SNP${nroCliTag}`;
        const subjectSnp = `Nuevo ticket SNP · ${ticketData.sucursal}${nroCliTag}`;

        // 1) Gerente
        if (ticketData.sucursalGerenteEmail) {
          addOverlayStep(
            `Enviando copia al gerente (${ticketData.sucursalGerenteEmail})…`
          );
          const htmlGerente = buildTicketEmailHtml(
            commonEmailData,
            "gerente"
          );
          const rGerente = await sendEmailSnp({
            toName: ticketData.sucursalGerenteNombre,
            toEmail: ticketData.sucursalGerenteEmail,
            subject: subjectGerente,
            htmlBody: htmlGerente
          });
          if (rGerente.ok) {
            addOverlayStep("✔ Copia enviada al gerente.", "ok");
          } else {
            addOverlayStep(
              "No se pudo enviar la copia al gerente.",
              "error"
            );
          }
        }

        // 2) SNP principal
        const htmlSnp = buildTicketEmailHtml(commonEmailData, "snp");

        addOverlayStep(`Enviando notificación a ${EMAIL_SNP}…`);
        const rSnp = await sendEmailSnp({
          toName: "SNP Novogar",
          toEmail: EMAIL_SNP,
          subject: subjectSnp,
          htmlBody: htmlSnp
        });
        addOverlayStep(
          rSnp.ok
            ? "✔ Notificación enviada a snp@novogar.com.ar."
            : "No se pudo notificar a snp@novogar.com.ar.",
          rSnp.ok ? "ok" : "error"
        );

        // 3) SNP secundario
        addOverlayStep(`Enviando notificación a ${EMAIL_SNP_1}…`);
        const rSnp2 = await sendEmailSnp({
          toName: "SNP Novogar",
          toEmail: EMAIL_SNP_1,
          subject: subjectSnp,
          htmlBody: htmlSnp
        });
        addOverlayStep(
          rSnp2.ok
            ? "✔ Notificación enviada a snp1@novogar.com.ar."
            : "No se pudo notificar a snp1@novogar.com.ar.",
          rSnp2.ok ? "ok" : "error"
        );

        // 4) SNP secundario
        addOverlayStep(`Enviando notificación a ${EMAIL_SNP_2}…`);
        const rSnp3 = await sendEmailSnp({
          toName: "SNP Novogar",
          toEmail: EMAIL_SNP_2,
          subject: subjectSnp,
          htmlBody: htmlSnp
        });
        addOverlayStep(
          rSnp3.ok
            ? "✔ Notificación enviada a snp2@novogar.com.ar."
            : "No se pudo notificar a snp2@novogar.com.ar.",
          rSnp3.ok ? "ok" : "error"
        );

        showStatus("Ticket enviado correctamente.", "success");
        showToast();

        // Invalidamos cache de historial para que incluya este ticket
        ticketsCache = null;

        // Mostramos cartel para imprimir comprobante
        showPrintBanner(ticketData.firebaseKey);

        // Reseteamos formulario y dejamos solo 1 SKU limpio
        form.reset();
        const skuListEl = document.getElementById("sku-list");
        if (skuListEl) {
          skuListEl.innerHTML = "";
          const firstItem = createSkuItem(1);
          skuListEl.appendChild(firstItem);
          updateSkuLabelsAndIndices();
        }
      } catch (err) {
        console.error(err);
        addOverlayStep(
          "Ocurrió un error general al procesar el ticket.",
          "error"
        );
        showStatus(
          err?.message || "Ocurrió un error al enviar el ticket.",
          "error"
        );
      } finally {
        setFormLoading(false);
      }
    });
  }
});

// =======================
// Constantes
// =======================

const FIREBASE_SNP_BASE_URL =
  "https://snp-novogar-default-rtdb.asia-southeast1.firebasedatabase.app";

const PRECIOS_BASE_URL =
  "https://precios-novogar-default-rtdb.firebaseio.com/precios.json";

const MAILUP_ENDPOINT =
  "https://proxy.cors.sh/https://send.mailup.com/API/v2.0/messages/sendmessage";
const MAILUP_API_KEY =
  "live_36d58f4c13cb7d838833506e8f6450623bf2605859ac089fa008cfeddd29d8dd";

const SMTP_USERNAME = "s154745_3";
const SMTP_PASSWORD = "QbikuGyHqJ";

const EMAIL_SNP = "snp@novogar.com.ar";
const EMAIL_SNP_1 = "snp1@novogar.com.ar";
const EMAIL_SNP_2 = "snp2@novogar.com.ar";

// Apps Script → Google Sheets
const APPSCRIPT_SHEET_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwVpipEeGXe8rDrpy68NlgW1yq95OpVWNxlfyFVKzoYOj5obfoaCnDyyOS38VfykqUE/exec";