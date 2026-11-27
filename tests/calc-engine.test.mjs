import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculatePayslip,
  calculateItemizedNet,
  calculateMarginalRates,
  calculateMonthlyEmployeeDeduction,
  calculateMonthlyTaxWedge2026,
  splitSaturdayHours,
  round2,
} from '../src/calc-engine.js';
import { DEFAULT_PROFILE, DEFAULT_COUNTRIES } from '../src/presets.js';

const SAMPLE_PROFILE = {
  ...DEFAULT_PROFILE,
  pagaBase: 2000.0,
  superminimo: 1200.0,
  erv: 95.0,
  ebavFisso: 3.85,
  addRegionale: 50.0,
  addComunaleSaldo: 20.0,
  addComunaleAcconto: 10.0,
  redditoAnnuoStimato: 55000,
};

function assertClose(actual, expected, tol, label) {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tol,
    `${label}: atteso ${expected}, ottenuto ${actual} (scarto ${diff.toFixed(4)})`
  );
}

// Se esistono fixture locali private (ignorate da Git), esegue anche i test di regressione storici
const localFixturesUrl = new URL('./fixtures-2026.local.js', import.meta.url);
if (fs.existsSync(localFixturesUrl)) {
  const { HISTORICAL_PAYSLIPS_2026 } = await import(localFixturesUrl.href);
  for (const hist of HISTORICAL_PAYSLIPS_2026) {
    test(`Cedolino storico locale ${hist.label}`, () => {
      const res = calculatePayslip(hist.input, hist.profile);
      assert.equal(
        res.imponibili.imponibilePrevidenziale,
        hist.actual.impInps,
        `${hist.label} imponibile previdenziale`
      );
      assertClose(
        res.imponibili.imponibileFiscale,
        hist.actual.impFiscale,
        0.02,
        `${hist.label} imponibile fiscale`
      );
      assertClose(
        res.irpef.irpefLorda,
        hist.actual.irpefLorda,
        0.02,
        `${hist.label} IRPEF lorda`
      );
      assert.equal(
        res.totali.nettoArrotondato,
        hist.actual.netto,
        `${hist.label} netto arrotondato`
      );
    });
  }
}

test('Trasferta 14 giorni estero a 60 €/gg: 100% esente e netta', () => {
  const base = calculatePayslip({ mese: 11 }, SAMPLE_PROFILE);
  const conTrasferta = calculatePayslip(
    {
      mese: 11,
      trasferte: [
        {
          id: 'est',
          label: 'Estero',
          giorni: 14,
          diaria: 60,
          tipo: 'estero',
          regime: 'full',
        },
      ],
    },
    SAMPLE_PROFILE
  );

  assert.equal(conTrasferta.competenze.trasfLordoTot, 840);
  assert.equal(conTrasferta.competenze.trasfEsenteTot, 840);
  assert.equal(conTrasferta.competenze.trasfImponibileTot, 0);
  assert.equal(
    round2(conTrasferta.totali.nettoEsatto - base.totali.nettoEsatto),
    840
  );
});

test('Trasferta estera 10 gg a 90 €/gg: tassa solo la parte oltre 77,47 €', () => {
  const res = calculatePayslip(
    {
      mese: 11,
      trasferte: [
        {
          id: 'est90',
          label: 'Estero 90',
          giorni: 10,
          diaria: 90,
          tipo: 'estero',
          regime: 'full',
        },
      ],
    },
    SAMPLE_PROFILE
  );

  assert.equal(res.competenze.trasfLordoTot, 900);
  assert.equal(res.competenze.trasfEsenteTot, 774.7);
  assert.equal(res.competenze.trasfImponibileTot, 125.3);
});

test('Trasferta Italia 46,48 € vs 60 € e regime ridotto 1/3', () => {
  const itEsente = calculatePayslip(
    {
      mese: 11,
      trasferte: [{ giorni: 5, diaria: 46.48, tipo: 'italia', regime: 'full' }],
    },
    SAMPLE_PROFILE
  );
  assert.equal(itEsente.competenze.trasfImponibileTot, 0);

  const itRid = calculatePayslip(
    {
      mese: 11,
      trasferte: [{ giorni: 5, diaria: 60, tipo: 'italia', regime: 'rid1_3' }],
    },
    SAMPLE_PROFILE
  );
  // Soglia rid1_3 Italia = 30.99 -> eccedenza 29.01/gg * 5 = 145.05
  assert.equal(itRid.competenze.trasfImponibileTot, 145.05);
});

test('Scatto IVS 1% oltre 4.685 € e IRPEF 43% oltre 4.166,67 €', () => {
  const res = calculatePayslip(
    {
      mese: 11,
      oreViaggio: 30,
      straordFeriale: 30,
      straordSabato: 20,
    },
    SAMPLE_PROFILE
  );

  assert.ok(res.imponibili.imponibilePrevidenziale > 4685);
  assert.ok(res.contributi.ivs1 > 0);
  assert.ok(res.imponibili.imponibileFiscale > 50000 / 12);
  assert.ok(res.irpef.scaglione3 > 0);
  assert.equal(res.irpef.aliquotaMarginale, 0.43);
});

test('Invariante scomposizione netto per voce: somma deltaNetto === nettoEsatto', () => {
  const input = {
    mese: 11,
    trasferte: [
      { label: 'Estero A', giorni: 10, diaria: 60, tipo: 'estero', regime: 'full' },
      { label: 'Estero B', giorni: 4, diaria: 90, tipo: 'estero', regime: 'full' },
    ],
    oreViaggio: 18,
    straordFeriale: 12,
    straordFestivo: 4,
    straordSabato: 8,
  };

  const full = calculatePayslip(input, SAMPLE_PROFILE);
  const items = calculateItemizedNet(input, SAMPLE_PROFILE);
  const sumItems = round2(items.reduce((acc, item) => acc + item.deltaNetto, 0));

  assert.equal(sumItems, full.totali.nettoEsatto);

  const marginal = calculateMarginalRates(input, SAMPLE_PROFILE);
  assert.ok(marginal.perOra.straordSabato > marginal.perOra.straordFeriale);
  assert.ok(marginal.perOra.straordFeriale > marginal.perOra.oreViaggio);
});

