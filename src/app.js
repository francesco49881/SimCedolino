import {
  calculatePayslip,
  calculateItemizedNet,
  calculateMarginalRates,
  getProfileRates,
  getExemptionLimit,
  round2,
} from './calc-engine.js';
import {
  DEFAULT_PROFILE,
  DEFAULT_COUNTRIES,
  MONTHS_IT,
} from './presets.js';

const STORAGE_COUNTRIES_KEY = 'sim_cedolino_countries_v1';
const STORAGE_PROFILE_KEY = 'sim_cedolino_profile_v1';
const STORAGE_BANNER_DISMISSED_KEY = 'sim_cedolino_banner_dismissed_v1';
const STORAGE_ONBOARDED_KEY = 'sim_cedolino_onboarded_v1';

// ── STATO APPLICAZIONE ──
let profile = loadProfile();
let countries = loadCountries();

const simState = {
  mese: new Date().getMonth() + 1,
  trasferte: [],
  oreViaggio: 0,
  straordFeriale: 0,
  straordFestivo: 0,
  oreSabatoTotali: 0,
  numSabati: 1,
  extraNetto: 0,
};

let tripIdCounter = 1;

// ── STORAGE HELPERS ──
function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILE_KEY);
    if (raw) {
      const merged = { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
      if (typeof merged.ccnl === 'string' && (merged.ccnl.includes('Liv.') || merged.ccnl.includes('Artigianato Metalmeccanico'))) {
        merged.ccnl = DEFAULT_PROFILE.ccnl;
      }
      return merged;
    }
  } catch {}
  return { ...DEFAULT_PROFILE };
}

function saveProfile() {
  localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
}

function loadCountries() {
  try {
    const raw = localStorage.getItem(STORAGE_COUNTRIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return DEFAULT_COUNTRIES.map((c) => ({ ...c }));
}

function saveCountries() {
  localStorage.setItem(STORAGE_COUNTRIES_KEY, JSON.stringify(countries));
}

// ── FORMATTING ──
const fmtEur = (n) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

const fmtEurInt = (n) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const fmtPct = (n) => `${(Number(n) || 0).toFixed(1).replace('.', ',')}%`;

// ── TABS ──
function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panels.forEach((p) => {
        p.classList.toggle('active', p.id === `tab-${target}`);
      });
    });
  });
}

// ── INIZIALIZZAZIONE SIMULATORE ──
function initSimControls() {
  const monthSelect = document.getElementById('sim-month');
  MONTHS_IT.forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx + 1);
    opt.textContent = name;
    monthSelect.appendChild(opt);
  });
  monthSelect.value = String(simState.mese);
  monthSelect.addEventListener('change', () => {
    simState.mese = Number(monthSelect.value);
    updateSimulation();
  });

  document.getElementById('btn-reset-sim').addEventListener('click', () => {
    simState.trasferte = [];
    simState.oreViaggio = 0;
    simState.straordFeriale = 0;
    simState.straordFestivo = 0;
    simState.oreSabatoTotali = 0;
    simState.numSabati = 1;
    simState.extraNetto = 0;
    syncHourInputsFromState();
    renderTrips();
    updateSimulation();
  });

  document.getElementById('btn-add-trip').addEventListener('click', () => {
    const firstCountry = countries[0] || {
      id: 'custom',
      name: 'Trasferta Estero',
      diaria: 0,
      tipo: 'estero',
      regime: 'full',
    };
    simState.trasferte.push({
      id: `trip-${tripIdCounter++}`,
      countryId: firstCountry.id,
      label: firstCountry.name,
      giorni: 1,
      diaria: firstCountry.diaria,
      tipo: firstCountry.tipo,
      regime: firstCountry.regime || 'full',
    });
    renderTrips();
    updateSimulation();
  });

  const bindHourInput = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      simState[key] = Math.max(0, Number(el.value) || 0);
      updateSimulation();
    });
  };
  bindHourInput('inp-viaggio', 'oreViaggio');
  bindHourInput('inp-str-fer', 'straordFeriale');
  bindHourInput('inp-str-fest', 'straordFestivo');
  bindHourInput('inp-sab-ore', 'oreSabatoTotali');

  const sabNumEl = document.getElementById('inp-sab-num');
  sabNumEl.addEventListener('input', () => {
    simState.numSabati = Math.max(1, Math.floor(Number(sabNumEl.value) || 1));
    updateSimulation();
  });

  const extraEl = document.getElementById('inp-extra-netto');
  extraEl.addEventListener('input', () => {
    simState.extraNetto = Number(extraEl.value) || 0;
    updateSimulation();
  });

  document.querySelectorAll('.step-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.target);
      const minVal = inp.min !== '' ? Number(inp.min) : 0;
      const delta = Number(btn.dataset.delta);
      const next = Math.max(minVal, round2((Number(inp.value) || 0) + delta));
      inp.value = String(next);
      inp.dispatchEvent(new Event('input'));
    });
  });
}

function syncHourInputsFromState() {
  document.getElementById('sim-month').value = String(simState.mese);
  document.getElementById('inp-viaggio').value = String(simState.oreViaggio);
  document.getElementById('inp-str-fer').value = String(simState.straordFeriale);
  document.getElementById('inp-str-fest').value = String(simState.straordFestivo);
  document.getElementById('inp-sab-ore').value = String(simState.oreSabatoTotali);
  document.getElementById('inp-sab-num').value = String(simState.numSabati);
  document.getElementById('inp-extra-netto').value = String(simState.extraNetto);
}

