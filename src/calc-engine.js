/**
 * Motore di calcolo fiscale e contributivo 2026 per cedolino mensile
 * (CCNL Metalmeccanico Artigianato - IRPEF e detrazioni art. 13 TUIR).
 * Modulo ES puro, privo di dipendenze DOM.
 */

export const EXEMPTION_LIMITS = {
  estero: {
    full: 77.47,
    rid1_3: 51.65,
    rid2_3: 25.82,
  },
  italia: {
    full: 46.48,
    rid1_3: 30.99,
    rid2_3: 15.49,
  },
};

export const HOURLY_MULTIPLIERS = {
  oreViaggio: 0.85,
  straordFeriale: 1.25,
  straordFestivo: 1.45,
  straordSabato: 1.50,
};

export const IRPEF_MONTHLY_BRACKETS = {
  b1: 28000 / 12, // 2333.3333...
  b2: 50000 / 12, // 4166.6666...
  r1: 0.23,
  r2: 0.33,
  r3: 0.43,
};

/**
 * Arrotonda un numero a 2 decimali (centesimi di euro).
 * @param {number} n
 * @returns {number}
 */
export function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Restituisce la franchigia giornaliera esente TUIR (art. 51 comma 5).
 * @param {'estero'|'italia'} tipo
 * @param {'full'|'rid1_3'|'rid2_3'} regime
 * @returns {number}
 */
export function getExemptionLimit(tipo = 'estero', regime = 'full') {
  const byType = EXEMPTION_LIMITS[tipo] || EXEMPTION_LIMITS.estero;
  return byType[regime] ?? byType.full;
}

/**
 * Ripartisce le ore lavorate di sabato secondo il CCNL Metalmeccanico Artigianato:
 * prime 3 ore per ciascun sabato al +25%, dalla 4ª ora in poi al +50%.
 * @param {number} oreSabatoTotali
 * @param {number} numSabati
 */
export function splitSaturdayHours(oreSabatoTotali = 0, numSabati = 1) {
  const ore = Math.max(0, Number(oreSabatoTotali) || 0);
  if (ore <= 0) {
    return { oreTotali: 0, numSabati: Math.max(1, Math.floor(Number(numSabati) || 1)), ore25: 0, ore50: 0 };
  }
  const n = Math.max(1, Math.floor(Number(numSabati) || 1));
  const ore25 = round2(Math.min(ore, n * 3));
  const ore50 = round2(Math.max(0, ore - ore25));
  return { oreTotali: ore, numSabati: n, ore25, ore50 };
}

/**
 * Calcola la detrazione mensile per lavoro dipendente (art. 13 TUIR)
 * in base al reddito annuo stimato. Oltre 50.000 € è 0 €.
 * @param {number} annualIncome
 * @returns {number}
 */
export function calculateMonthlyEmployeeDeduction(annualIncome) {
  const r = Math.max(0, Number(annualIncome) || 0);
  if (r === 0 || r > 50000) return 0;
  let annua = 0;
  if (r <= 15000) {
    annua = 1955;
  } else if (r <= 28000) {
    annua = 1910 + 1190 * ((28000 - r) / 13000);
  } else {
    annua = 1910 * ((50000 - r) / 22000);
  }
  return round2(annua / 12);
}

/**
 * Calcola il taglio del cuneo fiscale 2026 (L. 207/2024 art. 1 c. 4-6):
 * - Reddito complessivo <= 20.000 €: somma integrativa esente (7,1% / 5,3% / 4,8% su imponibile fiscale)
 * - Reddito complessivo 20.001..32.000 €: ulteriore detrazione IRPEF di 1.000 €/anno (83,33 €/mese)
 * - Reddito complessivo 32.001..40.000 €: ulteriore detrazione decrescente 1.000 * (40.000 - R) / 8.000
 * - Oltre 40.000 €: 0 €
 * @param {number} annualIncome
 * @param {number} monthlyTaxableIncome
 * @returns {{ bonusEsente: number, ulterioreDetrazione: number }}
 */