test('Regola sabato CCNL Metalmeccanico Artigianato (3h +25%, poi +50%)', () => {
  assert.deepEqual(splitSaturdayHours(10, 1), { oreTotali: 10, numSabati: 1, ore25: 3, ore50: 7 });
  assert.deepEqual(splitSaturdayHours(20, 2), { oreTotali: 20, numSabati: 2, ore25: 6, ore50: 14 });
  assert.deepEqual(splitSaturdayHours(30, 3), { oreTotali: 30, numSabati: 3, ore25: 9, ore50: 21 });
  assert.deepEqual(splitSaturdayHours(2, 1), { oreTotali: 2, numSabati: 1, ore25: 2, ore50: 0 });

  const inputSab = {
    mese: 11,
    trasferte: [{ label: 'Estero', giorni: 14, diaria: 60, tipo: 'estero', regime: 'full' }],
    straordFeriale: 5,
    oreSabatoTotali: 10,
    numSabati: 1,
  };
  const fullSab = calculatePayslip(inputSab, SAMPLE_PROFILE);
  const itemsSab = calculateItemizedNet(inputSab, SAMPLE_PROFILE);
  const sumSab = round2(itemsSab.reduce((acc, i) => acc + i.deltaNetto, 0));
  assert.equal(sumSab, fullSab.totali.nettoEsatto);
  assert.ok(itemsSab.some((i) => i.key === 'sabatoCCNL' && i.detail.includes('3h +25% · 7h +50%')));
});

test('Detrazioni lavoro dipendente 2026 (< 50.000 € attive, > 50.000 € zero)', () => {
  assert.ok(calculateMonthlyEmployeeDeduction(25000) > 150);
  assert.ok(calculateMonthlyEmployeeDeduction(35000) > 100);
  assert.equal(calculateMonthlyEmployeeDeduction(53000), 0);

  const colleagueProfile = { ...DEFAULT_PROFILE, pagaBase: 1828.24, erv: 95 };
  const colleagueInput = {
    mese: 11,
    trasferte: [{ label: 'Estero', giorni: 5, diaria: 60, tipo: 'estero', regime: 'full' }],
    straordFeriale: 10,
  };
  const resCol = calculatePayslip(colleagueInput, colleagueProfile);
  assert.ok(resCol.irpef.detrazioni > 0);
  const itemsCol = calculateItemizedNet(colleagueInput, colleagueProfile);
  const sumCol = round2(itemsCol.reduce((acc, i) => acc + i.deltaNetto, 0));
  assert.equal(sumCol, resCol.totali.nettoEsatto);
});

test('Profilo vuoto iniziale: tutto a 0 senza NaN', () => {
  assert.equal(DEFAULT_COUNTRIES.length, 0);
  const emptyPay = calculatePayslip({ mese: 11 }, DEFAULT_PROFILE);
  assert.equal(emptyPay.baseLordo, 0);
  assert.equal(emptyPay.totali.nettoEsatto, 0);
  assert.equal(emptyPay.totali.nettoArrotondato, 0);
  const emptyItems = calculateItemizedNet({ mese: 11 }, DEFAULT_PROFILE);
  assert.equal(emptyItems[0].deltaNetto, 0);
  assert.equal(emptyItems[0].percentualeNetta, 0);
});

test('Cuneo Fiscale 2026: bonus <= 20k, ulteriore detrazione 20k-40k, zero > 40k', () => {
  // <= 20.000 €: somma esente 4,8% su imponibile fiscale mensile
  const low = calculateMonthlyTaxWedge2026(18000, 1400);
  assert.equal(low.bonusEsente, round2(1400 * 0.048));
  assert.equal(low.ulterioreDetrazione, 0);

  // 20.001..32.000 €: ulteriore detrazione fissa 1.000 €/anno = 83,33 €/mese
  const mid = calculateMonthlyTaxWedge2026(28000, 2100);
  assert.equal(mid.bonusEsente, 0);
  assert.equal(mid.ulterioreDetrazione, 83.33);

  // 32.001..40.000 €: 36.000 € -> 500 €/anno = 41,67 €/mese
  const dec = calculateMonthlyTaxWedge2026(36000, 2700);
  assert.equal(dec.bonusEsente, 0);
  assert.equal(dec.ulterioreDetrazione, 41.67);

  // > 40.000 €: 0 €
  const high = calculateMonthlyTaxWedge2026(45000, 3500);
  assert.deepEqual(high, { bonusEsente: 0, ulterioreDetrazione: 0 });

  // Verifica invariante itemized con collega a 30.000 €
  const colProfile = { ...DEFAULT_PROFILE, pagaBase: 2500, redditoAnnuoStimato: 30000, ebavFisso: 3.85 };
  const colInput = { mese: 11, straordFeriale: 6, trasferte: [{ label: 'Estero', giorni: 5, diaria: 60, tipo: 'estero', regime: 'full' }] };
  const res = calculatePayslip(colInput, colProfile);
  assert.equal(res.irpef.ulterioreDetrazioneCuneo, 83.33);
  const items = calculateItemizedNet(colInput, colProfile);
  assert.equal(round2(items.reduce((a, i) => a + i.deltaNetto, 0)), res.totali.nettoEsatto);
});