// ── RENDER TRASFERTE ──
function renderTrips() {
  const container = document.getElementById('trips-container');
  const empty = document.getElementById('trips-empty');
  container.innerHTML = '';

  if (simState.trasferte.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  simState.trasferte.forEach((trip) => {
    const row = document.createElement('div');
    row.className = 'trip-row';

    // Top: Select nazione + rimuovi
    const top = document.createElement('div');
    top.className = 'trip-row-top';

    const sel = document.createElement('select');
    sel.className = 'input-select';
    countries.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.diaria.toFixed(2).replace('.', ',')} €/gg · ${c.tipo === 'italia' ? 'Italia' : 'Estero'})`;
      sel.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Altra destinazione (manuale)';
    sel.appendChild(customOpt);
    sel.value = countries.some((c) => c.id === trip.countryId) ? trip.countryId : 'custom';

    sel.addEventListener('change', () => {
      trip.countryId = sel.value;
      const found = countries.find((c) => c.id === sel.value);
      if (found) {
        trip.label = found.name;
        trip.diaria = found.diaria;
        trip.tipo = found.tipo;
        trip.regime = found.regime || 'full';
        renderTrips();
      } else {
        trip.label = trip.tipo === 'italia' ? 'Trasferta Italia' : 'Trasferta Estero';
      }
      updateSimulation();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger-ghost';
    delBtn.title = 'Rimuovi trasferta';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => {
      simState.trasferte = simState.trasferte.filter((t) => t.id !== trip.id);
      renderTrips();
      updateSimulation();
    });

    top.append(sel, delBtn);

    // Fields: Giorni, Diaria, Tipo + Regime
    const fields = document.createElement('div');
    fields.className = 'trip-row-fields';

    const gGroup = document.createElement('div');
    gGroup.className = 'field-group';
    gGroup.innerHTML = `<label>Giorni</label>`;
    const gInp = document.createElement('input');
    gInp.type = 'number';
    gInp.min = '0';
    gInp.step = '1';
    gInp.className = 'input-field';
    gInp.value = String(trip.giorni);
    gInp.addEventListener('input', () => {
      trip.giorni = Math.max(0, Number(gInp.value) || 0);
      updateTripBadge(trip, badgeEl);
      updateSimulation();
    });
    gGroup.appendChild(gInp);

    const dGroup = document.createElement('div');
    dGroup.className = 'field-group';
    dGroup.innerHTML = `<label>Diaria (€/gg)</label>`;
    const dInp = document.createElement('input');
    dInp.type = 'number';
    dInp.min = '0';
    dInp.step = '0.5';
    dInp.className = 'input-field';
    dInp.value = String(trip.diaria);
    dInp.addEventListener('input', () => {
      trip.diaria = Math.max(0, Number(dInp.value) || 0);
      updateTripBadge(trip, badgeEl);
      updateSimulation();
    });
    dGroup.appendChild(dInp);

    const tGroup = document.createElement('div');
    tGroup.className = 'field-group';
    tGroup.innerHTML = `<label>Regime Fiscale</label>`;
    const tSel = document.createElement('select');
    tSel.className = 'input-select';
    tSel.innerHTML = `
      <option value="estero|full">Estero · esente 77,47 €</option>
      <option value="estero|rid1_3">Estero (-1/3) · 51,65 €</option>
      <option value="estero|rid2_3">Estero (-2/3) · 25,82 €</option>
      <option value="italia|full">Italia · esente 46,48 €</option>
      <option value="italia|rid1_3">Italia (-1/3) · 30,99 €</option>
      <option value="italia|rid2_3">Italia (-2/3) · 15,49 €</option>
    `;
    tSel.value = `${trip.tipo}|${trip.regime || 'full'}`;
    tSel.addEventListener('change', () => {
      const [tipo, regime] = tSel.value.split('|');
      trip.tipo = tipo;
      trip.regime = regime;
      updateTripBadge(trip, badgeEl);
      updateSimulation();
    });
    tGroup.appendChild(tSel);

    fields.append(gGroup, dGroup, tGroup);

    // Footer live badge
    const footer = document.createElement('div');
    footer.className = 'trip-row-footer';
    const badgeEl = document.createElement('span');
    updateTripBadge(trip, badgeEl);
    footer.appendChild(badgeEl);

    row.append(top, fields, footer);
    container.appendChild(row);
  });
}

function updateTripBadge(trip, el) {
  const limit = getExemptionLimit(trip.tipo, trip.regime);
  const lordo = round2(trip.giorni * trip.diaria);
  const imponibile = round2(trip.giorni * Math.max(0, trip.diaria - limit));
  if (imponibile === 0) {
    el.className = 'pill pill-emerald';
    el.textContent = `${fmtEur(lordo)} lordi → 100% esenti (netti in busta)`;
  } else {
    el.className = 'pill pill-amber';
    el.textContent = `${fmtEur(lordo)} lordi → ${fmtEur(lordo - imponibile)} esenti · ${fmtEur(imponibile)} tassati`;
  }
}

// ── AGGIORNAMENTO RISULTATI ──
function updateSimulation() {
  const rates = getProfileRates(profile);
  document.getElementById(
    'header-profile-summary'
  ).textContent = `Base fissa ${fmtEur(rates.baseLordo)}/mese · ${profile.ccnl}`;

  document.getElementById('rate-viaggio').textContent = `${rates.tariffe.oreViaggio.toFixed(2).replace('.', ',')} €/h`;
  document.getElementById('rate-str-fer').textContent = `${rates.tariffe.straordFeriale.toFixed(2).replace('.', ',')} €/h`;
  document.getElementById('rate-str-fest').textContent = `${rates.tariffe.straordFestivo.toFixed(2).replace('.', ',')} €/h`;
  document.getElementById('rate-str-sab').textContent = `${rates.tariffe.straordSabato.toFixed(2).replace('.', ',')} €/h (+50%)`;

  const res = calculatePayslip(simState, profile);
  const sabBadge = document.getElementById('sabato-split-badge');
  if (simState.oreSabatoTotali > 0) {
    const sabWord = res.sabatoSplit.numSabati === 1 ? 'sabato' : 'sabati';
    sabBadge.className = 'pill pill-blue';
    sabBadge.textContent = `${res.sabatoSplit.oreTotali} h su ${res.sabatoSplit.numSabati} ${sabWord} → ${res.sabatoSplit.ore25}h al +25% · ${res.sabatoSplit.ore50}h al +50%`;
  } else {
    sabBadge.className = 'pill pill-muted';
    sabBadge.textContent = '0 h · inserisci le ore del sabato';
  }

  const monthNote = document.getElementById('sim-month-tax-note');
  if (simState.mese === 1) {
    monthNote.textContent = 'Addizionali senza acconto (Gennaio)';
  } else if (simState.mese === 12) {
    monthNote.textContent = 'Nessuna rata addizionale (Dicembre)';
  } else {
    monthNote.textContent = 'Addizionali complete (Reg. + Com. + Acc.)';
  }

  const baseOnly = calculatePayslip({ mese: simState.mese }, profile);
  const itemized = calculateItemizedNet(simState, profile);
  const marginal = calculateMarginalRates(simState, profile);

  // Hero
  document.getElementById('res-netto-arrot').textContent = fmtEurInt(
    res.totali.nettoArrotondato
  );
  document.getElementById('res-netto-esatto').textContent = `(esatto ${fmtEur(
    res.totali.nettoEsatto
  )})`;

  const deltaBase = round2(res.totali.nettoEsatto - baseOnly.totali.nettoEsatto);
  const deltaSign = deltaBase >= 0 ? '+' : '';
  document.getElementById(
    'res-delta-base'
  ).textContent = `${deltaSign}${fmtEur(deltaBase)} vs mese base`;

  document.getElementById('res-lordo-tot').textContent = fmtEur(
    res.totali.totaleCompetenze
  );
  document.getElementById('res-esente-tot').textContent = fmtEur(
    res.competenze.trasfEsenteTot + Math.max(0, res.competenze.extraNetto)
  );
  document.getElementById('res-trattenute-tot').textContent = fmtEur(
    res.totali.totaleTrattenute
  );
  const resaPct =
    res.totali.totaleCompetenze > 0
      ? (res.totali.nettoEsatto / res.totali.totaleCompetenze) * 100
      : 0;
  document.getElementById('res-resa-pct').textContent = fmtPct(resaPct);

  // Barra composizione netto
  renderCompositionBar(itemized, res.totali.nettoEsatto);

  // Soglie fiscali
  const irpefBadge = document.getElementById('thr-irpef-badge');
  const irpefDesc = document.getElementById('thr-irpef-desc');
  irpefBadge.textContent = `${marginal.aliquotaIrpefCorrente}%`;
  irpefBadge.className =
    marginal.aliquotaIrpefCorrente >= 43 ? 'pill pill-rose' : 'pill pill-blue';
  if (marginal.distIrpef43 > 0) {
    irpefDesc.textContent = `Mancano ${fmtEur(marginal.distIrpef43)} di imponibile fiscale allo scaglione 43%.`;
  } else {
    irpefDesc.textContent = `Superata la soglia 4.166,67 € di ${fmtEur(Math.abs(marginal.distIrpef43))}: la quota eccedente è tassata al 43%.`;
  }

  const ivsBadge = document.getElementById('thr-ivs-badge');
  const ivsDesc = document.getElementById('thr-ivs-desc');
  if (marginal.ivs1Attivo) {
    ivsBadge.textContent = 'Attivo (+1%)';
    ivsBadge.className = 'pill pill-amber';
    ivsDesc.textContent = `Imponibile INPS oltre 4.685 € di ${fmtEur(Math.abs(marginal.distIvs1))} (trattenuta extra: ${fmtEur(res.contributi.ivs1)}).`;
  } else {
    ivsBadge.textContent = 'Non attivo';
    ivsBadge.className = 'pill pill-muted';
    ivsDesc.textContent = `Mancano ${fmtEur(marginal.distIvs1)} di imponibile INPS prima che scatti l'1% aggiuntivo.`;
  }

  // Tabella netto per singola voce
  renderItemizedTable(itemized, res);

  // Valore marginale
  renderMarginalGrid(marginal);

  // Cedolino completo
  renderFullPayslip(res);
}

