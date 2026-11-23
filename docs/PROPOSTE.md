# Proposte e decisioni

Regole e numeri che il regolamento non fissa, inventati per i mockup di inventario e Forgia del Master.
Il 20/11/2026 il Master ha risposto punto per punto: qui sotto c'è la decisione per ognuno.
Nel mockup i punti decisi hanno il chip verde **deciso**; quelli ancora aperti il chip giallo **proposta** (passaci sopra per la spiegazione).

## Inventario ed equipaggiamento (`mockup/rules.js`, `mockup/screens/inventario.js`)
1. **16 slot del manichino — DECISO.** Testa, Collo, Spalle, Mantello, Torso, Polsi, Mani, Cintura, Gambe, Piedi, 2 Anelli, 2 Ninnoli, Mano principale, Mano secondaria (i 16 slot di gioco di World of Warcraft, senza camicia e tabarda).
   Ogni oggetto ha un **tipo** che decide gli slot, come l'"InventoryType" di WoW:
   - Elmo → Testa; Amuleto → Collo; Spallacci → Spalle; Mantello → Mantello; Corazza/Veste → Torso; Bracciali → Polsi; Guanti → Mani; Cintura → Cintura; Gambali → Gambe; Stivali → Piedi;
   - Anello → uno dei due slot Anello; Ninnolo → uno dei due slot Ninnolo;
   - Una mano → mano principale o secondaria;
   - Mano principale → solo principale; Due mani (anche archi e bastoni) → principale e blocca la secondaria;
   - Scudo e Tenuto in mano secondaria (focus, tomo, simbolo sacro) → solo secondaria.
   - **Doppia impugnatura — DECISO:** libera per tutti; il danno della mano secondaria lo decide un talento.
     Senza talento la mano secondaria fa il 50% del danno (deciso); il talento ("Doppia impugnatura", "Ambidestria") scrive la sua percentuale nell'effetto.
2. **Bonus degli oggetti — DECISO.**
   - alle statistiche (es. VIT +8): colonna di origine "Oggetti", calcolata dall'equipaggiato;
   - alle derivate: Difesa, Difesa magica e Blocco restano nelle formule già decise (Difesa equip × (1 + VIT/100)); gli altri (Evasione, Critico, Velocità…) si sommano dopo la formula.
3. **Requisiti degli oggetti — DECISO.** Livello e statistiche: se non sono soddisfatti l'oggetto non si equipaggia.
4. **Oggetti di esempio — DECISO.** Restano segnaposto: gli oggetti veri li creerà il Master.
5. **Inventario illimitato — DECISO.** Nessun limite di caselle, conta solo il peso.

## Incantesimi (`mockup/screens/wizards-magia.js`) — tutti DECISI
6. **Costo:** Mana = 10 × L × (L+1), con L = livello di lancio (livello 1 = 20, come il Dardo Magico; livello 10 = 1.100).
7. **Tempi:** lancio ⌈L/3⌉ turni; ricarica ⌈L/2⌉ turni (minimo 1).
8. **Gravità del backlash:** L × 2 + fattori, al posto del d20; +2 con Spatium o Tempus; +2 con una coppia di sfere Pericolosa, +1 se la peggiore è Debole; se due sfere si giudicano diversamente nella matrice vale il giudizio più severo.
9. **Modificatori:** uso traverso +1 livello per sfera; metamagie di sfera +2 livelli; Grado consigliato in ogni sfera ≥ livello di lancio, altrimenti conta come overcast.
10. **Sintonia** con più sfere: si somma sfera per sfera, limite ±2.
11. **Efficacia** = livello base + linea di potere + sintonia. La metamagia aumenta costo e rischio, non la potenza.
12. **Danno o cura** = 15–30 × efficacia × molt. danno magico, poi ×1 con 1 sfera, ×0,85 con 2, ×0,75 con 3.
    *Dal 23/11/2026 il numero lo dà la meccanica dell'incantesimo (formula «Incantesimo» = 15–30 × efficacia × molt. magico);
    il motore del combattimento non applica la riduzione per numero di sfere.*

## Miracoli (`mockup/screens/wizards-magia.js`) — tutti DECISI
13. **I miracoli sono skill**, esattamente come gli incantesimi: entrano tra le skill attive del PG e salgono di Grado.
14. **Scala:** livelli 1–10.
15. **Fede richiesta** = 5 × L × (L+1).
16. **Costo** = 12,5 × L × (L+1) Mana (livello 1 = 25, come Cura Minore).
17. **Scala del favore divino:** −3 Maledizione divina, −2 Rinnegato, −1 In disgrazia, 0 Neutrale, +1 Notato, +2 Favorito, +3 Prescelto, +4 Benedizione divina.
18. **Favore richiesto:** livello 1–2 Notato, 3–5 Favorito, 6–8 Prescelto, 9–10 Benedizione; un grado in più se la natura del miracolo è fuori dal dominio del dio.
19. **Potenza** = base × livello × (1 + Fede/100) × molt. favore: al favore richiesto ×1, +25% per ogni grado in più; un grado sotto ×0,5, due o più gradi sotto 0.
    *Dal 23/11/2026 la base la dà la meccanica del miracolo (efficacia = livello); il motore del combattimento la moltiplica
    per (1 + Fede/100) × molt. favore (favore richiesto dal wizard, o dal livello per i miracoli più vecchi). Se il PG non
    ha il favore del dio nella reputazione cosmica il molt. favore non si applica (×1).*