export function calculateMonthlyTaxWedge2026(annualIncome, monthlyTaxableIncome = 0) {
  const r = Math.max(0, Number(annualIncome) || 0);
  if (r === 0 || r > 40000) {
    return { bonusEsente: 0, ulterioreDetrazione: 0 };
  }
  if (r <= 20000) {
    const rate = r <= 8500 ? 0.071 : r <= 15000 ? 0.053 : 0.048;
    return {
      bonusEsente: round2(Math.max(0, Number(monthlyTaxableIncome) || 0) * rate),
      ulterioreDetrazione: 0,
    };
  }
  const annua = r <= 32000 ? 1000 : 1000 * ((40000 - r) / 8000);
  return {
    bonusEsente: 0,
    ulterioreDetrazione: round2(annua / 12),
  };
}

/**
 * Calcola la retribuzione fissa mensile e le tariffe orarie dal profilo.
 * @param {object} profile
 */
export function getProfileRates(profile) {
  const baseLordo = round2(
    Number(profile.pagaBase) +
      Number(profile.scatti) +
      Number(profile.superminimo) +
      Number(profile.erv)
  );
  const divisoreOrario = Number(profile.divisoreOrario) || 173;
  const tariffaOraria = baseLordo / divisoreOrario;
  return {
    baseLordo,
    tariffaOraria,
    tariffe: {
      oreViaggio: tariffaOraria * HOURLY_MULTIPLIERS.oreViaggio,
      straordFeriale: tariffaOraria * HOURLY_MULTIPLIERS.straordFeriale,
      straordFestivo: tariffaOraria * HOURLY_MULTIPLIERS.straordFestivo,
      straordSabato: tariffaOraria * HOURLY_MULTIPLIERS.straordSabato,
    },
  };
}

/**
 * Restituisce le addizionali applicate al mese indicato (1..12).
 * @param {number} mese
 * @param {object} profile
 * @param {object} input
 */
export function getLocalTaxesForMonth(mese, profile, input = {}) {
  const m = Number(mese) || 1;
  const addReg =
    input.addRegionaleOverride !== undefined
      ? Number(input.addRegionaleOverride)
      : m <= 11
      ? Number(profile.addRegionale)
      : 0;
  const addCom =
    input.addComunaleOverride !== undefined
      ? Number(input.addComunaleOverride)
      : m <= 11
      ? Number(profile.addComunaleSaldo)
      : 0;
  const accCom =
    input.accComunaleOverride !== undefined
      ? Number(input.accComunaleOverride)
      : m >= 2 && m <= 11
      ? Number(profile.addComunaleAcconto)
      : 0;

  return {
    addReg: round2(addReg),
    addCom: round2(addCom),
    accCom: round2(accCom),
  };
}

/**
 * Calcola tutte le voci del cedolino.
 * @param {object} input
 * @param {object} profile
 */
