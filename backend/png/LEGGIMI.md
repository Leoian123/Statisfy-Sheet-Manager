# PNG di STATISFY: preset componibili

Qui stanno gli **stampi** dei PNG, non i PNG. Un preset dice entro quali limiti nasce una persona di un certo genere
(fasce, pesi, rose di spunti, pochi valori fissi) e non ha nome, storia o numeri calcolati. Le **schede** nascono dai
preset quando servono e vivono nel database dell'app (tabella `npcs`, la stessa dell'archivio PNG del Master).
Una **comparsa** è una riga per riempire una piazza: diventa scheda se il forestiero ci torna.

I preset li scrivi e li ritocchi tu, con un editor. Giocando non si modificano mai, e cambiarli non riscrive i PNG già
nati. L'app li rilegge da sola quando un file cambia.

## Cartelle

| File | Che cosa contiene |
|---|---|
| `regole.yaml` | parametri comuni (modello dei numeri, addestramento, profilo, affinità, frequenze di primo contatto, ricchezza, valute), ognuno con FONTE o PROPOSTA |
| `preset/eta/` | `bambino`, `ragazzo`, `adulto`, `anziano` |
| `preset/ruoli/` | `cittadino` (il ruolo di ripiego), `fabbro`, `contadino`, `guardia`, `mercante_ambulante`, `viaggiatore` |
| `preset/razze/` | `umano`, `elfo`, `nano`, `halfling`, `dragonide`, `elementale_minore`, `goblin` |
| `preset/luoghi/` | `insediamenti` (villaggio, città, metropoli), `regni`, `zone` (canone locale: Alba Chiara) |
| `prove.yaml` | i PNG già scritti che i preset devono saper produrre |

Il codice sta in `backend/app/png/`. Le formule non si copiano qui: Vita e danno vengono da `app/rules.py`
(le stesse delle creature di `Combat.txt`), la scala di potere e i gradi di maestria anche.

## Come si compone un PNG

Strati, in quest'ordine: **ruolo → età → razza → luogo → ritocchi**.

- Chi vince: i ritocchi su tutto (il controllo avvisa e obbedisce); la zona e il regno sui preset per ciò che nominano;
  lo strato più specifico sul più generico (dentro un ruolo, `varianti_razza` vince sul file della razza).
- Fra due fasce di livello vale l'intersezione; se è vuota vince la più bassa.
- Un ruolo può ereditare da un altro (`eredita: cittadino`), un livello solo.

Che cosa può fare uno strato:

| Forma | Effetto |
|---|---|
| `corporatura: robusta` | fissa il valore |
| `addestramento: {sposta: -1}` | sposta di un gradino sulla scala |
| `vuole: [a, b]` | aggiunge voci alla rosa |
| `vuole: {solo: [a, b]}` | sostituisce la rosa |
| `vuole: {togli: [a], aggiungi: [c]}` | toglie e aggiunge |
| `atteggiamento: {diffidente: 10}` | sposta le frequenze di primo contatto (nessuna oltre il 50%) |
| `richiede_motivo: testo` | (in una variante) qui non c'è, se non con un motivo |

Rose: `vuole`, `teme`, `difetto`, `forestieri`, `prezzo`, `vita`, `tratti`, `intercalare`. Altri elenchi: `dove`, `sa`,
`dicerie`, `puo_dare`, `no_tipici` (voci di Taratura §5), `malizia` (voci di Taratura §6), `segni`, `limiti`, `usanze`.

Ritocchi: righe libere. `livello 61`, `anni 40`, `STR alta`, `grado VII`, `corporatura robusta`, `nome Gilda Fornari`
diventano campi; ogni altra riga («ex soldato», «vedova da poco») è un **motivo** e giustifica un livello nel terzo alto.

## Come si ritocca un preset: un esempio

Tutti i fabbri escono burberi e chiusi. Si guarda da dove viene: `componi` dice che l'atteggiamento sposta
`indifferente` di +5 per il fabbro e che `burbero` sta nella rosa del difetto di `ruoli/fabbro.yaml`.

Prima:

```yaml
rose:
  difetto: [burbero, orgoglioso fino all'offesa, lento a pagare, non ammette un lavoro venuto male]
atteggiamento: {indifferente: 5, ben_disposto: -2}
```

Dopo:

```yaml
rose:
  difetto: [orgoglioso fino all'offesa, lento a pagare, non ammette un lavoro venuto male, pettegolo coi clienti]
atteggiamento: {interessato: 5}       # PROPOSTA: chi porta lavoro gli interessa
```

Poi `controlla` e qualche `nuovo` con semi diversi. Le schede già nate restano com'erano.

## Comandi

Dalla cartella `backend/` (stampano YAML, non scrivono niente):

```bash
.venv/Scripts/python -m app.png controlla
.venv/Scripts/python -m app.png componi fabbro adulto nano --regno frostland --insediamento citta
.venv/Scripts/python -m app.png nuovo fabbro adulto umano --zona alba-chiara -r "ex soldato della Corona" --seme 11
.venv/Scripts/python -m app.png comparse --zona alba-chiara --quante 6
.venv/Scripts/python -m app.png confronta fabbro
```

Dall'app (solo Master) le stesse operazioni sono in `/api/png` (vedi `docs/API.md`): lì `nuovo` può salvare la scheda
come bozza, e ci sono anche `combattimento`, `promuovi`, `aggiorna` (affinità, memoria, legami, morte) e `riga`.

## Che cosa controlla «controlla»

Errori: chiave fuori schema (con il suggerimento), campo obbligatorio mancante, rosa vuota, frequenze che non sommano
a 100, valore derivato scritto a mano (Vita, danno, Mana), fascia oltre il 99 senza FONTE accanto, bambino con un
mestiere o un blocco di combattimento, rimando a un documento, a un preset o a una voce di Taratura che non esiste.
Un ritocco esplicito riduce gli errori della scheda ad avvisi.

Avvisi: livello nel terzo alto senza motivo, adulto qualunque con il livello sopra gli anni, razza rara nel luogo senza
un perché, due PNG dello stesso luogo con lo stesso difetto e la stessa voce, ritocco che sfonda un limite, ogni
PROPOSTA ancora da confermare e ogni `null`.

Poi gira le prove di `prove.yaml`.

## Ruoli e razze

`generica`: vale il file della razza. `variante`: il ruolo ha un blocco `varianti_razza` per quella razza.
`motivo`: la variante dice di no se non c'è un motivo (un goblin dentro le mura).

| ruolo | umano | elfo | nano | halfling | dragonide | elementale minore | goblin |
|---|---|---|---|---|---|---|---|
| cittadino | generica | generica | generica | generica | generica | variante | motivo |
| fabbro | generica | generica | variante | generica | variante | variante | motivo |
| contadino | generica | generica | generica | generica | generica | variante | motivo |
| guardia | generica | generica | generica | generica | generica | variante | motivo |
| mercante ambulante | generica | generica | generica | generica | generica | variante | motivo |
| viaggiatore | generica | generica | generica | generica | generica | variante | motivo |

Contadino, guardia, mercante e viaggiatore ereditano le varianti del cittadino.

## Quando aggiungere un ruolo

Quando una zona lo chiede e differisce dagli altri in almeno due cose fra fascia di livello, che cosa può dare e che
cosa vuole. Un preset si legge in un minuto: una quarantina di righe, rose di quattro-otto voci, almeno una cosa che
il forestiero può ottenere (`puo_dare`) e almeno un motivo tipico per dire di no (`no_tipici`).
