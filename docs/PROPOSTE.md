# Proposte da approvare (20/11/2026)

Regole e numeri che il regolamento non fissa e che sono stati inventati per i mockup di inventario e Forgia del Master.
Nel mockup sono marcati con il chip **proposta** (passaci sopra per la spiegazione). Approva, correggi o scarta ogni punto.

## Inventario ed equipaggiamento (`mockup/rules.js`, `mockup/screens/inventario.js`)
1. **16 slot del manichino:** Testa, Collo, Spalle, Mantello, Torso, Polsi, Mani, Cintura, Gambe, Piedi, 2 Anelli, 2 Ninnoli, Mano principale, Mano secondaria. Un'arma a due mani occupa entrambe le mani.
2. **Due tipi di bonus degli oggetti:**
   - alle statistiche (es. VIT +8): vanno in una nuova colonna di origine "Oggetti";
   - alle derivate: Difesa, Difesa magica e Blocco entrano nelle formule (Difesa equip × (1 + VIT/100)); gli altri (Evasione, Critico, Velocità…) si sommano dopo la formula.
3. **Requisiti degli oggetti** (livello e statistiche): se non sono soddisfatti l'oggetto non si equipaggia.
4. **Oggetti di esempio:** quelli nuovi di Kelvin (elmo, mantello, stivali, anelli, scudo, zanna) e i loro numeri sono inventati.

## Incantesimi (`mockup/screens/wizards-magia.js`)
5. **Costo:** Mana = 10 × L × (L+1), con L = livello di lancio (livello 1 = 20, come il Dardo Magico; livello 10 = 1.100).
6. **Tempi:** lancio ⌈L/3⌉ turni; ricarica ⌈L/2⌉ turni (minimo 1).
7. **Gravità del backlash:**
   - L × 2 + fattori, al posto del d20;
   - +2 con Spatium o Tempus;
   - +2 con una coppia di sfere Pericolosa, +1 se la peggiore è Debole;
   - se due sfere si giudicano diversamente nella matrice, vale il giudizio più severo.
8. **Modificatori:** uso traverso +1 livello per sfera; metamagie di sfera +2 livelli; Grado consigliato in ogni sfera ≥ livello di lancio, altrimenti conta come overcast.
9. **Sintonia** con più sfere: si somma sfera per sfera, limite ±2.
10. **Efficacia** = livello base + linea di potere + sintonia. La metamagia aumenta costo e rischio, non la potenza.
11. **Danno o cura** = 15–30 × efficacia × molt. danno magico, poi ×1 con 1 sfera, ×0,85 con 2, ×0,75 con 3.

## Miracoli (`mockup/screens/wizards-magia.js`)
12. **Scala:** livelli 1–10.
13. **Fede richiesta** = 5 × L × (L+1).
14. **Costo** = 12,5 × L × (L+1) Mana (livello 1 = 25, come Cura Minore).
15. **Scala del favore divino:** −3 Maledizione divina, −2 Rinnegato, −1 In disgrazia, 0 Neutrale, +1 Notato, +2 Favorito, +3 Prescelto, +4 Benedizione divina. Dal testo vengono solo gli estremi e "Neutrale".
16. **Favore richiesto:** livello 1–2 Notato, 3–5 Favorito, 6–8 Prescelto, 9–10 Benedizione; un grado in più se la natura del miracolo è fuori dal dominio del dio.
17. **Potenza** = base × livello × (1 + Fede/100) × molt. favore:
    - al favore richiesto ×1, +25% per ogni grado in più;
    - un grado sotto ×0,5, due o più gradi sotto 0.
18. **Profilo di ogni dio:** nature affini, tono, voti e tabù.
19. **Conseguenze dell'abuso:** −1 o −2 favore, oppure Maledizione divina.
20. **Fede del PG:** si legge da una statistica "Fede" (FED/FEDE). Nessun PG del mockup ce l'ha.

## Skill, razze, titoli, incontri (`mockup/screens/wizards-master.js`)
21. **Scala delle skill per Grado:** bonus = valore × Grado. Facoltativa una riduzione del costo per Grado in %.
22. **Statistiche razziali:** modificatori da −5 a +5, somma netta tra −2 e +2. Il regolamento non le prevede.
23. **Evoluzione di un titolo:** sostituisce il titolo precedente e ne toglie i bonus.
24. **Difficoltà di un incontro:** (Vita × Danno delle creature) / (Vita × Danno del gruppo).
    - Soglie: Banale < 0,1, Facile < 0,3, Equilibrato < 0,7, Difficile < 1,5, Mortale < 4, oltre Impossibile.
    - Per i PG senza arma registrata si usa una base d'arma media per livello.
25. **EXP:** intera per ogni PG che partecipa, non divisa nel gruppo.
26. **Bottino:** della rarità della creatura più rara.

## Domanda aperta
- **EXP e rarità:** l'EXP del regolamento non dipende dalla rarità della creatura. Un mostro Raro di pari livello dà il 2% come un goblin, pur valendo quanto 27 creature Comuni. Va bene così?
