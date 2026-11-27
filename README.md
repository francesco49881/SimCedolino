# Simulatore Cedolino & Trasferte

Strumento leggero e **100% offline** per stimare in anticipo lo stipendio netto mensile (**CCNL Metalmeccanico Artigianato**), sapendo in anticipo trasferte, ore di viaggio e straordinari.

## Come usarlo in 10 secondi (per i colleghi)

1. Scarica il singolo file **`Simulatore_Cedolino.html`** da questo repository.
2. Fai **doppio click** per aprirlo con il tuo browser (Chrome, Edge, Firefox, Safari) — **non serve installare nulla e non serve internet**.
3. Al primo avvio si apre direttamente la pagina **Nazioni & Profilo**:
   - Usa la **Calibrazione Rapida da Busta Paga** inserendo i dati della tua ultima busta paga (puoi anche inserire solo la *Retribuzione Totale* e le addizionali locali, e verificare subito se il netto calcolato coincide con quello reale).
   - Aggiungi nella **Rubrica Nazioni & Diarie** le destinazioni in cui vai spesso in trasferta (con la relativa diaria giornaliera).
   - Clicca **Applica al profilo e vai al Simulatore →**.
4. I tuoi dati vengono salvati **solo sul tuo browser** (`localStorage`). Puoi anche fare backup o spostarli su un altro dispositivo con **Esporta .json / Importa .json**.

## Funzionalità principali

- **Trasferte multiple nello stesso mese** con calcolo automatico della franchigia esente TUIR art. 51 c. 5 (`77,47 €/gg` Estero, `46,48 €/gg` Italia, con supporto opzionale a riduzioni 1/3 e 2/3).
- **Ore viaggio (`85%`) e straordinari (`+25%`, `+45%`, `+50%`)**.
- **Regola automatica Sabato (CCNL Metalmeccanico Artigianato)**: inserisci le ore totali lavorate di sabato e il numero di sabati, e il simulatore ripartisce automaticamente le prime 3 ore per sabato al `+25%` e le successive al `+50%`.
- **Netto di ogni singola voce**: scopri esattamente quanto entra in tasca per ciascuna voce (Base, Trasferte, Ore viaggio, Straordinari) e quanto vale al netto `+1 ora` / `+1 giorno` al tuo scaglione IRPEF corrente.
- **Tasse e contributi 2026**: INPS `9,19%`, contributo aggiuntivo IVS `1%` oltre `4.685 €/mese`, FSBA `0,15%`, scaglioni IRPEF 2026 (`23% / 33% / 43%`) e detrazioni lavoro dipendente automatiche sotto i `50.000 €`.
- **Stampa / PDF e Salva JPG**: salva il riepilogo teorico del mese per confrontarlo poi con la busta paga reale.

## Privacy

- Il file `Simulatore_Cedolino.html` **non contiene alcun dato personale** e **non effettua nessuna chiamata verso internet**.
- Tutto viene calcolato e salvato localmente nel tuo browser.

---

## Note per lo sviluppo

```bash
# Eseguire i test automatici del motore di calcolo (Node.js >= 20)
node --test tests/calc-engine.test.mjs

# Rigenerare il file unico standalone Simulatore_Cedolino.html
node scripts/build-standalone.mjs
```
