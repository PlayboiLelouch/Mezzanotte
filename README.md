# MEZZANOTTE 3.0 — sistema di crescita personale

PWA gratuita per iPhone per costruire disciplina con due abitudini:
**a letto entro mezzanotte** e **almeno 5 minuti di lettura** al giorno, in un percorso di 30 giorni.

App: https://playboilelouch.github.io/Mezzanotte/

Nessun backend, account, database esterno, analytics, pubblicità o servizio a pagamento.
Tutti i dati restano sul dispositivo. Costo operativo: 0 €.

## Principi

- Uso quotidiano in meno di 30 secondi: le due abitudini si completano con un tocco dalla schermata Oggi.
- Gratificazione basata solo sul comportamento reale: XP, livelli e traguardi sono calcolati dalle registrazioni
  (modificarle più volte non duplica nulla). Nessun premio per il tempo passato nell'app.
- Nessuna dinamica punitiva: saltare un giorno non toglie XP, livello o progressi. Serie e costanza sono separate.
- Gli obiettivi cambiano solo con il consenso dell'utente.

## Funzioni

| Sezione | Contenuto |
| --- | --- |
| **Oggi** | Giorno del percorso, livello e barra XP, messaggio contestuale, sonno e lettura con un tocco, routine serale (dalle 22:30), settimana in corso |
| **Obiettivi** | Percorso in 5 fasi (Inizio, Costanza, Consolidamento, Disciplina, Bilancio), proposte, prossimo traguardo, abitudini |
| **Progressi** | Costanza (settimana, 4 settimane, per settimana), serie, statistiche di sonno e lettura, calendario mensile, storico |
| **Profilo** | Livello, XP, 12 traguardi, gestione abitudini, promemoria iOS, preferenze, backup, versione |

- **Sonno**: entro mezzanotte / dopo mezzanotte, orario a letto e ore di sonno facoltativi. Sabato sera libero
  (non conta e non interrompe la serie). Obiettivi: 4 → 5 → 5 → 6 notti su 6.
- **Lettura**: «Ho letto 5 minuti», minuti manuali, timer con pausa e ripresa, titolo del libro, minuti totali.
  Obiettivi: 4 → 5 → 6 → 6 giorni su 7. Il minimo giornaliero non sale mai da solo: un aumento viene proposto
  solo quando l'abitudine è consolidata.
- **XP**: +20 per abitudine, +10 per giornata completa, +50 per ogni obiettivo settimanale raggiunto.
  Livelli: Inizio (0), Costruttore (150), Costante (450), Disciplinato (900), Determinato (1500), Inarrestabile (2300), poi oltre.
- **Anti-abbandono**: bentornato positivo con recupero dei giorni, costanza su obiettivi realistici,
  proposta di settimana più leggera dopo due settimane sotto obiettivo (mai applicata senza consenso).
- **Promemoria**: le web app su iPhone non possono programmare notifiche locali senza un server, quindi l'app
  guida a configurare Salute (Rilassamento alle 23:15), Sveglie e Promemoria di iOS.

## Struttura

```
site/                 l'app pubblicata
  js/core.js          date e orari (giorno logico: fino alle 5:00 conta il giorno prima)
  js/store.js         schema dei dati, migrazioni, import/export (puro)
  js/engine.js        stati, percorso, costanza, XP, livelli, traguardi, proposte (puro)
  js/messages.js      messaggi contestuali da regole locali (puro)
  js/views.js         modelli HTML delle schermate
  js/app.js           persistenza, azioni, celebrazioni, timer, aggiornamenti
  js/fx.js, icons.js  feedback (aptica dove supportata, suoni opzionali) e icone
  sw.js               service worker: offline e aggiornamento automatico
tests/                unit test (node --test, più fusi orari) ed end-to-end (Playwright)
tests/fixtures/v1-site  copia dell'app 1.0 per testare l'aggiornamento reale
tools/                icone, splash screen, screenshot
```

## Dati e migrazione

- Formato 2 in `localStorage["mezzanotte:v2"]` con copia in IndexedDB.
- Alla prima apertura della 3.0 i dati 1.x (`mezzanotte:v1`) vengono migrati senza perdite; l'originale
  viene conservato in `mezzanotte:backup-pre-3.0`. La migrazione è versionata, idempotente e testata.
- A ogni salvataggio viene aggiornata anche una copia compatibile 1.x in `mezzanotte:v1`: tornando alla
  versione precedente non si perdono i progressi (e se la 1.x scrive nuovi dati, la 3.0 li recupera).
- Importazione compatibile con i backup 1.x e 3.x. Prima di un'importazione o di una cancellazione, i dati
  attuali vengono copiati in `mezzanotte:backup-prima-del-reset`.
- Nuove abitudini (sì/no o minuti, giorni a settimana, icona, colore) si aggiungono senza modificare il motore;
  nell'app si sbloccano al termine del primo percorso.

## Comandi

```bash
npm test                  # test della logica in 4 fusi orari
npm run test:e2e          # end-to-end in Chromium con emulazione iPhone (richiede playwright)
npm run serve             # anteprima locale su http://localhost:8080
npm run screenshots       # screenshot delle quattro sezioni su più iPhone emulati
npm run icons             # rigenera icone e splash
```

Per una nuova versione aggiorna `VERSION` in `site/sw.js` e in `site/js/app.js`: il service worker si
installa e si attiva da solo, e l'app aperta si ricarica sulla nuova versione senza toccare i dati.

## Pubblicazione e ripristino

Il workflow `.github/workflows/pages.yml` esegue tutti i test (unitari ed end-to-end) e pubblica `site/`
su GitHub Pages a ogni push su `main`. Il branch `ripristino-v1.0.0` contiene la versione 1.0.0
pubblicata prima di questo aggiornamento.

## Limitazioni

- I test automatici usano Chromium con emulazione iPhone, non Safari su un iPhone reale.
- Il feedback aptico su iPhone usa l'unico meccanismo disponibile alle web app (interruttore nativo, iOS 18+).
- Niente notifiche programmate: vedi Promemoria.