function renderCompositionBar(itemized, totalNet) {
  const colors = {
    base: '#3b82f6',
    trasferta: '#10b981',
    viaggio: '#06b6d4',
    straordinario: '#f59e0b',
    extra: '#8b5cf6',
  };
  const labels = {
    base: 'Stipendio base',
    trasferta: 'Trasferte',
    viaggio: 'Ore viaggio',
    straordinario: 'Straordinari',
    extra: 'Extra netti',
  };

  const grouped = {};
  itemized.forEach((item) => {
    if (item.deltaNetto > 0) {
      grouped[item.category] = (grouped[item.category] || 0) + item.deltaNetto;
    }
  });

  const bar = document.getElementById('composition-bar');
  const legend = document.getElementById('composition-legend');
  bar.innerHTML = '';
  legend.innerHTML = '';

  if (totalNet <= 0) return;

  Object.entries(grouped).forEach(([cat, val]) => {
    const pct = (val / totalNet) * 100;
    const seg = document.createElement('div');
    seg.className = 'comp-seg';
    seg.style.width = `${pct.toFixed(2)}%`;
    seg.style.backgroundColor = colors[cat] || '#64748b';
    seg.title = `${labels[cat] || cat}: ${fmtEur(val)} (${pct.toFixed(1)}%)`;
    bar.appendChild(seg);

    const leg = document.createElement('span');
    leg.className = 'legend-item';
    leg.innerHTML = `<span class="legend-dot" style="background:${colors[cat] || '#64748b'}"></span>${labels[cat] || cat}: <strong>${fmtEur(val)}</strong>`;
    legend.appendChild(leg);
  });
}