export function calculatePayslip(input = {}, profile) {
  const { baseLordo, tariffaOraria, tariffe } = getProfileRates(profile);

  const oreViaggio = Math.max(0, Number(input.oreViaggio) || 0);
  const straordFeriale = Math.max(0, Number(input.straordFeriale) || 0);
  const straordFestivo = Math.max(0, Number(input.straordFestivo) || 0);
  const straordSabato = Math.max(0, Number(input.straordSabato) || 0);
  const sabatoSplit = splitSaturdayHours(input.oreSabatoTotali, input.numSabati);
  const totStr25 = straordFeriale + sabatoSplit.ore25;
  const totStr50 = straordSabato + sabatoSplit.ore50;

  const premio = Math.max(0, Number(input.premio) || 0);
  const extraNetto = Number(input.extraNetto) || 0;
  const arrotPrec = Number(input.arrotPrec) || 0;

  const lordoViaggio = round2(oreViaggio * tariffe.oreViaggio);
  const lordoStrFer = round2(totStr25 * tariffe.straordFeriale);
  const lordoStrFest = round2(straordFestivo * tariffe.straordFestivo);
  const lordoStrSab = round2(totStr50 * tariffe.straordSabato);

  const trasferteRaw = Array.isArray(input.trasferte) ? input.trasferte : [];
  const trasferteDettaglio = trasferteRaw.map((t, idx) => {
    const giorni = Math.max(0, Number(t.giorni) || 0);
    const diaria = Math.max(0, Number(t.diaria) || 0);
    const arretratiEsenti = Math.max(0, Number(t.arretratiEsenti) || 0);
    const tipo = t.tipo === 'italia' ? 'italia' : 'estero';
    const regime = t.regime || 'full';
    const soglia = getExemptionLimit(tipo, regime);

    const lordo = round2(giorni * diaria + arretratiEsenti);
    const imponibile = round2(giorni * Math.max(0, diaria - soglia));
    const esente = round2(lordo - imponibile);

    return {
      id: t.id || `trasf-${idx}`,
      label: t.label || (tipo === 'italia' ? 'Trasferta Italia' : 'Trasferta Estero'),
      giorni,
      diaria,
      tipo,
      regime,
      soglia,
      arretratiEsenti,
      lordo,
      imponibile,
      esente,
    };
  });

  const trasfLordoTot = round2(
    trasferteDettaglio.reduce((sum, t) => sum + t.lordo, 0)
  );
  const trasfImponibileTot = round2(
    trasferteDettaglio.reduce((sum, t) => sum + t.imponibile, 0)
  );
  const trasfEsenteTot = round2(
    trasferteDettaglio.reduce((sum, t) => sum + t.esente, 0)
  );

  const imponibileEsatto = round2(
    baseLordo +
      lordoViaggio +
      lordoStrFer +
      lordoStrFest +
      lordoStrSab +
      premio +
      trasfImponibileTot
  );

  // L'imponibile previdenziale INPS in busta è arrotondato all'euro intero
  const imponibilePrevidenziale = Math.round(imponibileEsatto);

  const inps = round2(imponibilePrevidenziale * Number(profile.inpsRate));
  const ivs1Threshold = Number(profile.ivs1Threshold);
  const eccedenzaIvs1 = Math.max(0, imponibilePrevidenziale - ivs1Threshold);
  const ivs1 = round2(eccedenzaIvs1 * Number(profile.ivs1Rate));
  const totaleContributiInps = round2(inps + ivs1);

  const imponibileFiscale = round2(imponibileEsatto - totaleContributiInps);

  const { b1, b2, r1, r2, r3 } = IRPEF_MONTHLY_BRACKETS;
  const irpefScaglione1 = Math.min(imponibileFiscale, b1) * r1;
  const irpefScaglione2 =
    Math.max(0, Math.min(imponibileFiscale, b2) - b1) * r2;
  const irpefScaglione3 = Math.max(0, imponibileFiscale - b2) * r3;
  const irpefLorda = round2(irpefScaglione1 + irpefScaglione2 + irpefScaglione3);
  const hasDetrOverride = input.detrazioniOverride !== undefined;
  const redditoAnnuoStimato =
    Number(profile.redditoAnnuoStimato) > 0
      ? Number(profile.redditoAnnuoStimato)
      : round2(baseLordo * (1 - Number(profile.inpsRate)) * 13);
  const detrazioniBase = hasDetrOverride
    ? Number(input.detrazioniOverride)
    : calculateMonthlyEmployeeDeduction(redditoAnnuoStimato);
  const cuneo = hasDetrOverride
    ? { bonusEsente: 0, ulterioreDetrazione: 0 }
    : calculateMonthlyTaxWedge2026(redditoAnnuoStimato, imponibileFiscale);
  const detrazioni = round2(detrazioniBase + cuneo.ulterioreDetrazione);
  const irpefNetta = hasDetrOverride
    ? round2(irpefLorda - detrazioni)
    : Math.max(0, round2(irpefLorda - detrazioni));

  const fsba = round2(imponibilePrevidenziale * Number(profile.fsbaRate));
  const ebav = round2(Number(profile.ebavFisso));

  const mese = Number(input.mese) || 1;
  const { addReg, addCom, accCom } = getLocalTaxesForMonth(mese, profile, input);
  const totaleAddizionali = round2(addReg + addCom + accCom);

  const totaleCompetenze = round2(
    baseLordo +
      lordoViaggio +
      lordoStrFer +
      lordoStrFest +
      lordoStrSab +
      premio +
      trasfLordoTot +
      cuneo.bonusEsente +
      extraNetto
  );

  const totaleTrattenute = round2(
    totaleContributiInps + irpefNetta + ebav + fsba + totaleAddizionali
  );

  const nettoEsatto = round2(totaleCompetenze - totaleTrattenute);

  // Data Services arrotonda sempre per eccesso all'euro intero,
  // recuperando l'arrotondamento anticipato il mese precedente (arrotPrec).
  const nettoPreArrot = round2(nettoEsatto - arrotPrec);
  const nettoArrotondato = Math.ceil(nettoPreArrot - 1e-9) || 0;
  const arrotCurr = round2(nettoArrotondato - nettoPreArrot) || 0;

  const aliquotaIrpefMarginale =
    imponibileFiscale > b2 ? r3 : imponibileFiscale > b1 ? r2 : r1;

  return {
    mese,
    baseLordo,
    tariffaOraria,
    tariffe,
    sabatoSplit,
    competenze: {
      baseLordo,
      lordoViaggio,
      lordoStrFer,
      lordoStrFest,
      lordoStrSab,
      premio,
      trasfLordoTot,
      trasfImponibileTot,
      trasfEsenteTot,
      extraNetto,
      trasferteDettaglio,
    },
    imponibili: {
      imponibileEsatto,
      imponibilePrevidenziale,
      imponibileFiscale,
      eccedenzaIvs1,
    },
    contributi: {
      inps,
      ivs1,
      totaleContributiInps,
      fsba,
      ebav,
    },
    irpef: {
      scaglione1: round2(irpefScaglione1),
      scaglione2: round2(irpefScaglione2),
      scaglione3: round2(irpefScaglione3),
      irpefLorda,
      detrazioniBase,
      ulterioreDetrazioneCuneo: cuneo.ulterioreDetrazione,
      bonusEsenteCuneo: cuneo.bonusEsente,
      detrazioni,
      irpefNetta,
      aliquotaMarginale: aliquotaIrpefMarginale,
    },
    addizionali: {
      addReg,
      addCom,
      accCom,
      totaleAddizionali,
    },
    totali: {
      totaleCompetenze,
      totaleTrattenute,
      nettoEsatto,
      arrotPrec,
      arrotCurr,
      nettoArrotondato,
    },
  };
}

