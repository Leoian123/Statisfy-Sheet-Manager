# Import schede Excel — incoerenze trovate (20/11/2026)

Report della prima esecuzione dell'import (`python -m app.excel_import … --dry-run`) su
`Scheda_Personaggio_STATISFY.xlsx` (Eric, Corax, Deniel, Connor, Dante) e `Scheda_Personaggio_STATISFY_Kelvin.xlsx`.
Esito: tutti e 6 i personaggi importabili, nessun errore grave. I dati vengono importati **così come sono nell'Excel**:
le voci sotto vanno decise dal Master, l'import non corregge nulla. Importando senza `--dry-run` ognuna diventa una
questione «Import Excel — Nome» nella sezione Master.

## Incoerenze da decidere

| PG | Incoerenza | Cosa fa l'import |
|---|---|---|
| Corax | Livello 181 ma «Punti Level Up» = **185** su STR, DEX, VIT, INT (attesi 180) | Importa 185 |
| Corax | CHA: «Punti Titoli» = **0**, ma i titoli elencati danno **150** a CHA (la cella non ha la formula `SUM` come le altre) | Importa 0; i titoli sono importati con i loro bonus |
| Deniel | Livello 110 ma «Punti Level Up» = **110** sulle 4 base (attesi 109) | Importa 110 |
| Eric | WIS (avanzata): «Punti Level Up» = **129**, più dei 109 level up possibili al livello 110 | Importa 129 |
| Eric | Colonna extra **«Punti Imprese Diplomatiche»** (+51 a ogni statistica), non prevista dalle regole | Sommata in «Altro», con nota sulla riga |
| Eric | Titolo segnaposto «placeholder» (Leggendario, senza bonus) | Non importato |
| Eric | Blocco «MANA E VITA»: coefficiente MANA = **15** (regola: 10) | Vale la regola dell'app (50 + INT×10) |
| Connor | Blocco «MANA E VITA»: coefficiente VITA = **20** (regola: 15) | Vale la regola dell'app (100 + VIT×15) |
| Kelvin | Foglio Talenti: «Colossus Slayer» e «Finesse V» dopo una riga vuota, senza origine (sembrano voci future) | Non importati: aggiungerli a mano se ottenuti |

## Differenze rispetto ai dati di seed (l'Excel prevale)

- **Eric**: livello 64 → **110**; classe «Faro della Civiltà» → «Faro della Civilità» (refuso nell'Excel?). Il titolo del foglio (A1) è «Erik».
- **Connor**: livello 52 → **111**; classe Ladro → **Guerriero**.
- **Dante**: livello 88 → **120**.
- **Corax**, **Deniel**, **Kelvin**: livello e classe invariati; statistiche, titoli/talenti e liste riletti dall'Excel.

## Note (informative)

- Derivate: l'Excel usa formule diverse da quelle decise (es. Molt. danno magico INT/50, /60, /80; Molt. danno fisico di Corax
  (STR+DEX)/100; Evasione di Dante (DEX+LCK)/20 anche se il testo dice DEX/20). Le derivate le calcola sempre `rules.py`.
- Derivate e risorse dell'Excel non gestite dall'app, non importate: Bonus Crafting, Regen Ki (Corax), risorsa KI, Bonus Luck (Dante).
- Corax ha 120 punti liberi non investiti (1680 su 1800): coerente con le regole.
- Kelvin: «Altro» di FIN (354) è una formula Excel `(somma + titoli) × 1,2` (talento Finesse IV): importato il valore, la formula è nella nota.
  Inventario senza pesi (40 oggetti) e 15 oggetti senza rarità; skill attive senza costo e cooldown; quest senza rarità.
  Numeri senza intestazione in J9:K15 ignorati.
- Regno, PvP, gilda, equip e magia non sono negli Excel: per i PG già presenti restano quelli del DB.