function renderItemizedTable(itemized, res) {
  const tbody = document.getElementById('itemized-tbody');
  const tfoot = document.getElementById('itemized-tfoot');
  tbody.innerHTML = '';

  itemized.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="item-title">${item.label}</div>
        <div class="item-detail">${item.detail}</div>
      </td>
      <td class="num">${fmtEur(item.lordo)}</td>
      <td class="num">${item.esente > 0 ? `<span class="pill pill-emerald">${fmtEur(item.esente)}</span>` : '—'}</td>
      <td class="num">${fmtEur(item.trattenute)}</td>
      <td class="num net-strong">${fmtEur(item.deltaNetto)}</td>
      <td class="num">${fmtPct(item.percentualeNetta)}</td>
    `;
    tbody.appendChild(tr);
  });

  const resaTot =
    res.totali.totaleCompetenze > 0
      ? (res.totali.nettoEsatto / res.totali.totaleCompetenze) * 100
      : 0;
  tfoot.innerHTML = `
    <tr>
      <td>Totale Cedolino</td>
      <td class="num">${fmtEur(res.totali.totaleCompetenze)}</td>
      <td class="num">${fmtEur(res.competenze.trasfEsenteTot + Math.max(0, res.competenze.extraNetto))}</td>
      <td class="num">${fmtEur(res.totali.totaleTrattenute)}</td>
      <td class="num net-strong">${fmtEur(res.totali.nettoEsatto)}</td>
      <td class="num">${fmtPct(resaTot)}</td>
    </tr>
  `;
}

function renderMarginalGrid(m) {
  const grid = document.getElementById('marginal-grid');
  const cards = [
    { label: '+1h Viaggio (85%)', val: fmtEur(m.perOra.oreViaggio) },
    { label: '+1h Straord. Feriale (+25%)', val: fmtEur(m.perOra.straordFeriale) },
    { label: '+1h Straord. Festivo (+45%)', val: fmtEur(m.perOra.straordFestivo) },
    { label: '+1h Straord. Sabato (+50%)', val: fmtEur(m.perOra.straordSabato) },
    { label: '+1 gg Estero (≤ 77,47 €)', val: '100% esente' },
    { label: '+1 gg Estero (90 €/gg)', val: fmtEur(m.trasferta.estero90) },
  ];
  grid.innerHTML = cards
    .map(
      (c) => `
      <div class="marginal-pill">
        <span>${c.label}</span>
        <strong>${c.val}</strong>
      </div>
    `
    )
    .join('');
}

function renderFullPayslip(res) {
  const container = document.getElementById('full-payslip-breakdown');
  const compLines = [
    ['Retribuzione ordinaria fissa', fmtEur(res.baseLordo)],
    ['Indennità trasferte (totale)', fmtEur(res.competenze.trasfLordoTot)],
    ['  di cui quota esente TUIR', fmtEur(res.competenze.trasfEsenteTot)],
    ['  di cui quota imponibile', fmtEur(res.competenze.trasfImponibileTot)],
    ['Ore viaggio (85%)', fmtEur(res.competenze.lordoViaggio)],
    ['Straordinario feriale (+25%)', fmtEur(res.competenze.lordoStrFer)],
    ['Straordinario festivo (+45%)', fmtEur(res.competenze.lordoStrFest)],
    ['Straordinario sabato (+50%)', fmtEur(res.competenze.lordoStrSab)],
  ];
  if (res.irpef.bonusEsenteCuneo > 0) {
    compLines.push(['Bonus esente Cuneo Fiscale 2026', fmtEur(res.irpef.bonusEsenteCuneo)]);
  }
  if (res.competenze.extraNetto !== 0) {
    compLines.push(['Voci nette extra / 730', fmtEur(res.competenze.extraNetto)]);
  }

  const ritLines = [
    [`Imponibile previdenziale INPS`, fmtEur(res.imponibili.imponibilePrevidenziale)],
    ['INPS IVS dipendente (9,19%)', fmtEur(res.contributi.inps)],
    ['Contributo agg. IVS 1% (> 4.685 €)', fmtEur(res.contributi.ivs1)],
    ['FSBA dipendente (0,15%)', fmtEur(res.contributi.fsba)],
    ['EBAV quote dipendente', fmtEur(res.contributi.ebav)],
    ['Imponibile fiscale', fmtEur(res.imponibili.imponibileFiscale)],
    ['IRPEF scaglione 23%', fmtEur(res.irpef.scaglione1)],
    ['IRPEF scaglione 33%', fmtEur(res.irpef.scaglione2)],
    ['IRPEF scaglione 43%', fmtEur(res.irpef.scaglione3)],
    ['Detrazioni lav. dipendente', res.irpef.detrazioniBase > 0 ? `-${fmtEur(res.irpef.detrazioniBase)}` : fmtEur(0)],
    ['Ulteriore detraz. Cuneo 2026', res.irpef.ulterioreDetrazioneCuneo > 0 ? `-${fmtEur(res.irpef.ulterioreDetrazioneCuneo)}` : fmtEur(0)],
    ['Addizionale Regionale', fmtEur(res.addizionali.addReg)],
    ['Addizionale Comunale', fmtEur(res.addizionali.addCom)],
    ['Acconto Addizionale Comunale', fmtEur(res.addizionali.accCom)],
  ];

  const renderCol = (title, lines, totLabel, totVal) => `
    <div class="breakdown-col">
      <h3>${title}</h3>
      ${lines
        .map(
          ([k, v]) =>
            `<div class="breakdown-line"><span>${k}</span><span>${v}</span></div>`
        )
        .join('')}
      <div class="breakdown-line total"><span>${totLabel}</span><span>${totVal}</span></div>
    </div>
  `;

  container.innerHTML =
    renderCol('Competenze', compLines, 'Totale Competenze', fmtEur(res.totali.totaleCompetenze)) +
    renderCol('Imponibili & Trattenute', ritLines, 'Totale Trattenute', fmtEur(res.totali.totaleTrattenute));
}

// ── BANNER & ONBOARDING INIZIALE ──
function initExampleBanner() {
  const banner = document.getElementById('example-banner');
  if (!banner) return;
  const isEmpty = getProfileRates(profile).baseLordo === 0;
  const dismissed = Boolean(localStorage.getItem(STORAGE_BANNER_DISMISSED_KEY));
  banner.style.display = isEmpty && !dismissed ? 'flex' : 'none';

  document.getElementById('btn-go-settings').addEventListener('click', () => {
    document.querySelector('.tab-btn[data-tab="settings"]').click();
  });
  document.getElementById('btn-dismiss-banner').addEventListener('click', () => {
    localStorage.setItem(STORAGE_BANNER_DISMISSED_KEY, '1');
    banner.style.display = 'none';
  });
}

function initInitialRouteAndOnboarding() {
  const card = document.getElementById('onboarding-card');
  const isEmpty = getProfileRates(profile).baseLordo === 0;
  const onboarded = Boolean(localStorage.getItem(STORAGE_ONBOARDED_KEY));

  if (isEmpty && !onboarded) {
    if (card) card.style.display = 'block';
    document.querySelector('.tab-btn[data-tab="settings"]')?.click();
  } else if (card) {
    card.style.display = 'none';
  }

  document.getElementById('btn-finish-onboarding')?.addEventListener('click', () => {
    localStorage.setItem(STORAGE_ONBOARDED_KEY, '1');
    if (card) card.style.display = 'none';
    document.querySelector('.tab-btn[data-tab="sim"]')?.click();
  });

  document.getElementById('btn-dismiss-onboarding')?.addEventListener('click', () => {
    localStorage.setItem(STORAGE_ONBOARDED_KEY, '1');
    if (card) card.style.display = 'none';
  });
}

function showConfigStatus(msg, isError = false) {
  const el = document.getElementById('config-status-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--rose)' : 'var(--emerald)';
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 4500);
}

// ── TAB 2: NAZIONI & PROFILO ──
function initSettingsTab() {
  document.getElementById('btn-export-config').addEventListener('click', () => {
    const payload = JSON.stringify({ profile, countries }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config_simulatore_cedolino.json';
    a.click();
    URL.revokeObjectURL(url);
    showConfigStatus('Configurazione esportata in config_simulatore_cedolino.json');
  });

  const importInp = document.getElementById('inp-import-config');
  importInp.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('Formato non valido');
      if (parsed.profile && typeof parsed.profile === 'object') {
        profile = { ...DEFAULT_PROFILE, ...parsed.profile };
        saveProfile();
      }
      if (Array.isArray(parsed.countries) && parsed.countries.length > 0) {
        countries = parsed.countries;
        saveCountries();
      }
      renderCountriesList();
      renderProfileForm();
      syncCalibrationFromProfile();
      renderTrips();
      updateSimulation();
      const banner = document.getElementById('example-banner');
      if (banner) banner.style.display = 'none';
      showConfigStatus(`Configurazione importata da ${file.name}`);
    } catch {
      showConfigStatus('Errore: file JSON non valido.', true);
    } finally {
      importInp.value = '';
    }
  });
  const formCountry = document.getElementById('form-add-country');
  formCountry.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameEl = document.getElementById('new-country-name');
    const diariaEl = document.getElementById('new-country-diaria');
    const tipoEl = document.getElementById('new-country-tipo');
    const name = nameEl.value.trim();
    const diaria = Number(diariaEl.value);
    if (!name || Number.isNaN(diaria) || diaria < 0) return;

    countries.push({
      id: `c-${Date.now()}`,
      name,
      diaria: round2(diaria),
      tipo: tipoEl.value,
      regime: 'full',
    });
    saveCountries();
    nameEl.value = '';
    diariaEl.value = '';
    renderCountriesList();
    renderTrips();
  });

  document.getElementById('btn-reset-profile').addEventListener('click', () => {
    profile = { ...DEFAULT_PROFILE };
    countries = [];
    saveProfile();
    saveCountries();
    renderCountriesList();
    renderProfileForm();
    syncCalibrationFromProfile();
    renderTrips();
    updateSimulation();
    initExampleBanner();
    showConfigStatus('Tutti i dati sono stati azzerati.');
  });

  renderCountriesList();
  renderProfileForm();
}

function renderCountriesList() {
  const list = document.getElementById('countries-list');
  const empty = document.getElementById('countries-empty');
  list.innerHTML = '';
  if (empty) empty.style.display = countries.length === 0 ? 'block' : 'none';
  countries.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'country-item';

    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.className = 'input-field';
    nameInp.value = c.name;
    nameInp.addEventListener('input', () => {
      c.name = nameInp.value;
      saveCountries();
      renderTrips();
    });

    const diariaInp = document.createElement('input');
    diariaInp.type = 'number';
    diariaInp.step = '0.01';
    diariaInp.min = '0';
    diariaInp.className = 'input-field';
    diariaInp.value = String(c.diaria);
    diariaInp.addEventListener('input', () => {
      c.diaria = Math.max(0, Number(diariaInp.value) || 0);
      saveCountries();
      renderTrips();
    });

    const tipoSel = document.createElement('select');
    tipoSel.className = 'input-select';
    tipoSel.innerHTML = `
      <option value="estero">Estero (77,47 €)</option>
      <option value="italia">Italia (46,48 €)</option>
    `;
    tipoSel.value = c.tipo;
    tipoSel.addEventListener('change', () => {
      c.tipo = tipoSel.value;
      saveCountries();
      renderTrips();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger-ghost';
    delBtn.textContent = '×';
    delBtn.title = 'Elimina nazione';
    delBtn.addEventListener('click', () => {
      countries = countries.filter((x) => x.id !== c.id);
      saveCountries();
      renderCountriesList();
      renderTrips();
    });

    item.append(nameInp, diariaInp, tipoSel, delBtn);
    list.appendChild(item);
  });
}

function renderProfileForm() {
  const form = document.getElementById('form-profile');
  const fields = [
    ['pagaBase', 'Paga Base (€)'],
    ['scatti', 'Scatti Anzianità (€)'],
    ['superminimo', 'Superminimo Assorbibile (€)'],
    ['erv', 'E.R.V. (€)'],
    ['divisoreOrario', 'Divisore Orario'],
    ['addRegionale', 'Addizionale Regionale (€/mese)'],
    ['addComunaleSaldo', 'Addizionale Comunale (€/mese)'],
    ['addComunaleAcconto', 'Acconto Comunale (€/mese)'],
    ['ebavFisso', 'EBAV Dipendente (€/mese)'],
    ['redditoAnnuoStimato', 'Reddito annuo stimato (€, 0 = auto 13×base)'],
  ];

  form.innerHTML = '';
  fields.forEach(([key, label]) => {
    const wrap = document.createElement('div');
    wrap.className = 'field-group';
    wrap.innerHTML = `<label>${label}</label>`;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = '0.01';
    inp.className = 'input-field';
    inp.value = String(profile[key]);
    inp.addEventListener('input', () => {
      profile[key] = Number(inp.value) || 0;
      saveProfile();
      updateSimulation();
    });
    wrap.appendChild(inp);
    form.appendChild(wrap);
  });
}

// ── CARICAMENTO OPZIONALE CONFIG LOCALE (solo su HTTP, mai su file://) ──
async function tryLoadLocalConfig() {
  if (location.protocol === 'file:') return;
  if (localStorage.getItem(STORAGE_PROFILE_KEY)) return;
  try {
    const resp = await fetch('./config.local.json', { cache: 'no-store' });
    if (!resp.ok) return;
    const parsed = await resp.json();
    if (parsed.profile) {
      profile = { ...DEFAULT_PROFILE, ...parsed.profile };
      saveProfile();
    }
    if (Array.isArray(parsed.countries) && parsed.countries.length > 0) {
      countries = parsed.countries;
      saveCountries();
    }
    renderCountriesList();
    renderProfileForm();
    syncCalibrationFromProfile();
    renderTrips();
    updateSimulation();
    const banner = document.getElementById('example-banner');
    if (banner) banner.style.display = 'none';
    const card = document.getElementById('onboarding-card');
    if (card) card.style.display = 'none';
    document.querySelector('.tab-btn[data-tab="sim"]')?.click();
  } catch {}
}

// ── STAMPA PDF & ESPORTAZIONE JPG ──
function initExportButtons() {
  const printBtn = document.getElementById('btn-print-payslip');
  const jpgBtn = document.getElementById('btn-save-jpg');
  if (!printBtn || !jpgBtn) return;

  printBtn.addEventListener('click', () => {
    const printHeader = document.getElementById('print-header');
    const monthName = MONTHS_IT[simState.mese - 1] || '';
    const today = new Date().toLocaleDateString('it-IT');
    if (printHeader) {
      printHeader.textContent = `Simulazione Cedolino · ${monthName} ${new Date().getFullYear()} — Calcolo teorico generato il ${today}`;
    }
    const details = document.querySelector('.details-payslip');
    const wasOpen = details ? details.open : false;
    if (details) details.open = true;

    const cleanup = () => {
      if (details && !wasOpen) details.open = false;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  });

  jpgBtn.addEventListener('click', () => {
    exportPayslipAsJpg();
  });
}

function exportPayslipAsJpg() {
  const res = calculatePayslip(simState, profile);
  const itemized = calculateItemizedNet(simState, profile);
  const monthName = MONTHS_IT[simState.mese - 1] || 'Mese';
  const year = new Date().getFullYear();
  const today = new Date().toLocaleDateString('it-IT');

  const width = 1000;
  const scale = 2;
  const rowH = 38;
  const headerH = 210;
  const tableHeaderH = 68;
  const tableRowsH = (itemized.length + 1) * rowH;
  const summaryH = 250;
  const footerH = 54;
  const height = headerH + tableHeaderH + tableRowsH + summaryH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Sfondo bianco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Testata scura
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, headerH);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 13px system-ui, -apple-system, sans-serif';
  ctx.fillText(`SIMULAZIONE CEDOLINO · ${monthName.toUpperCase()} ${year}`, 40, 42);

  ctx.textAlign = 'right';
  ctx.fillText(`Generato il ${today}`, width - 40, 42);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#34d399';
  ctx.font = '800 44px system-ui, -apple-system, sans-serif';
  ctx.fillText(fmtEurInt(res.totali.nettoArrotondato), 40, 98);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 15px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Netto esatto: ${fmtEur(res.totali.nettoEsatto)}`, 40, 126);

  // Strip KPI in testata
  const resaPct =
    res.totali.totaleCompetenze > 0
      ? (res.totali.nettoEsatto / res.totali.totaleCompetenze) * 100
      : 0;
  const kpis = [
    ['COMPETENZE LORDE', fmtEur(res.totali.totaleCompetenze), '#f8fafc'],
    ['QUOTA ESENTE', fmtEur(res.competenze.trasfEsenteTot + Math.max(0, res.competenze.extraNetto)), '#34d399'],
    ['TRATTENUTE TOTALI', fmtEur(res.totali.totaleTrattenute), '#fb7185'],
    ['RESA NETTA', fmtPct(resaPct), '#f8fafc'],
  ];
  kpis.forEach(([lbl, val, col], idx) => {
    const x = 40 + idx * 235;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.fillText(lbl, x, 166);
    ctx.fillStyle = col;
    ctx.font = '700 17px system-ui, -apple-system, sans-serif';
    ctx.fillText(val, x, 190);
  });

  // Sezione 1: Tabella netto per singola voce
  let y = headerH + 34;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 17px system-ui, -apple-system, sans-serif';
  ctx.fillText('Netto di ogni singola voce', 40, y);

  y += 24;
  const cols = [40, 500, 620, 745, 875, 960];
  ctx.fillStyle = '#64748b';
  ctx.font = '700 11px system-ui, -apple-system, sans-serif';
  ctx.fillText('VOCE', cols[0], y);
  ctx.textAlign = 'right';
  ctx.fillText('LORDO', cols[1], y);
  ctx.fillText('ESENTE', cols[2], y);
  ctx.fillText('TRATT.', cols[3], y);
  ctx.fillText('NETTO €', cols[4], y);
  ctx.fillText('% NETTA', cols[5], y);
  ctx.textAlign = 'left';

  y += 10;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, y);
  ctx.lineTo(width - 40, y);
  ctx.stroke();

  itemized.forEach((item) => {
    y += rowH;
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    const title = item.detail ? `${item.label} (${item.detail})` : item.label;
    ctx.fillText(title.slice(0, 52), cols[0], y - 12);

    ctx.textAlign = 'right';
    ctx.font = '500 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(fmtEur(item.lordo), cols[1], y - 12);
    ctx.fillStyle = item.esente > 0 ? '#059669' : '#64748b';
    ctx.fillText(item.esente > 0 ? fmtEur(item.esente) : '—', cols[2], y - 12);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(fmtEur(item.trattenute), cols[3], y - 12);
    ctx.fillStyle = '#059669';
    ctx.font = '700 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(fmtEur(item.deltaNetto), cols[4], y - 12);
    ctx.fillStyle = '#0f172a';
    ctx.font = '500 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(fmtPct(item.percentualeNetta), cols[5], y - 12);
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(width - 40, y);
    ctx.stroke();
  });

  // Riga Totale
  y += rowH;
  ctx.strokeStyle = '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(40, y - rowH + 2);
  ctx.lineTo(width - 40, y - rowH + 2);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('Totale Cedolino', cols[0], y - 12);
  ctx.textAlign = 'right';
  ctx.fillText(fmtEur(res.totali.totaleCompetenze), cols[1], y - 12);
  ctx.fillText(fmtEur(res.competenze.trasfEsenteTot + Math.max(0, res.competenze.extraNetto)), cols[2], y - 12);
  ctx.fillText(fmtEur(res.totali.totaleTrattenute), cols[3], y - 12);
  ctx.fillStyle = '#059669';
  ctx.fillText(fmtEur(res.totali.nettoEsatto), cols[4], y - 12);
  ctx.fillStyle = '#0f172a';
  ctx.fillText(fmtPct(resaPct), cols[5], y - 12);
  ctx.textAlign = 'left';

  // Sezione 2: Riepilogo Imponibili e Trattenute
  y += 34;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(40, y, width - 80, 195);
  ctx.strokeStyle = '#e2e8f0';
  ctx.strokeRect(40, y, width - 80, 195);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('Riepilogo Imponibili e Trattenute', 60, y + 28);

  const leftSummary = [
    ['Imponibile Previdenziale INPS', fmtEur(res.imponibili.imponibilePrevidenziale)],
    ['INPS IVS (9,19%)', fmtEur(res.contributi.inps)],
    ['Contributo agg. IVS 1% (> 4.685 €)', fmtEur(res.contributi.ivs1)],
    ['FSBA (0,15%) + EBAV', fmtEur(round2(res.contributi.fsba + res.contributi.ebav))],
    ['Imponibile Fiscale', fmtEur(res.imponibili.imponibileFiscale)],
  ];
  const rightSummary = [
    ['IRPEF Lorda (23% / 33% / 43%)', fmtEur(res.irpef.irpefLorda)],
    ['Detrazioni lav. dip. + Cuneo 2026', res.irpef.detrazioni > 0 ? `-${fmtEur(res.irpef.detrazioni)}` : fmtEur(0)],
    ['IRPEF Netta', fmtEur(res.irpef.irpefNetta)],
    ['Addizionali Locali (Reg. + Com.)', fmtEur(res.addizionali.totaleAddizionali)],
    ['Totale Trattenute', fmtEur(res.totali.totaleTrattenute)],
  ];

  const drawCol = (items, startX, colW) => {
    items.forEach(([k, v], i) => {
      const ly = y + 58 + i * 28;
      ctx.fillStyle = '#475569';
      ctx.font = '500 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(k, startX, ly);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(v, startX + colW, ly);
      ctx.textAlign = 'left';
    });
  };
  drawCol(leftSummary, 60, 405);
  drawCol(rightSummary, 535, 405);

  // Footer
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('Calcolo teorico generato con Simulatore Cedolino · CCNL Metalmeccanico Artigianato', 40, height - 20);

  const link = document.createElement('a');
  link.download = `Cedolino_Teorico_${monthName}_${year}.jpg`;
  link.href = canvas.toDataURL('image/jpeg', 0.94);
  link.click();
}

