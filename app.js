// =======================
// Configuración
// =======================

// Firebase SNP (guardar tickets)
const FIREBASE_SNP_BASE_URL =
  "https://snp-novogar-default-rtdb.asia-southeast1.firebasedatabase.app";

// Productos (precios Novogar)
const PRECIOS_BASE_URL =
  "https://precios-novogar-default-rtdb.firebaseio.com/precios.json";

// MailUp vía proxy.cors.sh
const MAILUP_ENDPOINT =
  "https://proxy.cors.sh/https://send.mailup.com/API/v2.0/messages/sendmessage";
const MAILUP_API_KEY =
  "live_36d58f4c13cb7d838833506e8f6450623bf2605859ac089fa008cfeddd29d8dd";

// ⚠️ Exponer esto en frontend no es seguro, lo mantengo como en tu ejemplo
const SMTP_USERNAME = "s154745_3";
const SMTP_PASSWORD = "QbikuGyHqJ";

// Destinatarios SNP
const EMAIL_SNP = "snp@novogar.com.ar";
const EMAIL_SNP_1 = "snp1@novogar.com.ar";

// Apps Script → Google Sheets
const APPSCRIPT_SHEET_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwVpipEeGXe8rDrpy68NlgW1yq95OpVWNxlfyFVKzoYOj5obfoaCnDyyOS38VfykqUE/exec";

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
    firebaseKey: ticketData.firebaseKey
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
    fechaDisplay,
    fechaIso
  } = ticket;

  const titulo =
    tipo === "gerente"
      ? "Copia de ticket a SNP"
      : `Nuevo ticket cargado por sucursal ${sucursal}`;

  const leadText =
    tipo === "gerente"
      ? "Recibiste esta copia porque figurás como gerente de la sucursal."
      : "Se cargó un nuevo ticket desde una sucursal de Novogar.";

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
          gap: 14px;
          padding: 16px 18px;
          border-bottom: 1px solid #e2e8f0;
          background: linear-gradient(
            135deg,
            #f9fafb,
            #e5f0ff
          );
        }
        .logo {
          height: 40px;
          width: auto;
          border-radius: 10px;
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
          width: 140px;
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
            <img
              src="https://i.postimg.cc/MpgSGZkv/Novogar-N.png"
              class="logo"
              alt="Novogar"
            />
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
                  <th>SKU</th>
                  <td><span class="badge">${producto}</span></td>
                </tr>
              </table>

              <div class="section-title">Falla / Reclamo</div>
              <div class="falla-box">
                ${falla.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
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
// DOM + eventos
// =======================

document.addEventListener("DOMContentLoaded", () => {
  initSplash();

  const form = document.getElementById("snp-form");
  const productoInput = document.getElementById("producto");
  const suggestionsEl = document.getElementById("product-suggestions");

  // Autocomplete de PRODUCTO (SKU)
  if (productoInput && suggestionsEl) {
    productoInput.addEventListener("input", async (e) => {
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
      productoInput.value = (sku || "").toUpperCase();
      suggestionsEl.classList.add("hidden");
      suggestionsEl.innerHTML = "";
      productoInput.focus();
    });

    document.addEventListener("click", (e) => {
      if (
        !suggestionsEl.contains(e.target) &&
        e.target !== productoInput
      ) {
        suggestionsEl.classList.add("hidden");
      }
    });
  }

  // Envío del formulario
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showStatus("");
      setFormLoading(true);
      addOverlayStep("Validando datos del formulario…");

      const sucursalSelect = document.getElementById("sucursal");
      const clienteInput = document.getElementById("cliente");
      const direccionInput = document.getElementById("direccion");
      const telefonoInput = document.getElementById("telefono");
      const nroClienteInput = document.getElementById("nroCliente");
      const productoInput = document.getElementById("producto");
      const fallaInput = document.getElementById("falla");

      try {
        if (
          !sucursalSelect.value ||
          !clienteInput.value.trim() ||
          !direccionInput.value.trim() ||
          !telefonoInput.value.trim() ||
          !nroClienteInput.value.trim() ||
          !productoInput.value.trim() ||
          !fallaInput.value.trim()
        ) {
          throw new Error("Completá todos los campos del formulario.");
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
          producto: productoInput.value.trim().toUpperCase(),
          falla: fallaInput.value.trim(),
          createdAtIso: iso,
          createdAtDisplay: display,
          timezone: "America/Argentina/Cordoba",
          firebaseKey,
          status: "nuevo"
        };

        addOverlayStep("Guardando ticket en Firebase SNP…");
        await guardarTicketEnFirebase({ ...ticketData });
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
          fechaDisplay: ticketData.createdAtDisplay,
          fechaIso: ticketData.createdAtIso
        };

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
            subject: "Copia de ticket a SNP",
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
        const subjectSnp = `Tenés un nuevo ticket cargado por sucursal ${ticketData.sucursal}`;

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

        showStatus("Ticket enviado correctamente.", "success");
        showToast();
        form.reset();
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