/**
 * Calcola il netto effettivo di ogni singola voce tramite accumulo incrementale ordinato.
 * La somma dei `deltaNetto` di tutte le voci è garantita uguale a `payslip.totali.nettoEsatto`.
 * @param {object} input
 * @param {object} profile
 */
export function calculateItemizedNet(input = {}, profile) {
  const baseState = {
    mese: input.mese,
    trasferte: [],
    oreViaggio: 0,
    straordFeriale: 0,
    straordFestivo: 0,
    straordSabato: 0,
    oreSabatoTotali: 0,
    numSabati: 1,
    premio: 0,
    extraNetto: 0,
    detrazioniOverride: input.detrazioniOverride,
    addRegionaleOverride: input.addRegionaleOverride,
    addComunaleOverride: input.addComunaleOverride,
    accComunaleOverride: input.accComunaleOverride,
  };

  let prevRes = calculatePayslip(baseState, profile);
  const items = [
    {
      key: 'base',
      label: 'Stipendio Base Fisso',
      category: 'base',
      detail: 'Paga base + scatti + superm. + ERV',
      lordo: prevRes.baseLordo,
      esente: 0,
      imponibile: prevRes.baseLordo,
      deltaNetto: prevRes.totali.nettoEsatto,
      trattenute: round2(prevRes.baseLordo - prevRes.totali.nettoEsatto),
      percentualeNetta:
        prevRes.baseLordo > 0
          ? (prevRes.totali.nettoEsatto / prevRes.baseLordo) * 100
          : 0,
    },
  ];

  const currentState = { ...baseState, trasferte: [] };

  const pushStep = (key, label, category, detail, lordo, esente, imponibile) => {
    const nextRes = calculatePayslip(currentState, profile);
    const deltaNetto = round2(
      nextRes.totali.nettoEsatto - prevRes.totali.nettoEsatto
    );
    const trattenute = round2(lordo - deltaNetto);
    items.push({
      key,
      label,
      category,
      detail,
      lordo: round2(lordo),
      esente: round2(esente),
      imponibile: round2(imponibile),
      deltaNetto,
      trattenute,
      percentualeNetta: lordo > 0 ? (deltaNetto / lordo) * 100 : 0,
    });
    prevRes = nextRes;
  };

  // 1. Trasferte (nell'ordine inserito)
  const trasferte = Array.isArray(input.trasferte) ? input.trasferte : [];
  trasferte.forEach((t, idx) => {
    const giorni = Math.max(0, Number(t.giorni) || 0);
    const diaria = Math.max(0, Number(t.diaria) || 0);
    const arretratiEsenti = Math.max(0, Number(t.arretratiEsenti) || 0);
    if (giorni === 0 && arretratiEsenti === 0) return;

    currentState.trasferte = [...currentState.trasferte, t];
    const tipo = t.tipo === 'italia' ? 'italia' : 'estero';
    const soglia = getExemptionLimit(tipo, t.regime || 'full');
    const lordo = round2(giorni * diaria + arretratiEsenti);
    const imponibile = round2(giorni * Math.max(0, diaria - soglia));
    const esente = round2(lordo - imponibile);
    const label = t.label || (tipo === 'italia' ? 'Trasferta Italia' : 'Trasferta Estero');
    const detail = `${giorni} gg × ${diaria.toFixed(2).replace('.', ',')} €`;

    pushStep(`trasf-${idx}`, label, 'trasferta', detail, lordo, esente, imponibile);
  });

  // 2. Ore Viaggio (85%)
  const oreViaggio = Math.max(0, Number(input.oreViaggio) || 0);
  if (oreViaggio > 0) {
    currentState.oreViaggio = oreViaggio;
    const lordo = round2(oreViaggio * prevRes.tariffe.oreViaggio);
    pushStep(
      'viaggio',
      'Ore viaggio (85%)',
      'viaggio',
      `${oreViaggio} h`,
      lordo,
      0,
      lordo
    );
  }

  // 3. Straordinario Feriale (+25%)
  const strFer = Math.max(0, Number(input.straordFeriale) || 0);
  if (strFer > 0) {
    currentState.straordFeriale = strFer;
    const lordo = round2(strFer * prevRes.tariffe.straordFeriale);
    pushStep(
      'strFer',
      'Straordinario feriale (+25%)',
      'straordinario',
      `${strFer} h`,
      lordo,
      0,
      lordo
    );
  }

  // 4. Straordinario Festivo (+45%)
  const strFest = Math.max(0, Number(input.straordFestivo) || 0);
  if (strFest > 0) {
    currentState.straordFestivo = strFest;
    const lordo = round2(strFest * prevRes.tariffe.straordFestivo);
    pushStep(
      'strFest',
      'Straordinario festivo (+45%)',
      'straordinario',
      `${strFest} h`,
      lordo,
      0,
      lordo
    );
  }

  // 5. Straordinario Sabato (+50% manuale, usato per storico)
  const strSab = Math.max(0, Number(input.straordSabato) || 0);
  if (strSab > 0) {
    currentState.straordSabato = strSab;
    const lordo = round2(strSab * prevRes.tariffe.straordSabato);
    pushStep(
      'strSab',
      'Straordinario sabato (+50%)',
      'straordinario',
      `${strSab} h`,
      lordo,
      0,
      lordo
    );
  }

  // 5b. Straordinario Sabato automatico CCNL (prime 3h/sabato +25%, poi +50%)
  const oreSabTot = Math.max(0, Number(input.oreSabatoTotali) || 0);
  if (oreSabTot > 0) {
    currentState.oreSabatoTotali = oreSabTot;
    currentState.numSabati = Math.max(1, Math.floor(Number(input.numSabati) || 1));
    const sab = splitSaturdayHours(oreSabTot, currentState.numSabati);
    const lordo = round2(
      sab.ore25 * prevRes.tariffe.straordFeriale +
        sab.ore50 * prevRes.tariffe.straordSabato
    );
    pushStep(
      'sabatoCCNL',
      'Straordinario sabato (CCNL)',
      'straordinario',
      `${oreSabTot} h (${sab.ore25}h +25% · ${sab.ore50}h +50%)`,
      lordo,
      0,
      lordo
    );
  }

  // 6. Premio (usato solo per confronto storico)
  const premio = Math.max(0, Number(input.premio) || 0);
  if (premio > 0) {
    currentState.premio = premio;
    pushStep('premio', 'Premio', 'premio', 'Importo lordo', premio, 0, premio);
  }

  // 7. Extra netto (rimborsi / 730)
  const extraNetto = Number(input.extraNetto) || 0;
  if (extraNetto !== 0) {
    currentState.extraNetto = extraNetto;
    pushStep(
      'extra',
      'Voci nette extra / 730',
      'extra',
      'Esente imposte',
      extraNetto,
      extraNetto,
      0
    );
  }

  return items;
}

