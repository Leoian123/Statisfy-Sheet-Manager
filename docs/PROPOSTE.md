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
     *Ancora proposta:* senza talento la mano secondaria fa il 50% del danno; il talento ("Doppia impugnatura", "Ambidestria") scrive la sua percentuale nell'effetto.
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

## Miracoli (`mockup/screens/wizards-magia.js`) — tutti DECISI
13. **I miracoli sono skill**, esattamente come gli incantesimi: entrano tra le skill attive del PG e salgono di Grado.
14. **Scala:** livelli 1–10.
15. **Fede richiesta** = 5 × L × (L+1).
16. **Costo** = 12,5 × L × (L+1) Mana (livello 1 = 25, come Cura Minore).
17. **Scala del favore divino:** −3 Maledizione divina, −2 Rinnegato, −1 In disgrazia, 0 Neutrale, +1 Notato, +2 Favorito, +3 Prescelto, +4 Benedizione divina.
18. **Favore richiesto:** livello 1–2 Notato, 3–5 Favorito, 6–8 Prescelto, 9–10 Benedizione; un grado in più se la natura del miracolo è fuori dal dominio del dio.
19. **Potenza** = base × livello × (1 + Fede/100) × molt. favore: al favore richiesto ×1, +25% per ogni grado in più; un grado sotto ×0,5, due o più gradi sotto 0.
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
28. **EXP e rarità — DECISO:** la rarità della creatura moltiplica l'EXP, come in AdventureQuest.
    - *Ancora proposta:* il moltiplicatore è grado³, lo stesso della forza della creatura (Non Comune ×8, Raro ×27 … Divino ×512). Non ho trovato una formula ufficiale di AdventureQuest per la rarità; un'alternativa più morbida è il grado semplice (×2, ×3 … ×8).

## Ancora aperti
- **Bottino:** della rarità della creatura più rara dell'incontro? (non ancora risposto)
- **Danno della mano secondaria senza talento:** 50%?
- **Moltiplicatore EXP per rarità:** grado³ o grado semplice?
- **Punti Level up di Corax:** vedi sotto.

## Punti Level up di Corax
Nel foglio Excel Corax è di livello 181. La regola dice: a ogni livello +1 automatico a ogni statistica base e 10 punti liberi. Quindi da livello 1 a 181 ci sono 180 level up:
- colonna «Punti Level Up» di STR, DEX, VIT e INT: dovrebbe essere 180, nel foglio è **185** (5 in più per statistica, 20 in tutto);
- SHA 178, KI 144 e CHA 108 sono più bassi perché sono statistiche avanzate sbloccate più tardi: prendono +1 solo dai livelli successivi allo sblocco;
- punti liberi: 1.800 (180 × 10), giusti; ne ha investiti 1.680, gliene restano 120.

Possibili spiegazioni dei +5: Corax era di livello 186 e ha perso 5 livelli morendo (la morte toglie livelli ma il foglio non ha tolto i punti automatici), oppure è un errore di battitura. Da decidere: 185 o 180?