// ── CALIBRAZIONE RAPIDA DA BUSTA PAGA (100% OFFLINE) ──
function getCalibrationTempProfile() {
  const num = (id) => Math.max(0, Number(document.getElementById(id)?.value) || 0);
  return {
    ...profile,
    pagaBase: num('cal-paga-base'),
    scatti: num('cal-scatti'),
    superminimo: num('cal-superminimo'),
    erv: num('cal-erv'),
    addRegionale: num('cal-add-reg'),
    addComunaleSaldo: num('cal-add-com'),
    addComunaleAcconto: num('cal-acc-com'),
    ebavFisso: num('cal-ebav'),
    redditoAnnuoStimato: num('cal-reddito-annuo'),
  };
}

function syncCalibrationFromProfile() {
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = String(v ?? 0);
  };
  setVal('cal-paga-base', profile.pagaBase);
  setVal('cal-scatti', profile.scatti);
  setVal('cal-superminimo', profile.superminimo);
  setVal('cal-erv', profile.erv);
  const tot = round2(
    Number(profile.pagaBase) +
      Number(profile.scatti) +
      Number(profile.superminimo) +
      Number(profile.erv)
  );
  setVal('cal-retrib-tot', tot);
  setVal('cal-add-reg', profile.addRegionale);
  setVal('cal-add-com', profile.addComunaleSaldo);
  setVal('cal-acc-com', profile.addComunaleAcconto);
  setVal('cal-ebav', profile.ebavFisso);
  setVal('cal-reddito-annuo', profile.redditoAnnuoStimato);
  updateCalibrationPreview();
}

