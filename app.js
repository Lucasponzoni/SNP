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
// Normalizador de texto (búsquedas rápidas)
// =======================
function normalizeSearchText(input) {
  return String(input || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function sanitizeLocalidadDisplay(raw) {
  const s = String(raw || "").trim().replace(/^_+/, "");
  return s.toUpperCase();
}

function getLocalidadesDatasetSafe() {
  // ciudades.js tiene: const localidades = [...]
  try {
    // eslint-disable-next-line no-undef
    if (typeof localidades !== "undefined" && Array.isArray(localidades)) {
      // eslint-disable-next-line no-undef
      return localidades;
    }
  } catch (_) {}
  // fallback por si el user lo expone como window.localidades
  return Array.isArray(window.localidades) ? window.localidades : [];
}

function buildCiudadLabel(item) {
  const cp = item?.cpPrimary ? String(item.cpPrimary) : "-";
  const loc = item?.localidad ? String(item.localidad) : "-";
  const prov = item?.provincia ? String(item.provincia) : "-";
  return `${cp} · ${loc} · ${prov}`.toUpperCase();
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

function toCapitalizedText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("es-AR")
    .replace(/\b(\p{L})/gu, (m) => m.toLocaleUpperCase("es-AR"));
}

const BRANCHES_STORAGE_KEY = "snp_custom_branches_v1";
let branchesState = [];
let editingBranchId = null;
let claimsByBranchChart = null;
let skuRankingChart = null;
let chartDateRange = { from: null, to: null };

function createBranchId() {
  return `branch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getInitialBranchesFromSelect() {
  const select = document.getElementById("sucursal");
  if (!select) return [];

  return Array.from(select.options)
    .filter((opt) => opt.value)
    .map((opt) => ({
      id: createBranchId(),
      name: String(opt.value || "").trim(),
      managerName: String(opt.getAttribute("data-gerente-nombre") || "").trim(),
      managerEmail: String(opt.getAttribute("data-gerente-email") || "").trim()
    }));
}

function saveBranches() {
  localStorage.setItem(BRANCHES_STORAGE_KEY, JSON.stringify(branchesState));
}

function loadBranches() {
  const raw = localStorage.getItem(BRANCHES_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        branchesState = parsed;
        return;
      }
    } catch (err) {
      console.warn("No se pudo parsear sucursales guardadas:", err);
    }
  }

  branchesState = getInitialBranchesFromSelect();
  saveBranches();
}

function renderBranchesInSelects() {
  const sucursalSelect = document.getElementById("sucursal");
  const chartsFilter = document.getElementById("charts-branch-filter");

  if (sucursalSelect) {
    const current = sucursalSelect.value;
    sucursalSelect.innerHTML = '<option value="">Seleccioná una sucursal…</option>';

    branchesState.forEach((branch) => {
      const option = document.createElement("option");
      option.value = branch.name;
      option.textContent = toCapitalizedText(branch.name);
      option.setAttribute("data-gerente-nombre", toCapitalizedText(branch.managerName));
      option.setAttribute("data-gerente-email", String(branch.managerEmail || "").trim().toLowerCase());
      sucursalSelect.appendChild(option);
    });

    if (current && Array.from(sucursalSelect.options).some((o) => o.value === current)) {
      sucursalSelect.value = current;
    }
  }

  if (chartsFilter) {
    const previouslySelected = new Set(
      Array.from(chartsFilter.selectedOptions || []).map((o) => o.value)
    );
    chartsFilter.innerHTML = "";
    branchesState.forEach((branch) => {
      const option = document.createElement("option");
      option.value = branch.name;
      option.textContent = toCapitalizedText(branch.name);
      if (previouslySelected.has(branch.name)) option.selected = true;
      chartsFilter.appendChild(option);
    });
  }
}

function renderBranchesAdmin() {
  const list = document.getElementById("branches-list");
  if (!list) return;

  list.innerHTML = "";

  branchesState.forEach((branch) => {
    const card = document.createElement("article");
    card.className = "branch-card";
    card.dataset.id = branch.id;
    card.innerHTML = `
      <div class="branch-fields">
        <input type="text" class="form-control capitalize-text" data-field="name" value="${toCapitalizedText(branch.name)}" ${editingBranchId === branch.id ? "" : "disabled"} />
        <input type="text" class="form-control capitalize-text" data-field="managerName" value="${toCapitalizedText(branch.managerName)}" ${editingBranchId === branch.id ? "" : "disabled"} />
        <input type="text" class="form-control capitalize-text" data-field="managerEmail" value="${String(branch.managerEmail || "").trim().toLowerCase()}" ${editingBranchId === branch.id ? "" : "disabled"} />
        <div class="d-flex gap-1">
          <button type="button" class="btn btn-sm btn-outline-secondary-macos" data-action="${editingBranchId === branch.id ? "save" : "edit"}">
            <i class="bi bi-${editingBranchId === branch.id ? "check2" : "pencil"}"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary-macos" data-action="delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

function upsertBranch(payload) {
  const name = toCapitalizedText(payload.name);
  const managerName = toCapitalizedText(payload.managerName);
  const managerEmail = String(payload.managerEmail || "").trim().toLowerCase();
  if (!name || !managerName || !managerEmail) {
    throw new Error("Completá nombre de sucursal, gerente y email.");
  }

  if (payload.id) {
    branchesState = branchesState.map((b) =>
      b.id === payload.id ? { ...b, name, managerName, managerEmail } : b
    );
  } else {
    branchesState.push({ id: createBranchId(), name, managerName, managerEmail });
  }

  branchesState.sort((a, b) => a.name.localeCompare(b.name, "es"));
  saveBranches();
  renderBranchesInSelects();
  renderBranchesAdmin();
}

function deleteBranch(branchId) {
  branchesState = branchesState.filter((b) => b.id !== branchId);
  saveBranches();
  renderBranchesInSelects();
  renderBranchesAdmin();
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
  return productosCache.filter((p) => p.sku && p.sku.toString().startsWith(t));
}

// =======================
// Ciudad / Localidad (autocomplete + infinite scroll)
// =======================
let ciudadesIndexReady = false;

let ciudadesItems = []; // [{id, localidad, provincia, partido, cps[], cpPrimary, locN, provN}]
let ciudadesPrefixMap = new Map(); // prefix3 -> indices[]
let ciudadesCpPrefix2Map = new Map(); // prefix2 -> Set(indices)
let ciudadesCpMap = new Map(); // full cp -> indices[]

const CITY_PAGE_SIZE = 20;
const CITY_RENDER_MAX = 300;

let cityState = {
  selected: null,
  matches: [],
  page: 0,
  termNorm: "",
  inputTimer: null
};

function pushToMapArray(map, key, value) {
  if (!key) return;
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function pushToMapSet(map, key, value) {
  if (!key) return;
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

function prepareCiudadesIndexIfNeeded() {
  if (ciudadesIndexReady) return;

  const data = getLocalidadesDatasetSafe();
  if (!Array.isArray(data) || !data.length) {
    console.warn("Dataset de ciudades no disponible o vacío (ciudades.js).");
    ciudadesItems = [];
    ciudadesIndexReady = true;
    return;
  }

  const items = [];
  const prefixMap = new Map();
  const cpPrefix2Map = new Map();
  const cpMap = new Map();

  for (let i = 0; i < data.length; i++) {
    const raw = data[i] || {};
    const id = String(raw.idDeProvLocalidad || "").trim();

    const localidad = sanitizeLocalidadDisplay(raw.localidad);
    const provincia = sanitizeLocalidadDisplay(raw.provincia);
    const partido = sanitizeLocalidadDisplay(raw.partido);

    const cps = Array.isArray(raw.codigosPostales)
      ? raw.codigosPostales.map((c) => String(c || "").trim()).filter(Boolean)
      : [];

    const cpPrimary = cps[0] || "";

    const locN = normalizeSearchText(localidad);
    const provN = normalizeSearchText(provincia);

    const item = {
      id,
      localidad,
      provincia,
      partido,
      cps,
      cpPrimary,
      locN,
      provN
    };

    const idx = items.length;
    items.push(item);

    // Prefix locality (3 chars)
    const prefix3 = locN.slice(0, 3);
    if (prefix3.length === 3) {
      pushToMapArray(prefixMap, prefix3, idx);
    }

    // CP indices
    for (let k = 0; k < cps.length; k++) {
      const cp = String(cps[k] || "").trim();
      if (!cp) continue;

      const p2 = cp.slice(0, 2);
      if (p2.length === 2) pushToMapSet(cpPrefix2Map, p2, idx);

      pushToMapArray(cpMap, cp, idx);
    }
  }

  ciudadesItems = items;
  ciudadesPrefixMap = prefixMap;
  ciudadesCpPrefix2Map = cpPrefix2Map;
  ciudadesCpMap = cpMap;
  ciudadesIndexReady = true;
}

function getCityMatches(termNorm) {
  if (!termNorm) return [];

  // si es número → buscar por CP
  const isDigitsOnly = /^\d+$/.test(termNorm);

  if (isDigitsOnly && termNorm.length >= 2) {
    const p2 = termNorm.slice(0, 2);
    const set = ciudadesCpPrefix2Map.get(p2);
    if (!set) return [];

    const candidate = Array.from(set);
    const filtered = [];

    for (let i = 0; i < candidate.length; i++) {
      const idx = candidate[i];
      const item = ciudadesItems[idx];
      if (!item) continue;

      const ok = (item.cps || []).some((cp) => String(cp).startsWith(termNorm));
      if (ok) filtered.push(idx);

      if (filtered.length >= CITY_RENDER_MAX) break;
    }

    // ranking: CP exact first, luego cpPrimary, luego localidad
    filtered.sort((a, b) => {
      const A = ciudadesItems[a];
      const B = ciudadesItems[b];
      const aExact = (A.cps || []).some((cp) => String(cp) === termNorm) ? 0 : 1;
      const bExact = (B.cps || []).some((cp) => String(cp) === termNorm) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      const aCp = String(A.cpPrimary || "");
      const bCp = String(B.cpPrimary || "");
      if (aCp !== bCp) return aCp.localeCompare(bCp);

      const aLoc = String(A.localidad || "");
      const bLoc = String(B.localidad || "");
      if (aLoc !== bLoc) return aLoc.localeCompare(bLoc);

      return String(A.provincia || "").localeCompare(String(B.provincia || ""));
    });

    return filtered;
  }

  // texto → buscar por localidad
  if (termNorm.length < 3) return [];

  const prefix3 = termNorm.slice(0, 3);
  const candidates = ciudadesPrefixMap.get(prefix3) || [];
  if (!candidates.length) return [];

  const filtered = [];
  for (let i = 0; i < candidates.length; i++) {
    const idx = candidates[i];
    const item = ciudadesItems[idx];
    if (!item) continue;

    if (item.locN.includes(termNorm)) {
      filtered.push(idx);
      if (filtered.length >= CITY_RENDER_MAX) break;
    }
  }

  filtered.sort((a, b) => {
    const A = ciudadesItems[a];
    const B = ciudadesItems[b];
    const aLoc = String(A.localidad || "");
    const bLoc = String(B.localidad || "");
    if (aLoc !== bLoc) return aLoc.localeCompare(bLoc);

    const aProv = String(A.provincia || "");
    const bProv = String(B.provincia || "");
    if (aProv !== bProv) return aProv.localeCompare(bProv);

    const aCp = String(A.cpPrimary || "");
    const bCp = String(B.cpPrimary || "");
    return aCp.localeCompare(bCp);
  });

  return filtered;
}

function setSelectedCityInForm(item) {
  const input = document.getElementById("ciudad");
  const sug = document.getElementById("ciudad-suggestions");

  const hidId = document.getElementById("ciudadId");
  const hidCp = document.getElementById("ciudadCp");
  const hidLoc = document.getElementById("ciudadLocalidad");
  const hidProv = document.getElementById("ciudadProvincia");

  if (!input) return;

  cityState.selected = item || null;

  if (item) {
    const label = buildCiudadLabel(item);
    input.value = label;
    input.dataset.selected = "1";

    if (hidId) hidId.value = item.id || "";
    if (hidCp) hidCp.value = item.cpPrimary || "";
    if (hidLoc) hidLoc.value = item.localidad || "";
    if (hidProv) hidProv.value = item.provincia || "";

    if (sug) {
      sug.classList.add("hidden");
      sug.innerHTML = "";
    }
  } else {
    input.dataset.selected = "0";
    if (hidId) hidId.value = "";
    if (hidCp) hidCp.value = "";
    if (hidLoc) hidLoc.value = "";
    if (hidProv) hidProv.value = "";
  }
}

function renderCitySuggestions(reset = false) {
  const suggestionsEl = document.getElementById("ciudad-suggestions");
  if (!suggestionsEl) return;

  if (reset) {
    suggestionsEl.scrollTop = 0;
    suggestionsEl.innerHTML = "";
  }

  const total = cityState.matches.length;
  if (!total) {
    suggestionsEl.innerHTML = "";
    suggestionsEl.classList.add("hidden");
    return;
  }

  const nextPage = cityState.page + 1;
  const start = (nextPage - 1) * CITY_PAGE_SIZE;
  const end = Math.min(start + CITY_PAGE_SIZE, total);

  if (start >= end) return;

  const frag = document.createDocumentFragment();

  for (let i = start; i < end; i++) {
    const idx = cityState.matches[i];
    const item = ciudadesItems[idx];
    if (!item) continue;

    const cp = item.cpPrimary || (item.cps && item.cps[0]) || "-";
    const loc = item.localidad || "-";
    const prov = item.provincia || "-";

    const li = document.createElement("li");
    li.setAttribute("data-city-idx", String(idx));
    li.innerHTML = `
      <div class="city-left">
        <div class="city-name">${loc}</div>
        <div class="city-prov">${prov}</div>
      </div>
      <div class="city-cp">${cp}</div>
    `;
    frag.appendChild(li);
  }

  suggestionsEl.appendChild(frag);
  cityState.page = nextPage;

  suggestionsEl.classList.remove("hidden");
}

function initCityAutocomplete() {
  const input = document.getElementById("ciudad");
  const suggestionsEl = document.getElementById("ciudad-suggestions");
  if (!input || !suggestionsEl) return;

  prepareCiudadesIndexIfNeeded();

  const onInput = () => {
    // si el usuario escribe, invalido selección anterior
    if (cityState.selected) {
      setSelectedCityInForm(null);
    }

    const raw = input.value || "";
    const termNorm = normalizeSearchText(raw);

    cityState.termNorm = termNorm;
    cityState.page = 0;

    // reglas mínimas: CP >= 2 dígitos, Texto >= 3 caracteres
    const isDigits = /^\d+$/.test(termNorm);

    if ((isDigits && termNorm.length < 2) || (!isDigits && termNorm.length < 3)) {
      suggestionsEl.classList.add("hidden");
      suggestionsEl.innerHTML = "";
      cityState.matches = [];
      return;
    }

    cityState.matches = getCityMatches(termNorm);
    renderCitySuggestions(true);
  };

  input.addEventListener("input", () => {
    if (cityState.inputTimer) clearTimeout(cityState.inputTimer);
    cityState.inputTimer = setTimeout(onInput, 110);
  });

  input.addEventListener("keydown", (e) => {
    // Enter: si hay sugerencias y no seleccionó, selecciono el primero
    if (e.key === "Enter") {
      const listVisible = !suggestionsEl.classList.contains("hidden");
      const hasOne = suggestionsEl.querySelector("li[data-city-idx]");
      if (listVisible && hasOne && !cityState.selected) {
        e.preventDefault();
        const idx = Number(hasOne.getAttribute("data-city-idx") || -1);
        if (idx >= 0 && ciudadesItems[idx]) {
          setSelectedCityInForm(ciudadesItems[idx]);
        }
      }
    }
    if (e.key === "Escape") {
      suggestionsEl.classList.add("hidden");
    }
  });

  suggestionsEl.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-city-idx]");
    if (!li) return;
    const idx = Number(li.getAttribute("data-city-idx") || -1);
    const item = ciudadesItems[idx];
    if (!item) return;

    setSelectedCityInForm(item);
    input.focus();
  });

  suggestionsEl.addEventListener("scroll", () => {
    const nearBottom =
      suggestionsEl.scrollTop + suggestionsEl.clientHeight >=
      suggestionsEl.scrollHeight - 18;

    if (nearBottom) {
      renderCitySuggestions(false);
    }
  });
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
        const precio = p.contadoWeb || p.oferta || p.precioSugerido || p.ml || "";
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

function handleGlobalClickForAllSuggestions(e) {
  document.querySelectorAll(".suggestions").forEach((ul) => {
    const wrapper = ul.closest(".product-input-wrapper") || ul.parentElement;
    if (!wrapper) return;
    if (!wrapper.contains(e.target)) {
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

  const title = skuValue && idx ? `Quitar SKU ${idx} (${skuValue})` : `Quitar SKU`;

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
  const url = `${FIREBASE_SNP_BASE_URL}/snp/${encodeURIComponent(firebaseKey)}.json`;

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

async function registrarTicketEnSheet(ticketData) {
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
    fechaCompra: ticketData.fechaCompra,
    ciudad: ticketData.ciudad
  };

  const body = new URLSearchParams({
    payload: JSON.stringify(payload)
  });

  await fetch(APPSCRIPT_SHEET_ENDPOINT, {
    method: "POST",
    body,
    mode: "no-cors"
  });

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
    ciudad, // ✅ NUEVO
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
  const ciudadLabel = ciudad || "-";

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
                  <td>${sucursalGerenteNombre || "-"} &lt;${sucursalGerenteEmail || "-"}&gt;</td>
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
                  <th>Ciudad / Localidad</th>
                  <td>${ciudadLabel}</td>
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

  const data = (await res.json().catch(() => null)) || {};

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
        t.ciudad, // ✅ NUEVO
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
      const ciudad = t.ciudad || ""; // ✅ NUEVO
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

            ${
              ciudad
                ? `
            <div class="history-row">
              <i class="bi bi-geo-alt"></i>
              <span>${ciudad}</span>
            </div>
            `
                : ""
            }

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

function parseDateFromTicket(ticket) {
  if (ticket?.createdAtIso) {
    const parsed = new Date(ticket.createdAtIso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function ticketMatchesChartFilters(ticket, selectedBranches) {
  if (selectedBranches.length && !selectedBranches.includes(ticket.sucursal)) {
    return false;
  }

  if (chartDateRange.from || chartDateRange.to) {
    const ticketDate = parseDateFromTicket(ticket);
    if (!ticketDate) return false;
    if (chartDateRange.from && ticketDate < chartDateRange.from) return false;
    if (chartDateRange.to && ticketDate > chartDateRange.to) return false;
  }

  return true;
}

function destroyChartsIfNeeded() {
  if (claimsByBranchChart) {
    claimsByBranchChart.destroy();
    claimsByBranchChart = null;
  }
  if (skuRankingChart) {
    skuRankingChart.destroy();
    skuRankingChart = null;
  }
}

async function renderChartsView() {
  const branchSelect = document.getElementById("charts-branch-filter");
  const claimsCanvas = document.getElementById("claims-by-branch-chart");
  const skuCanvas = document.getElementById("sku-ranking-chart");
  if (!branchSelect || !claimsCanvas || !skuCanvas || !window.Chart) return;

  const selectedBranches = Array.from(branchSelect.selectedOptions).map((o) => o.value);
  const tickets = await fetchAllTickets();
  const filtered = tickets.filter((t) => ticketMatchesChartFilters(t, selectedBranches));

  const claimsMap = new Map();
  const skuMap = new Map();

  filtered.forEach((t) => {
    const branchKey = t.sucursal || "Sin sucursal";
    claimsMap.set(branchKey, (claimsMap.get(branchKey) || 0) + 1);

    const skus = String(t.producto || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    skus.forEach((sku) => skuMap.set(sku, (skuMap.get(sku) || 0) + 1));
  });

  const claimsRows = Array.from(claimsMap.entries()).sort((a, b) => b[1] - a[1]);
  const skuRows = Array.from(skuMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  destroyChartsIfNeeded();

  claimsByBranchChart = new Chart(claimsCanvas, {
    type: "bar",
    data: {
      labels: claimsRows.map(([name]) => toCapitalizedText(name)),
      datasets: [
        {
          label: "Reclamos",
          data: claimsRows.map(([, count]) => count),
          backgroundColor: "rgba(59, 130, 246, 0.55)",
          borderColor: "rgba(37, 99, 235, 1)",
          borderWidth: 1
        }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  skuRankingChart = new Chart(skuCanvas, {
    type: "bar",
    data: {
      labels: skuRows.map(([sku]) => sku),
      datasets: [
        {
          label: "Cantidad",
          data: skuRows.map(([, count]) => count),
          backgroundColor: "rgba(16, 185, 129, 0.55)",
          borderColor: "rgba(5, 150, 105, 1)",
          borderWidth: 1
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

async function handleReprintTicket(firebaseKey) {
  try {
    const tickets = await fetchAllTickets();
    const ticket = tickets.find((t) => t.firebaseKey === firebaseKey);
    if (!ticket) {
      showSwalError("Ticket no encontrado", "No se encontró el ticket en el historial.");
      return;
    }

    await generateTicketPdf(ticket);
  } catch (err) {
    console.error("Error al reimprimir ticket:", err);
    showSwalError("Error al generar PDF", "Ocurrió un error al generar el PDF del comprobante.");
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
    const ratio = logoInfo.width > 0 ? logoInfo.height / logoInfo.width : 1;
    const logoTargetHeight = logoTargetWidth * ratio;

    doc.addImage(logoInfo.dataUrl, "PNG", marginX, cursorY - 2, logoTargetWidth, logoTargetHeight);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text("NOVOGAR", marginX + (logoInfo ? 22 : 0), cursorY + 3);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  doc.text("SNP · Servicio de Posventa", marginX + (logoInfo ? 22 : 0), cursorY + 8);

  // Copy label centrado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text(copyLabel, marginX + innerWidth / 2, cursorY + 2, { align: "center" });

  cursorY += 18;

  // Título grande
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15);
  doc.text(`Ticket SNP #${ticketNumberStr}`, marginX + innerWidth / 2, cursorY, { align: "center" });

  cursorY += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);

  const fecha = ticket.createdAtDisplay || "-";
  const sucursal = ticket.sucursal || "-";

  doc.text(`Fecha (ARG): ${fecha}`, marginX, cursorY);
  cursorY += 5;
  doc.text(`Sucursal: ${sucursal}`, marginX, cursorY);
  cursorY += 8;

  // Caja cliente / datos principales (altura dinámica por dirección + ciudad)
  const boxTop = cursorY;
  const boxPadding = 3;

  const cliente = ticket.cliente || "-";
  const nroCliente = ticket.nroCliente || "-";
  const telefono = ticket.telefono || "-";
  const direccion = ticket.direccion || "-";
  const ciudad = ticket.ciudad || "-";

  const direccionLines = doc.splitTextToSize(`Dirección: ${direccion}`, innerWidth - 6);
  const ciudadLines = doc.splitTextToSize(`Ciudad: ${ciudad}`, innerWidth - 6);

  const lineH = 4.5;
  const baseBoxHeight = 18; // cliente + nro/tel + pequeños espacios
  let boxHeight = baseBoxHeight + direccionLines.length * lineH + ciudadLines.length * lineH + 6;

  // un poco de control por si se hace enorme
  boxHeight = Math.min(Math.max(boxHeight, 42), 62);

  doc.setDrawColor(190);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, boxTop, innerWidth, boxHeight, 2, 2);

  cursorY += boxPadding + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(`Cliente: ${cliente}`, marginX + 3, cursorY);

  cursorY += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70);

  doc.text(`N° de cliente: ${nroCliente}`, marginX + 3, cursorY);
  doc.text(`Teléfono: ${telefono}`, marginX + innerWidth - 3, cursorY, { align: "right" });

  cursorY += 5;
  doc.text(direccionLines, marginX + 3, cursorY);
  cursorY += direccionLines.length * lineH;

  doc.text(ciudadLines, marginX + 3, cursorY);

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
  doc.text("Este comprobante fue generado desde el sistema SNP Novogar.", marginX, footerY);
}

async function generateTicketPdf(ticket) {
  const jspdfLib = window.jspdf;
  if (!jspdfLib || !jspdfLib.jsPDF) {
    showSwalError("PDF no disponible", "No se pudo cargar el generador de PDF (jsPDF).");
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
  initCityAutocomplete();

  // click global para cerrar suggestions (SKU + Ciudad)
  document.addEventListener("click", handleGlobalClickForAllSuggestions);

  const form = document.getElementById("snp-form");

  const navNew = document.getElementById("nav-new-ticket");
  const navHistory = document.getElementById("nav-history");
  const navBranches = document.getElementById("nav-branches");
  const navCharts = document.getElementById("nav-charts");
  const viewForm = document.getElementById("view-form");
  const viewHistory = document.getElementById("view-history");
  const viewBranches = document.getElementById("view-branches");
  const viewCharts = document.getElementById("view-charts");

  const searchHistoryInput = document.getElementById("history-search-input");
  const historyPrevBtn = document.getElementById("history-prev-btn");
  const historyNextBtn = document.getElementById("history-next-btn");
  const historyListEl = document.getElementById("history-list");
  const refreshHistoryBtn = document.getElementById("refresh-history-btn");
  const branchForm = document.getElementById("branch-form");
  const branchesList = document.getElementById("branches-list");
  const chartsApplyBtn = document.getElementById("charts-apply-btn");
  const chartsDateRangeInput = document.getElementById("charts-date-range");
  const chartsBranchFilter = document.getElementById("charts-branch-filter");

  const printTicketBtn = document.getElementById("print-ticket-btn");

  loadBranches();
  renderBranchesInSelects();
  renderBranchesAdmin();

  function setActiveView(view) {
    [viewForm, viewHistory, viewBranches, viewCharts].forEach((v) => v?.classList.remove("active"));
    [navNew, navHistory, navBranches, navCharts].forEach((n) => n?.classList.remove("active"));

    if (view === "form") {
      viewForm?.classList.add("active");
      navNew?.classList.add("active");
      return;
    }
    if (view === "history") {
      viewHistory?.classList.add("active");
      navHistory?.classList.add("active");
      loadAndRenderTickets();
      return;
    }
    if (view === "branches") {
      viewBranches?.classList.add("active");
      navBranches?.classList.add("active");
      renderBranchesAdmin();
      return;
    }
    if (view === "charts") {
      viewCharts?.classList.add("active");
      navCharts?.classList.add("active");
      renderChartsView();
    }
  }

  if (chartsDateRangeInput && window.flatpickr) {
    flatpickr(chartsDateRangeInput, {
      mode: "range",
      dateFormat: "Y-m-d",
      locale: window.flatpickr?.l10ns?.es || "es",
      onClose: (selectedDates) => {
        const from = selectedDates[0] || null;
        const toBase = selectedDates[1] || selectedDates[0] || null;
        const to = toBase ? new Date(toBase) : null;
        if (to) to.setHours(23, 59, 59, 999);
        chartDateRange = {
          from,
          to
        };
      }
    });
  }

  if (navNew) {
    navNew.addEventListener("click", () => setActiveView("form"));
  }

  if (navHistory) {
    navHistory.addEventListener("click", () => setActiveView("history"));
  }
  if (navBranches) {
    navBranches.addEventListener("click", () => setActiveView("branches"));
  }
  if (navCharts) {
    navCharts.addEventListener("click", () => setActiveView("charts"));
  }

  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener("click", () =>
      loadAndRenderTickets({ forceReload: true })
    );
  }

  if (chartsApplyBtn) {
    chartsApplyBtn.addEventListener("click", () => renderChartsView());
  }
  if (chartsBranchFilter) {
    chartsBranchFilter.addEventListener("change", () => renderChartsView());
  }

  if (branchForm) {
    branchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("branch-name-input")?.value || "";
      const managerName = document.getElementById("branch-manager-input")?.value || "";
      const managerEmail = document.getElementById("branch-email-input")?.value || "";

      try {
        upsertBranch({ name, managerName, managerEmail });
        branchForm.reset();
        editingBranchId = null;
      } catch (err) {
        showSwalError("No se pudo guardar", err?.message || "Revisá los datos.");
      }
    });
  }

  if (branchesList) {
    branchesList.addEventListener("click", (e) => {
      const actionBtn = e.target.closest("[data-action]");
      if (!actionBtn) return;
      const card = e.target.closest(".branch-card");
      const branchId = card?.dataset?.id;
      if (!branchId) return;

      const action = actionBtn.dataset.action;
      if (action === "edit") {
        editingBranchId = branchId;
        renderBranchesAdmin();
        return;
      }
      if (action === "delete") {
        deleteBranch(branchId);
        renderChartsView();
        return;
      }
      if (action === "save") {
        const name = card.querySelector('[data-field="name"]')?.value || "";
        const managerName = card.querySelector('[data-field="managerName"]')?.value || "";
        const managerEmail = card.querySelector('[data-field="managerEmail"]')?.value || "";
        try {
          upsertBranch({ id: branchId, name, managerName, managerEmail });
          editingBranchId = null;
          renderChartsView();
        } catch (err) {
          showSwalError("No se pudo actualizar", err?.message || "Revisá los datos.");
        }
      }
    });
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
      const totalPages = Math.ceil(filteredTickets.length / HISTORY_PAGE_SIZE) || 1;
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
          showSwalError("Ticket no encontrado", "No se encontró el ticket en el historial.");
          return;
        }
        await generateTicketPdf(ticket);
      } catch (err) {
        console.error("Error al generar PDF del comprobante:", err);
        showSwalError("Error al generar PDF", "Ocurrió un error al generar el PDF del comprobante.");
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
      const ciudadInput = document.getElementById("ciudad"); // ✅ NUEVO
      const telefonoInput = document.getElementById("telefono");
      const nroClienteInput = document.getElementById("nroCliente");
      const fechaCompraInput = document.getElementById("fechaCompra");

      try {
        if (
          !sucursalSelect?.value ||
          !clienteInput?.value.trim() ||
          !direccionInput?.value.trim() ||
          !ciudadInput?.value.trim() ||
          !telefonoInput?.value.trim() ||
          !nroClienteInput?.value.trim() ||
          !fechaCompraInput?.value
        ) {
          throw new Error("Completá todos los campos del formulario.");
        }

        // ✅ ciudad obligatoria por selección
        if (!cityState.selected) {
          throw new Error(
            "Seleccioná una Ciudad / Localidad desde las sugerencias (buscá por CP o nombre)."
          );
        }

        const { productoCompuesto, fallaCompuesta } = collectSkuAndFallasFromForm();

        if (!productoCompuesto || !fallaCompuesta) {
          throw new Error(
            "Cargá al menos un SKU y su falla. Si agregaste un SKU vacío, borralo o completalo."
          );
        }

        const opt = sucursalSelect.options[sucursalSelect.selectedIndex];
        const sucursal = opt.value;
        const sucursalGerenteEmail = (opt.getAttribute("data-gerente-email") || "").trim();
        const sucursalGerenteNombre = opt.getAttribute("data-gerente-nombre") || "";

        const { firebaseKey, display, iso } = getArgentinaDateInfo();

        const ciudadLabel = buildCiudadLabel(cityState.selected);

        const ticketData = {
          sucursal,
          sucursalGerenteNombre,
          sucursalGerenteEmail,
          cliente: clienteInput.value.trim().toUpperCase(),
          nroCliente: nroClienteInput.value.trim().toUpperCase(),
          direccion: direccionInput.value.trim().toUpperCase(),
          ciudad: ciudadLabel, // ✅ NUEVO (CP · LOCALIDAD · PROVINCIA)
          ciudadId: cityState.selected?.id || "",
          ciudadCp: cityState.selected?.cpPrimary || "",
          ciudadLocalidad: cityState.selected?.localidad || "",
          ciudadProvincia: cityState.selected?.provincia || "",
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
        const saveResult = await guardarTicketEnFirebase({ ...ticketData });
        const savedKey = saveResult?.key || firebaseKey;
        ticketData.firebaseKey = savedKey;

        addOverlayStep("✔ Ticket guardado correctamente.", "ok");

        addOverlayStep("Registrando ticket en Google Sheets…");
        try {
          await registrarTicketEnSheet(ticketData);
          addOverlayStep("✔ Se envió el registro a Google Sheets.", "ok");
        } catch (sheetError) {
          console.error(sheetError);
          addOverlayStep("No se pudo registrar el ticket en Sheets.", "error");
        }

        const commonEmailData = {
          sucursal: ticketData.sucursal,
          sucursalGerenteNombre: ticketData.sucursalGerenteNombre,
          sucursalGerenteEmail: ticketData.sucursalGerenteEmail,
          cliente: ticketData.cliente,
          nroCliente: ticketData.nroCliente,
          direccion: ticketData.direccion,
          ciudad: ticketData.ciudad, // ✅ NUEVO
          telefono: ticketData.telefono,
          producto: ticketData.producto,
          falla: ticketData.falla,
          fechaCompra: ticketData.fechaCompra,
          fechaDisplay: ticketData.createdAtDisplay,
          fechaIso: ticketData.createdAtIso
        };

        // Armamos sujetos incluyendo nro de cliente si existe
        const nroCliTag = ticketData.nroCliente ? ` · Cliente N° ${ticketData.nroCliente}` : "";

        const subjectGerente = `Copia de ticket a SNP${nroCliTag}`;
        const subjectSnp = `Nuevo ticket SNP · ${ticketData.sucursal}${nroCliTag}`;

        // 1) Gerente
        if (ticketData.sucursalGerenteEmail) {
          addOverlayStep(`Enviando copia al gerente (${ticketData.sucursalGerenteEmail})…`);
          const htmlGerente = buildTicketEmailHtml(commonEmailData, "gerente");
          const rGerente = await sendEmailSnp({
            toName: ticketData.sucursalGerenteNombre,
            toEmail: ticketData.sucursalGerenteEmail,
            subject: subjectGerente,
            htmlBody: htmlGerente
          });
          if (rGerente.ok) {
            addOverlayStep("✔ Copia enviada al gerente.", "ok");
          } else {
            addOverlayStep("No se pudo enviar la copia al gerente.", "error");
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

        // Reseteamos formulario y dejamos solo 1 SKU limpio + reset ciudad
        form.reset();
        setSelectedCityInForm(null);

        const skuListEl = document.getElementById("sku-list");
        if (skuListEl) {
          skuListEl.innerHTML = "";
          const firstItem = createSkuItem(1);
          skuListEl.appendChild(firstItem);
          updateSkuLabelsAndIndices();
        }
      } catch (err) {
        console.error(err);
        addOverlayStep("Ocurrió un error general al procesar el ticket.", "error");
        showStatus(err?.message || "Ocurrió un error al enviar el ticket.", "error");
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
