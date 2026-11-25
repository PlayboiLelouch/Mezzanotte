# MEZZANOTTE

PWA gratuita per iPhone: sfida di 30 giorni per **andare a letto entro mezzanotte** e **leggere almeno 5 minuti** al giorno.

- Obiettivi settimanali progressivi: sonno 4 → 5 → 5 → 6 notti, lettura 4 → 5 → 6 → 6 giorni (giorni 29–30: finale).
- Sabato sera libero dal vincolo del sonno (non conta e non interrompe la serie).
- Calendario interattivo, statistiche, serie, percentuali, storico orari e minuti, timer di lettura.
- Dati salvati solo sul dispositivo (localStorage + copia in IndexedDB), esportazione/importazione JSON.
- Funziona offline (service worker), si installa dalla schermata Home a schermo intero.

Nessun backend, database, account o servizio a pagamento.

## Struttura

```
site/            l'app pubblicata (HTML, CSS, JS, manifest, service worker, icone)
  js/core.js     logica della sfida (pura, testata)
  js/app.js      interfaccia
tests/           test unitari (node --test) ed end-to-end (Playwright)
tools/           generazione icone e splash screen iOS
```

## Comandi

```bash
npm test                  # test della logica
npm run test:e2e          # test end-to-end in Chromium con emulazione iPhone
npm run serve             # anteprima locale su http://localhost:8080
npm run icons             # rigenera icone e splash (poi copia i link in index.html)
```

Quando pubblichi una nuova versione, aggiorna `VERSION` in `site/sw.js` così gli iPhone scaricano l'aggiornamento.

## Pubblicazione

Il workflow `.github/workflows/pages.yml` esegue i test e pubblica `site/` su GitHub Pages.