20. **Profilo di ogni dio:** nature affini, tono, voti e tabù.
21. **Conseguenze dell'abuso:** −1 o −2 favore, oppure Maledizione divina.
22. **Fede:** statistica avanzata che il PG sblocca appena crede in un dio.

## Skill, razze, titoli, incontri (`mockup/screens/wizards-master.js`, `mockup/screens/forgia.js`)
23. **Skill — DECISO:** ogni skill ha i suoi valori per Grado, scelti nel wizard (un valore per ognuno dei 10 Gradi; "Lineare dal I" li riempie moltiplicando il Grado I). Nessuna formula unica.
24. **Razze — DECISO:** aggiungono statistiche e talenti razziali, inseriti dal Master nel wizard, senza limiti fissi.
25. **Evoluzione di un titolo — DECISO:** sostituisce il titolo precedente e ne toglie i bonus (l'evoluzione di solito dà di più).
26. **Difficoltà di un incontro — DECISO:** la decide il Master al momento. Il wizard mostra solo una stima di riferimento:
    - *stima (proposta):* (Vita × Danno delle creature) / (Vita × Danno del gruppo); Banale < 0,1, Facile < 0,3, Equilibrato < 0,7, Difficile < 1,5, Mortale < 4, oltre Impossibile.
27. **EXP del gruppo — DECISO:** quando il Master chiude un incontro (Forgia → Libreria → «Chiudi incontro») un pop-up chiede se l'EXP è intera per ogni PG o divisa tra i PG che partecipano, e mostra chi sale di livello.
28. **EXP e rarità — DECISO:** la rarità della creatura moltiplica l'EXP per grado³, lo stesso della sua forza (Non Comune ×8, Raro ×27 … Divino ×512).
29. **Bottino — DECISO:** lo decide il Master. Il wizard dell'incontro genera al momento un profilo di drop generico (tabella d100 per creatura, monete e materiali) che il Master può rigenerare, tirare o ignorare.
    - *Ancora proposta:* i quattro tipi di profilo (Avaro, Normale, Generoso, Tesoro) e le loro soglie.

## Statistiche avanzate dai fogli Excel — DECISO
- **Fortuna (Dante):** entra nell'Evasione, (DEX + LCK)/20; Bonus Fortuna sui tiri = LCK/100 (la cella dell'Excel). Viene dal talento **Re dei Giochi**, Epico ed evolutivo (+25 LCK), non da un titolo.
- **KI (Corax):** barra KI accanto a HP/MP/SP, KI max = 100 + KI × 8; rigenera VIT/30 a turno in combattimento, VIT/15 al minuto fuori, VIT/5 al minuto in meditazione.
- **Carisma di Corax:** i suoi titoli danno +150 CHA, ma nell'Excel la cella «Punti Titoli» era 0 senza formula. Nell'app si applicano i bonus dei titoli (CHA 398).

## Tiro d100 — DECISO
- Prima di tirare il giocatore dichiara **sopra** o **sotto**, poi tira.
- Sopra: naturale > 90 è **critico**, 100 è **supercritico**. Sotto: naturale < 10 è **critico**, 1 è **supercritico**.
- Conta il d100 naturale, non il totale con i modificatori allegati (skill, titoli, talenti). L'esito lo legge il Master.
- Il risultato lo genera il server; il vassoio anima i due d10 fino a quel valore.

## Ancora aperti
- Effetti di Carisma, Saggezza e Shadow: oggi non incidono su nessuna derivata.

## Punti Level up incoerenti — DECISO: si tengono come nell'Excel
Nel foglio Excel Corax è di livello 181. La regola dice: a ogni livello +1 automatico a ogni statistica base e 10 punti liberi. Quindi da livello 1 a 181 ci sono 180 level up:
- colonna «Punti Level Up» di STR, DEX, VIT e INT: dovrebbe essere 180, nel foglio è **185** (5 in più per statistica, 20 in tutto);
- SHA 178, KI 144 e CHA 108 sono più bassi perché sono statistiche avanzate sbloccate più tardi: prendono +1 solo dai livelli successivi allo sblocco;
- punti liberi: 1.800 (180 × 10), giusti; ne ha investiti 1.680, gliene restano 120.

Anche Deniel (110 invece di 109) ed Eric (Saggezza 129) hanno punti in più. Il Master ha deciso di tenerli: restano nell'app e sono annotati sulla statistica.

## Diario dell'avventuriero — proposte (21/11/2026)
- Due visibilità: **privato** (solo l'autore, *nemmeno il Master*) e **gruppo** (tutti). Il Master può eliminare le pagine del gruppo, mai leggere quelle private.
- Gli allegati (tiri, oggetti, titoli, skill, talenti, quest) sono **istantanee**: restano come erano anche se poi l'oggetto viene venduto o il titolo evolve. Un tiro segreto del Master si allega solo a una pagina privata.
- Pagine raggruppate per sessione della campagna; al massimo 1.000 pagine per utente, 12 allegati e 8 tag per pagina.

## Richieste al Master — proposte (21/11/2026)
- Tre tipi: **nuova funzione** dell'app, **nuovo contenuto** (razze, oggetti, classi…), **domanda sul regolamento**.
- Stati: aperta → in esame → risolta | respinta; l'autore può ritirarla finché non è chiusa. Per chiudere serve la risposta del Master.
- Archiviazione automatica: una richiesta chiusa va in archivio dopo **7 giorni** (configurabile); in archivio è solo leggibile.
- Una domanda sul regolamento risolta può diventare una **questione delle regole decisa** (Area Master) con la risposta come decisione.
- Al massimo 20 richieste in attesa per giocatore e 100 messaggi per richiesta.