/**
 * Calcola il valore netto marginale istantaneo (+1 ora / +1 giorno)
 * e la distanza dalle soglie critiche (IRPEF 43% e IVS 1%).
 * @param {object} input
 * @param {object} profile
 */
export function calculateMarginalRates(input = {}, profile) {
  const current = calculatePayslip(input, profile);
  const impPrev = current.imponibili.imponibilePrevidenziale;
  const impFisc = current.imponibili.imponibileFiscale;

  const { b2 } = IRPEF_MONTHLY_BRACKETS;
  const ivs1Threshold = Number(profile.ivs1Threshold);

  const distIrpef43 = round2(b2 - impFisc);
  const distIvs1 = round2(ivs1Threshold - impPrev);

  // Aliquota marginale continua su 1 € imponibile lordo aggiuntivo
  const inpsM = Number(profile.inpsRate);
  const ivs1M = impPrev >= ivs1Threshold ? Number(profile.ivs1Rate) : 0;
  const fsbaM = Number(profile.fsbaRate);
  const irpefM = current.irpef.aliquotaMarginale;

  // 1 € lordo imponibile paga INPS + IVS1 + FSBA, e sulla parte netta INPS+IVS1 paga IRPEF
  const netFactorContinuous =
    1 - inpsM - ivs1M - fsbaM - (1 - inpsM - ivs1M) * irpefM;

  const { tariffe } = current;
  return {
    aliquotaIrpefCorrente: Math.round(irpefM * 100),
    ivs1Attivo: impPrev > ivs1Threshold,
    distIrpef43,
    distIvs1,
    netFactorPercent: round2(netFactorContinuous * 100),
    perOra: {
      oreViaggio: round2(tariffe.oreViaggio * netFactorContinuous),
      straordFeriale: round2(tariffe.straordFeriale * netFactorContinuous),
      straordFestivo: round2(tariffe.straordFestivo * netFactorContinuous),
      straordSabato: round2(tariffe.straordSabato * netFactorContinuous),
    },
    trasferta: {
      esteroEntroSoglia: 77.47,
      estero90: round2(77.47 + (90 - 77.47) * netFactorContinuous),
      italiaEntroSoglia: 46.48,
    },
  };
}