function updateCalibrationPreview() {
  const box = document.getElementById('cal-check-result');
  if (!box) return;
  const tempProfile = getCalibrationTempProfile();
  const mese = Number(document.getElementById('cal-mese')?.value) || 4;
  const calc = calculatePayslip({ mese }, tempProfile);
  const nettoRealeRaw = document.getElementById('cal-netto-reale')?.value;
  const nettoReale = nettoRealeRaw !== '' && nettoRealeRaw !== undefined ? Number(nettoRealeRaw) : null;

  if (calc.baseLordo <= 0) {
    box.innerHTML = `<span class="pill pill-muted">Inserisci la retribuzione per vedere il netto calcolato</span>`;
    return;
  }

  let html = `<div>Netto base calcolato: <strong>${fmtEurInt(calc.totali.nettoArrotondato)}</strong> <span class="card-sub">(esatto ${fmtEur(calc.totali.nettoEsatto)})</span></div>`;
  if (nettoReale !== null && !Number.isNaN(nettoReale) && nettoReale > 0) {
    const diff = round2(calc.totali.nettoArrotondato - nettoReale);
    if (Math.abs(diff) <= 5) {
      html += `<span class="pill pill-emerald">✓ Profilo calibrato! (scarto ${fmtEur(diff)})</span>`;
    } else {
      html += `<span class="pill pill-amber">Scarto di ${fmtEur(diff)}: verifica addizionali, EBAV o se nel mese c'erano straordinari/trasferte</span>`;
    }
  }
  box.innerHTML = html;
}

function initCalibrationWizard() {
  const meseSel = document.getElementById('cal-mese');
  if (meseSel) {
    MONTHS_IT.forEach((name, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx + 1);
      opt.textContent = name;
      meseSel.appendChild(opt);
    });
    meseSel.value = '4';
    meseSel.addEventListener('change', updateCalibrationPreview);
  }

  const partIds = ['cal-paga-base', 'cal-scatti', 'cal-superminimo', 'cal-erv'];
  partIds.forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      const sum = round2(
        partIds.reduce((acc, pid) => acc + Math.max(0, Number(document.getElementById(pid)?.value) || 0), 0)
      );
      const totEl = document.getElementById('cal-retrib-tot');
      if (totEl) totEl.value = String(sum);
      updateCalibrationPreview();
    });
  });

  document.getElementById('cal-retrib-tot')?.addEventListener('input', (e) => {
    const tot = Math.max(0, Number(e.target.value) || 0);
    document.getElementById('cal-paga-base').value = String(tot);
    document.getElementById('cal-scatti').value = '0';
    document.getElementById('cal-superminimo').value = '0';
    document.getElementById('cal-erv').value = '0';
    updateCalibrationPreview();
  });

  ['cal-add-reg', 'cal-add-com', 'cal-acc-com', 'cal-ebav', 'cal-reddito-annuo', 'cal-netto-reale'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateCalibrationPreview);
  });

  document.getElementById('btn-ebav-std')?.addEventListener('click', () => {
    const ebavEl = document.getElementById('cal-ebav');
    if (ebavEl) ebavEl.value = '3.85';
    updateCalibrationPreview();
  });

  document.getElementById('btn-apply-calibration')?.addEventListener('click', () => {
    profile = getCalibrationTempProfile();
    saveProfile();
    localStorage.setItem(STORAGE_ONBOARDED_KEY, '1');
    renderProfileForm();
    updateSimulation();
    initExampleBanner();
    const card = document.getElementById('onboarding-card');
    if (card) card.style.display = 'none';
    showConfigStatus('Parametri retributivi applicati e salvati.');
    document.querySelector('.tab-btn[data-tab="sim"]')?.click();
  });

  syncCalibrationFromProfile();
}

// ── BOOTSTRAP ──
initTabs();
initSimControls();
renderTrips();
initSettingsTab();
initCalibrationWizard();
initExampleBanner();
initInitialRouteAndOnboarding();
initExportButtons();
updateSimulation();
tryLoadLocalConfig();
