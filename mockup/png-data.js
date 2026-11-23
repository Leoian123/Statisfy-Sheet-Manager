/* Dati statici della sezione PNG: copia degli output reali del motore (backend/app/png: componi, nuovo, comparse,
   combattimento, confronta, riga di zona) + catalogo, prove del canone e archivio di zona inventati per il mockup.
   Generato da uno script: il mockup non chiama il backend. */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.pngData = {
 "esempi": {
  "componi_fabbro_nano_frostland_citta": {
   "strati": {
    "ruolo": "fabbro",
    "eta": "adulto",
    "razza": "nano",
    "regno": "frostland",
    "insediamento": "citta",
    "zona": null,
    "ritocchi": []
   },
   "campi": {
    "corporatura": {
     "valore": "robusta",
     "da": "ruolo fabbro",
     "dove": "preset/ruoli/fabbro.yaml:8",
     "nota": "",
     "prima": "normale"
    },
    "addestramento": {
     "valore": "improvvisato",
     "da": "ruolo fabbro",
     "dove": "preset/ruoli/fabbro.yaml:9",
     "nota": "un martello è un'arma, ma lui non è un soldato",
     "prima": "nessuno"
    },
    "profilo.STR": {
     "valore": "alta",
     "da": "ruolo fabbro",
     "dove": "preset/ruoli/fabbro.yaml:10",
     "nota": "",
     "prima": "media"
    },
    "profilo.DEX": {
     "valore": "media",
     "da": "ruolo fabbro",
     "dove": "preset/ruoli/fabbro.yaml:10",
     "nota": "",
     "prima": "media"
    },
    "profilo.VIT": {
     "valore": "alta",
     "da": "razza nano",
     "dove": "preset/razze/nano.yaml:8",
     "nota": "«resistenza leggendaria»: FONTE Ambientazione.txt; il gradino è PROPOSTA",
     "sposta": 1,
     "prima": "alta"
    },
    "profilo.INT": {
     "valore": "media",
     "da": "ruolo fabbro",
     "dove": "preset/ruoli/fabbro.yaml:10",
     "nota": "",
     "prima": "media"
    },
    "mestiere.nome": {
     "valore": "Forgia",
     "da": "ruolo fabbro",
     "dove": "preset/ruoli/fabbro.yaml:11",
     "nota": "Forgia: statistica artigianale (Progressione §1); il grado è PROPOSTA",
     "prima": "uno dei lavori del luogo"
    },
    "mestiere.grado": {
     "valore": [
      "VII",
      "X"
     ],
     "da": "fabbro · variante nano",
     "dove": "preset/ruoli/fabbro.yaml:37",
     "nota": "PROPOSTA",
     "sposta": 1,
     "prima": [
      "VI",
      "IX"
     ]
    },
    "ricchezza": {
     "valore": [
      "modesto",
      "agiato"
     ],
     "da": "ruolo fabbro",
     "dove": "preset/ruoli/fabbro.yaml:12",
     "nota": "",
     "prima": [
      "povero",
      "modesto"
     ]
    },
    "conta": {
     "valore": "qualunque",
     "da": "ruolo cittadino",
     "dove": "preset/ruoli/cittadino.yaml:13",
     "nota": ""
    },
    "giornata": {
     "valore": "alla forgia dall'alba; con il ferro caldo non si ferma a parlare",
     "da": "ruolo fabbro",
     "dove": "preset/ruoli/fabbro.yaml:14",
     "nota": "",
     "prima": "lavora dall'alba; la sera è stanco e parla più volentieri"
    },
    "voce": {
     "valore": "asciutto; parla del lavoro; giudica la gente dagli attrezzi che porta",
     "da": "ruolo fabbro",
     "dove": "preset/ruoli/fabbro.yaml:33",
     "nota": "",
     "prima": "parlato di tutti i giorni; chiama posti e persone per nome, come chi non si è mai mosso da lì"
    },
    "note": {
     "valore": "alleati tradizionali degli umani",
     "da": "razza nano",
     "dove": "preset/razze/nano.yaml:16",
     "nota": "FONTE Ambientazione.txt"
    },
    "livello": {
     "valore": [
      40,
      99
     ],
     "da": "ruolo fabbro (citta)",
     "dove": "preset/ruoli/fabbro.yaml:6",
     "nota": "PROPOSTA: nessun fabbro di città è ancora scritto"
    },
    "anni": {
     "valore": [
      18,
      59
     ],
     "da": "età adulto",
     "dove": "preset/eta/adulto.yaml:3",
     "nota": "PROPOSTA"
    },
    "longevita": {
     "valore": null,
     "da": "razza nano",
     "dove": "preset/razze/nano.yaml:6",
     "nota": "i documenti non lo dicono: si usa quella umana e il controllo avvisa"
    },
    "moneta": {
     "valore": null,
     "da": "regno frostland",
     "dove": "preset/luoghi/regni.yaml:23",
     "nota": ""
    },
    "conta_nel_regno": {
     "valore": [
      "forza",
      "clan"
     ],
     "da": "regno frostland",
     "dove": "preset/luoghi/regni.yaml:26",
     "nota": "FONTE Status Sociale §3"
    },
    "voci_girano": {
     "valore": null,
     "da": "insediamento citta",
     "dove": "preset/luoghi/insediamenti.yaml:8",
     "nota": ""
    },
    "affinita_iniziale": {
     "valore": -1,
     "da": "regole",
     "dove": "regole.yaml:42",
     "nota": "FONTE Taratura §4"
    }
   },
   "elenchi": {
    "vuole": [
     {
      "voce": "ferro buono a un prezzo onesto",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:24",
      "nota": ""
     },
     {
      "voce": "un garzone che resti",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:24",
      "nota": ""
     },
     {
      "voce": "finire la commessa in tempo",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:24",
      "nota": ""
     },
     {
      "voce": "un lavoro di cui andare fiero",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:24",
      "nota": ""
     },
     {
      "voce": "arrivare a fine mese",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:7",
      "nota": ""
     },
     {
      "voce": "sistemare un figlio",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:7",
      "nota": ""
     },
     {
      "voce": "saldare un debito",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:7",
      "nota": ""
     },
     {
      "voce": "fare bella figura coi vicini",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:7",
      "nota": ""
     },
     {
      "voce": "un pezzo degno del nome del clan",
      "da": "fabbro · variante nano",
      "dove": "preset/ruoli/fabbro.yaml:39",
      "nota": "Ambientazione.txt, «Nani delle montagne»"
     }
    ],
    "teme": [
     {
      "voce": "la mano che comincia a tremare",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:25",
      "nota": ""
     },
     {
      "voce": "il debito col fornitore",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:25",
      "nota": ""
     },
     {
      "voce": "un concorrente in paese",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:25",
      "nota": ""
     },
     {
      "voce": "il fuoco in bottega",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:25",
      "nota": ""
     },
     {
      "voce": "perdere il lavoro",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:8",
      "nota": ""
     },
     {
      "voce": "una malattia in casa",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:8",
      "nota": ""
     },
     {
      "voce": "chi comanda",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:8",
      "nota": ""
     },
     {
      "voce": "le chiacchiere sul suo conto",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:8",
      "nota": ""
     },
     {
      "voce": "il disonore di un lavoro mediocre",
      "da": "fabbro · variante nano",
      "dove": "preset/ruoli/fabbro.yaml:40",
      "nota": "Ambientazione.txt, «Nani delle montagne»"
     }
    ],
    "difetto": [
     {
      "voce": "burbero",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:26",
      "nota": ""
     },
     {
      "voce": "orgoglioso fino all'offesa",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:26",
      "nota": ""
     },
     {
      "voce": "lento a pagare",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:26",
      "nota": ""
     },
     {
      "voce": "non ammette un lavoro venuto male",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:26",
      "nota": ""
     },
     {
      "voce": "avaro",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:9",
      "nota": "FONTE Taratura §2"
     },
     {
      "voce": "vanitoso",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:9",
      "nota": "FONTE Taratura §2"
     },
     {
      "voce": "pettegolo",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:9",
      "nota": "FONTE Taratura §2"
     },
     {
      "voce": "codardo",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:9",
      "nota": "FONTE Taratura §2"
     },
     {
      "voce": "rancoroso",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:9",
      "nota": "FONTE Taratura §2"
     },
     {
      "voce": "bugiardo",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:9",
      "nota": "FONTE Taratura §2"
     }
    ],
    "forestieri": [
     {
      "voce": "inviati degli dèi",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:10",
      "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
     },
     {
      "voce": "non-morti",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:10",
      "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
     },
     {
      "voce": "creature della magia antica",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:10",
      "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
     },
     {
      "voce": "spiriti incarnati",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:10",
      "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
     },
     {
      "voce": "viaggiatori",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:10",
      "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
     },
     {
      "voce": "un problema di ordine pubblico",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:10",
      "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
     },
     {
      "voce": "gente che paga",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:10",
      "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
     },
     {
      "voce": "li misura dal valore in battaglia",
      "da": "razza nano",
      "dove": "preset/razze/nano.yaml:12",
      "nota": "FONTE Ambientazione.txt"
     }
    ],
    "prezzo": [
     {
      "voce": "denaro",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:27",
      "nota": ""
     },
     {
      "voce": "materiale",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:27",
      "nota": ""
     },
     {
      "voce": "una consegna pesante",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:27",
      "nota": ""
     },
     {
      "voce": "un turno ai mantici",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:27",
      "nota": ""
     }
    ],
    "vita": [
     {
      "voce": "una commessa grossa in ritardo",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:28",
      "nota": ""
     },
     {
      "voce": "il garzone se n'è andato",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:28",
      "nota": ""
     },
     {
      "voce": "il carbone è rincarato",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:28",
      "nota": ""
     },
     {
      "voce": "un lavoro tornato indietro",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:28",
      "nota": ""
     }
    ],
    "tratti": [
     {
      "voce": "onesto",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:29",
      "nota": ""
     },
     {
      "voce": "burbero",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:29",
      "nota": ""
     },
     {
      "voce": "paziente col ferro",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:29",
      "nota": ""
     },
     {
      "voce": "impaziente con la gente",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:29",
      "nota": ""
     },
     {
      "voce": "pratico",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:11",
      "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
     },
     {
      "voce": "diffidente",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:11",
      "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
     },
     {
      "voce": "gentile",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:11",
      "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
     },
     {
      "voce": "stanco",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:11",
      "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
     },
     {
      "voce": "ansioso",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:11",
      "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
     },
     {
      "voce": "rigido",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:11",
      "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
     },
     {
      "voce": "mite",
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:11",
      "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
     },
     {
      "voce": "orgoglioso",
      "da": "razza nano",
      "dove": "preset/razze/nano.yaml:13",
      "nota": "PROPOSTA"
     },
     {
      "voce": "leale al clan",
      "da": "razza nano",
      "dove": "preset/razze/nano.yaml:13",
      "nota": "PROPOSTA"
     },
     {
      "voce": "tenace",
      "da": "razza nano",
      "dove": "preset/razze/nano.yaml:13",
      "nota": "PROPOSTA"
     }
    ],
    "intercalare": [
     {
      "voce": "«vediamo l'attrezzo»",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:30",
      "nota": "PROPOSTA"
     },
     {
      "voce": "«il ferro non mente»",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:30",
      "nota": "PROPOSTA"
     },
     {
      "voce": "«e chi paga?»",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:30",
      "nota": "PROPOSTA"
     },
     {
      "voce": "«roba da mercato»",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:30",
      "nota": "PROPOSTA"
     }
    ],
    "dove": [
     {
      "voce": "alla forgia dall'alba",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:13",
      "nota": ""
     },
     {
      "voce": "al mercato per il ferro e il carbone",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:13",
      "nota": ""
     }
    ],
    "sa": [
     {
      "voce": "il suo lavoro",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:16",
      "nota": ""
     },
     {
      "voce": "il suo vicinato",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:16",
      "nota": ""
     },
     {
      "voce": "chi deve soldi a chi",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:16",
      "nota": ""
     },
     {
      "voce": "metalli e tempra",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:15",
      "nota": ""
     },
     {
      "voce": "chi in zona porta armi e quali",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:15",
      "nota": ""
     },
     {
      "voce": "quanto vale davvero un oggetto di metallo",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:15",
      "nota": ""
     }
    ],
    "dicerie": [
     {
      "voce": "la politica",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:17",
      "nota": ""
     },
     {
      "voce": "la magia",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:17",
      "nota": ""
     },
     {
      "voce": "i posti dove non è mai stato",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:17",
      "nota": ""
     },
     {
      "voce": "da dove arriva il ferro quest'anno",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:16",
      "nota": ""
     },
     {
      "voce": "che cosa si forgia in città",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:16",
      "nota": ""
     }
    ],
    "puo_dare": [
     {
      "voce": "riparazioni (5-20 corone in un villaggio)",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:19",
      "nota": "prezzi: FONTE Zona_Alba_Chiara"
     },
     {
      "voce": "armi e attrezzi comuni (una spada di ferro, 80 corone)",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:20",
      "nota": "prezzi: FONTE Zona_Alba_Chiara"
     },
     {
      "voce": "affilatura",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:21",
      "nota": "prezzi: FONTE Zona_Alba_Chiara"
     },
     {
      "voce": "una prima lezione di mestiere, a chi si guadagna il posto ai mantici",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:22",
      "nota": "prezzi: FONTE Zona_Alba_Chiara"
     }
    ],
    "no_tipici": [
     {
      "voce": "vuole essere pagato",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:32",
      "nota": "Taratura §5"
     },
     {
      "voce": "orgoglio",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:32",
      "nota": "Taratura §5"
     },
     {
      "voce": "ha già promesso ad altri",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:32",
      "nota": "Taratura §5"
     }
    ],
    "malizia": [
     {
      "voce": "sovrapprezzo al forestiero",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:24",
      "nota": "Taratura §6"
     },
     {
      "voce": "mezza verità",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:24",
      "nota": "Taratura §6"
     },
     {
      "voce": "pettegolezzo storto",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:24",
      "nota": "Taratura §6"
     }
    ],
    "segni": [
     {
      "voce": "la storia della stirpe incisa negli ornamenti della barba",
      "da": "razza nano",
      "dove": "preset/razze/nano.yaml:10",
      "nota": "FONTE Ambientazione.txt"
     },
     {
      "voce": "rune sugli strumenti",
      "da": "razza nano",
      "dove": "preset/razze/nano.yaml:10",
      "nota": "FONTE Ambientazione.txt"
     }
    ],
    "legami_tipici": [
     {
      "voce": "il clan",
      "da": "razza nano",
      "dove": "preset/razze/nano.yaml:15",
      "nota": "FONTE Ambientazione.txt: clan patriarcali"
     },
     {
      "voce": "il patriarca",
      "da": "razza nano",
      "dove": "preset/razze/nano.yaml:15",
      "nota": "FONTE Ambientazione.txt: clan patriarcali"
     }
    ]
   },
   "atteggiamento": {
    "frequenze": {
     "ostile": 10,
     "diffidente": 29,
     "indifferente": 39,
     "interessato": 19,
     "ben_disposto": 3
    },
    "storia": [
     {
      "da": "regole",
      "dove": "regole.yaml:34",
      "nota": "FONTE Taratura §3"
     },
     {
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:31",
      "nota": "PROPOSTA: ha da lavorare",
      "sposta": {
       "indifferente": 5,
       "ben_disposto": -2
      }
     }
    ]
   },
   "canone": [
    "Marta Orsini",
    "Lv 22; Nessa",
    "Lv 29; Piero Orso",
    "Lv 34 (Zona_Alba_Chiara)",
    "Bram Ferraguto",
    "Lv 61 (Zona_Alba_Chiara)"
   ],
   "motivo_richiesto": [],
   "avvisi": [
    "razza nano: la longevità non è scritta; uso quella umana"
   ],
   "errori": []
  },
  "nuovo_fabbro_alba_chiara": {
   "scheda": {
    "id": "alba-chiara/mira-vacchetti",
    "dettaglio": "scheda",
    "provenienza": {
     "ruolo": "fabbro",
     "eta": "adulto",
     "razza": "umano",
     "luogo": "valeria/alba-chiara",
     "insediamento": "villaggio",
     "ritocchi": [
      "ex soldato della Corona"
     ],
     "seme": 11
    },
    "nome": "Mira Vacchetti",
    "genere": "f",
    "livello": 59,
    "ruolo": "fabbro",
    "razza": "umano",
    "eta": {
     "fase": "adulto",
     "apparente": 53,
     "vera": 53
    },
    "luogo": "valeria/alba-chiara",
    "conta": "qualunque",
    "tratti": [
     "rancoroso",
     "stanco"
    ],
    "vuole": "un lavoro di cui andare fiero",
    "teme": "un concorrente in paese",
    "difetto": "rancoroso",
    "forestieri": "spiriti incarnati",
    "prezzo": "materiale",
    "vita": "una commessa grossa in ritardo",
    "contraddizione": null,
    "voce": "asciutto; parla del lavoro; giudica la gente dagli attrezzi che porta; dice spesso «e chi paga?»",
    "sa": [
     "il suo lavoro",
     "il suo vicinato",
     "chi deve soldi a chi",
     "metalli e tempra",
     "chi in zona porta armi e quali",
     "quanto vale davvero un oggetto di metallo"
    ],
    "dicerie": [
     "la politica",
     "la magia",
     "i posti dove non è mai stato",
     "da dove arriva il ferro quest'anno",
     "che cosa si forgia in città"
    ],
    "puo_dare": [
     "riparazioni (5-20 corone in un villaggio)",
     "armi e attrezzi comuni (una spada di ferro, 80 corone)",
     "affilatura",
     "una prima lezione di mestiere, a chi si guadagna il posto ai mantici"
    ],
    "no_tipici": [
     "vuole essere pagato",
     "orgoglio",
     "ha già promesso ad altri"
    ],
    "malizia": [
     "sovrapprezzo al forestiero",
     "mezza verità",
     "pettegolezzo storto"
    ],
    "segni": [],
    "limiti": [],
    "corporatura": "robusta",
    "addestramento": "improvvisato",
    "profilo": {
     "STR": "alta",
     "DEX": "media",
     "VIT": "alta",
     "INT": "media"
    },
    "mestiere": {
     "nome": "Forgia",
     "grado": "VI"
    },
    "ricchezza": "modesto",
    "motivo": "ex soldato della Corona",
    "stato_iniziale": {
     "vivo": true,
     "atteggiamento_iniziale": "indifferente",
     "affinita": -1,
     "memoria": [],
     "legami": []
    },
    "stato": {},
    "origine": {
     "genere": "pescato",
     "livello": "ruolo fabbro (villaggio)",
     "anni": "età adulto",
     "nome": "stile dei nomi (regno valeria)",
     "vuole": "pescato da ruolo fabbro",
     "teme": "pescato da ruolo fabbro",
     "difetto": "pescato da età adulto",
     "forestieri": "pescato da età adulto",
     "prezzo": "pescato da ruolo fabbro",
     "vita": "pescato da ruolo fabbro",
     "tratti": "difetto pescato + età adulto",
     "voce": "ruolo fabbro + intercalare da ruolo fabbro",
     "mestiere": "ruolo fabbro; grado da ruolo fabbro",
     "corporatura": "ruolo fabbro",
     "addestramento": "ruolo fabbro",
     "conta": "ruolo cittadino",
     "profilo": "STR da ruolo fabbro, DEX da ruolo fabbro, VIT da ruolo fabbro, INT da ruolo fabbro"
    },
    "da_ritoccare": [
     "vuole",
     "teme",
     "difetto",
     "forestieri",
     "prezzo",
     "vita",
     "contraddizione"
    ],
    "ritratto": {
     "descrizione": "Umano, adulta, sui 53 anni all'aspetto. Corporatura robusta. Fabbro, Forgia. Di solito alla forgia dall'alba. Si vede che è rancoroso e stanco. Vestiti semplici e puliti.",
     "immagini": []
    },
    "contraddizione_spunto": "smentisci «rancoroso» o «stanco»: in che cosa questa persona fa il contrario?"
   },
   "errori": [],
   "avvisi": [],
   "composizione": {
    "strati": {
     "ruolo": "fabbro",
     "eta": "adulto",
     "razza": "umano",
     "regno": "valeria",
     "insediamento": "villaggio",
     "zona": "alba-chiara",
     "ritocchi": [
      "ex soldato della Corona"
     ]
    },
    "campi": {
     "corporatura": {
      "valore": "robusta",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:8",
      "nota": "",
      "prima": "normale"
     },
     "addestramento": {
      "valore": "improvvisato",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:9",
      "nota": "un martello è un'arma, ma lui non è un soldato",
      "prima": "nessuno"
     },
     "profilo.STR": {
      "valore": "alta",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:10",
      "nota": "",
      "prima": "media"
     },
     "profilo.DEX": {
      "valore": "media",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:10",
      "nota": "",
      "prima": "media"
     },
     "profilo.VIT": {
      "valore": "alta",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:10",
      "nota": "",
      "prima": "media"
     },
     "profilo.INT": {
      "valore": "media",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:10",
      "nota": "",
      "prima": "media"
     },
     "mestiere.nome": {
      "valore": "Forgia",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:11",
      "nota": "Forgia: statistica artigianale (Progressione §1); il grado è PROPOSTA",
      "prima": "uno dei lavori del luogo"
     },
     "mestiere.grado": {
      "valore": [
       "VI",
       "IX"
      ],
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:11",
      "nota": "Forgia: statistica artigianale (Progressione §1); il grado è PROPOSTA",
      "prima": [
       "III",
       "VII"
      ]
     },
     "ricchezza": {
      "valore": [
       "modesto",
       "agiato"
      ],
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:12",
      "nota": "",
      "prima": [
       "povero",
       "modesto"
      ]
     },
     "conta": {
      "valore": "qualunque",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:13",
      "nota": ""
     },
     "giornata": {
      "valore": "alla forgia dall'alba; con il ferro caldo non si ferma a parlare",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:14",
      "nota": "",
      "prima": "lavora dall'alba; la sera è stanco e parla più volentieri"
     },
     "voce": {
      "valore": "asciutto; parla del lavoro; giudica la gente dagli attrezzi che porta",
      "da": "ruolo fabbro",
      "dove": "preset/ruoli/fabbro.yaml:33",
      "nota": "",
      "prima": "parlato di tutti i giorni; chiama posti e persone per nome, come chi non si è mai mosso da lì"
     },
     "livello": {
      "valore": [
       30,
       65
      ],
      "da": "ruolo fabbro (villaggio)",
      "dove": "preset/ruoli/fabbro.yaml:5",
      "nota": "FONTE Bram Ferraguto, Lv 61 (ex soldato: sta nella parte alta); il minimo è PROPOSTA"
     },
     "anni": {
      "valore": [
       18,
       59
      ],
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:3",
      "nota": "PROPOSTA"
     },
     "longevita": {
      "valore": {
       "tipo": "umana",
       "fattore": 1
      },
      "da": "razza umano",
      "dove": "preset/razze/umano.yaml:5",
      "nota": ""
     },
     "moneta": {
      "valore": "corona",
      "da": "regno valeria",
      "dove": "preset/luoghi/regni.yaml:8",
      "nota": "FONTE Ambientazione.txt e Zona_Alba_Chiara"
     },
     "conta_nel_regno": {
      "valore": [
       "onore",
       "commercio"
      ],
      "da": "regno valeria",
      "dove": "preset/luoghi/regni.yaml:11",
      "nota": "FONTE Status Sociale §3"
     },
     "voci_girano": {
      "valore": "tutti sanno tutto entro sera",
      "da": "insediamento villaggio",
      "dove": "preset/luoghi/insediamenti.yaml:4",
      "nota": "FONTE Zona_Alba_Chiara"
     },
     "affinita_iniziale": {
      "valore": -1,
      "da": "zona alba-chiara",
      "dove": "preset/luoghi/zone.yaml:10",
      "nota": "FONTE Zona_Alba_Chiara: un forestiero parte da -1"
     }
    },
    "elenchi": {
     "vuole": [
      {
       "voce": "ferro buono a un prezzo onesto",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:24",
       "nota": ""
      },
      {
       "voce": "un garzone che resti",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:24",
       "nota": ""
      },
      {
       "voce": "finire la commessa in tempo",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:24",
       "nota": ""
      },
      {
       "voce": "un lavoro di cui andare fiero",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:24",
       "nota": ""
      },
      {
       "voce": "arrivare a fine mese",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:7",
       "nota": ""
      },
      {
       "voce": "sistemare un figlio",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:7",
       "nota": ""
      },
      {
       "voce": "saldare un debito",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:7",
       "nota": ""
      },
      {
       "voce": "fare bella figura coi vicini",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:7",
       "nota": ""
      }
     ],
     "teme": [
      {
       "voce": "la mano che comincia a tremare",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:25",
       "nota": ""
      },
      {
       "voce": "il debito col fornitore",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:25",
       "nota": ""
      },
      {
       "voce": "un concorrente in paese",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:25",
       "nota": ""
      },
      {
       "voce": "il fuoco in bottega",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:25",
       "nota": ""
      },
      {
       "voce": "perdere il lavoro",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:8",
       "nota": ""
      },
      {
       "voce": "una malattia in casa",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:8",
       "nota": ""
      },
      {
       "voce": "chi comanda",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:8",
       "nota": ""
      },
      {
       "voce": "le chiacchiere sul suo conto",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:8",
       "nota": ""
      }
     ],
     "difetto": [
      {
       "voce": "burbero",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:26",
       "nota": ""
      },
      {
       "voce": "orgoglioso fino all'offesa",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:26",
       "nota": ""
      },
      {
       "voce": "lento a pagare",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:26",
       "nota": ""
      },
      {
       "voce": "non ammette un lavoro venuto male",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:26",
       "nota": ""
      },
      {
       "voce": "avaro",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      },
      {
       "voce": "vanitoso",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      },
      {
       "voce": "pettegolo",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      },
      {
       "voce": "codardo",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      },
      {
       "voce": "rancoroso",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      },
      {
       "voce": "bugiardo",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      }
     ],
     "forestieri": [
      {
       "voce": "inviati degli dèi",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:10",
       "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
      },
      {
       "voce": "non-morti",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:10",
       "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
      },
      {
       "voce": "creature della magia antica",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:10",
       "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
      },
      {
       "voce": "spiriti incarnati",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:10",
       "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
      },
      {
       "voce": "viaggiatori",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:10",
       "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
      },
      {
       "voce": "un problema di ordine pubblico",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:10",
       "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
      },
      {
       "voce": "gente che paga",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:10",
       "nota": "FONTE Sistema_PNG §3 e Zona_Alba_Chiara"
      }
     ],
     "prezzo": [
      {
       "voce": "denaro",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:27",
       "nota": ""
      },
      {
       "voce": "materiale",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:27",
       "nota": ""
      },
      {
       "voce": "una consegna pesante",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:27",
       "nota": ""
      },
      {
       "voce": "un turno ai mantici",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:27",
       "nota": ""
      }
     ],
     "vita": [
      {
       "voce": "una commessa grossa in ritardo",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:28",
       "nota": ""
      },
      {
       "voce": "il garzone se n'è andato",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:28",
       "nota": ""
      },
      {
       "voce": "il carbone è rincarato",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:28",
       "nota": ""
      },
      {
       "voce": "un lavoro tornato indietro",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:28",
       "nota": ""
      }
     ],
     "tratti": [
      {
       "voce": "onesto",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:29",
       "nota": ""
      },
      {
       "voce": "burbero",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:29",
       "nota": ""
      },
      {
       "voce": "paziente col ferro",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:29",
       "nota": ""
      },
      {
       "voce": "impaziente con la gente",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:29",
       "nota": ""
      },
      {
       "voce": "pratico",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "diffidente",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "gentile",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "stanco",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "ansioso",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "rigido",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "mite",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      }
     ],
     "intercalare": [
      {
       "voce": "«vediamo l'attrezzo»",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:30",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«il ferro non mente»",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:30",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«e chi paga?»",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:30",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«roba da mercato»",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:30",
       "nota": "PROPOSTA"
      }
     ],
     "dove": [
      {
       "voce": "alla forgia dall'alba",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:13",
       "nota": ""
      },
      {
       "voce": "al mercato per il ferro e il carbone",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:13",
       "nota": ""
      }
     ],
     "sa": [
      {
       "voce": "il suo lavoro",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "il suo vicinato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "chi deve soldi a chi",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "metalli e tempra",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:15",
       "nota": ""
      },
      {
       "voce": "chi in zona porta armi e quali",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:15",
       "nota": ""
      },
      {
       "voce": "quanto vale davvero un oggetto di metallo",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:15",
       "nota": ""
      }
     ],
     "dicerie": [
      {
       "voce": "la politica",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:17",
       "nota": ""
      },
      {
       "voce": "la magia",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:17",
       "nota": ""
      },
      {
       "voce": "i posti dove non è mai stato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:17",
       "nota": ""
      },
      {
       "voce": "da dove arriva il ferro quest'anno",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:16",
       "nota": ""
      },
      {
       "voce": "che cosa si forgia in città",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:16",
       "nota": ""
      }
     ],
     "puo_dare": [
      {
       "voce": "riparazioni (5-20 corone in un villaggio)",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:19",
       "nota": "prezzi: FONTE Zona_Alba_Chiara"
      },
      {
       "voce": "armi e attrezzi comuni (una spada di ferro, 80 corone)",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:20",
       "nota": "prezzi: FONTE Zona_Alba_Chiara"
      },
      {
       "voce": "affilatura",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:21",
       "nota": "prezzi: FONTE Zona_Alba_Chiara"
      },
      {
       "voce": "una prima lezione di mestiere, a chi si guadagna il posto ai mantici",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:22",
       "nota": "prezzi: FONTE Zona_Alba_Chiara"
      }
     ],
     "no_tipici": [
      {
       "voce": "vuole essere pagato",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:32",
       "nota": "Taratura §5"
      },
      {
       "voce": "orgoglio",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:32",
       "nota": "Taratura §5"
      },
      {
       "voce": "ha già promesso ad altri",
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:32",
       "nota": "Taratura §5"
      }
     ],
     "malizia": [
      {
       "voce": "sovrapprezzo al forestiero",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:24",
       "nota": "Taratura §6"
      },
      {
       "voce": "mezza verità",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:24",
       "nota": "Taratura §6"
      },
      {
       "voce": "pettegolezzo storto",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:24",
       "nota": "Taratura §6"
      }
     ]
    },
    "atteggiamento": {
     "frequenze": {
      "ostile": 10,
      "diffidente": 29,
      "indifferente": 39,
      "interessato": 19,
      "ben_disposto": 3
     },
     "storia": [
      {
       "da": "regole",
       "dove": "regole.yaml:34",
       "nota": "FONTE Taratura §3"
      },
      {
       "da": "ruolo fabbro",
       "dove": "preset/ruoli/fabbro.yaml:31",
       "nota": "PROPOSTA: ha da lavorare",
       "sposta": {
        "indifferente": 5,
        "ben_disposto": -2
       }
      }
     ]
    },
    "canone": [
     "Marta Orsini",
     "Lv 22; Nessa",
     "Lv 29; Piero Orso",
     "Lv 34 (Zona_Alba_Chiara)",
     "Bram Ferraguto",
     "Lv 61 (Zona_Alba_Chiara)"
    ],
    "motivo_richiesto": [],
    "avvisi": [],
    "errori": []
   },
   "seme": 11
  },
  "nuovo_bambino": {
   "scheda": {
    "id": "alba-chiara/corrado-vacchetti",
    "dettaglio": "scheda",
    "provenienza": {
     "ruolo": "cittadino",
     "eta": "bambino",
     "razza": "umano",
     "luogo": "valeria/alba-chiara",
     "insediamento": "villaggio",
     "ritocchi": [],
     "seme": 3
    },
    "nome": "Corrado Vacchetti",
    "genere": "m",
    "livello": 5,
    "ruolo": "cittadino",
    "razza": "umano",
    "eta": {
     "fase": "bambino",
     "apparente": 7,
     "vera": 7
    },
    "luogo": "valeria/alba-chiara",
    "conta": "nuovo arrivato",
    "tratti": [
     "spaccone",
     "testardo"
    ],
    "vuole": "essere preso sul serio",
    "teme": "essere scoperto a fare la spia",
    "difetto": "spaccone",
    "forestieri": "mostri",
    "prezzo": "essere portato con sé",
    "vita": "una punizione da scontare",
    "contraddizione": null,
    "voce": "parla a raffica, mescola quello che ha visto con quello che ha sentito; dice spesso «Luxor ci scampi»",
    "sa": [
     "il suo lavoro",
     "il suo vicinato",
     "chi deve soldi a chi",
     "chi abita dove",
     "dove non si deve andare",
     "quello che ha visto e non doveva"
    ],
    "dicerie": [
     "i discorsi dei grandi capiti a metà"
    ],
    "puo_dare": [
     "indizi",
     "commissioni",
     "la voce che gira fra i bambini"
    ],
    "no_tipici": [
     "ha paura di chi comanda",
     "nasconde qualcosa"
    ],
    "malizia": [
     "riferire",
     "pettegolezzo storto"
    ],
    "segni": [],
    "limiti": [],
    "corporatura": "fragile",
    "addestramento": "nessuno",
    "profilo": {
     "STR": "bassa",
     "DEX": "media",
     "VIT": "bassa",
     "INT": "media"
    },
    "mestiere": null,
    "ricchezza": "povero",
    "motivo": null,
    "stato_iniziale": {
     "vivo": true,
     "atteggiamento_iniziale": "indifferente",
     "affinita": -1,
     "memoria": [],
     "legami": []
    },
    "stato": {},
    "origine": {
     "genere": "pescato",
     "livello": "età bambino (segue gli anni)",
     "anni": "età bambino",
     "nome": "stile dei nomi (regno valeria)",
     "vuole": "pescato da età bambino",
     "teme": "pescato da età bambino",
     "difetto": "pescato da età bambino",
     "forestieri": "pescato da età bambino",
     "prezzo": "pescato da età bambino",
     "vita": "pescato da età bambino",
     "tratti": "difetto pescato + età bambino",
     "voce": "età bambino + intercalare da ruolo cittadino",
     "corporatura": "età bambino",
     "addestramento": "età bambino",
     "conta": "età bambino",
     "profilo": "STR da età bambino, DEX da età bambino, VIT da età bambino, INT da età bambino"
    },
    "da_ritoccare": [
     "vuole",
     "teme",
     "difetto",
     "forestieri",
     "prezzo",
     "vita",
     "contraddizione"
    ],
    "ritratto": {
     "descrizione": "Umano, bambino, sui 7 anni all'aspetto. Corporatura fragile. Cittadino. Di solito mercato. Si vede che è spaccone e testardo. Vestiti consumati.",
     "immagini": []
    },
    "contraddizione_spunto": "smentisci «spaccone» o «testardo»: in che cosa questa persona fa il contrario?"
   },
   "errori": [],
   "avvisi": [],
   "composizione": {
    "strati": {
     "ruolo": "cittadino",
     "eta": "bambino",
     "razza": "umano",
     "regno": "valeria",
     "insediamento": "villaggio",
     "zona": "alba-chiara",
     "ritocchi": []
    },
    "campi": {
     "corporatura": {
      "valore": "fragile",
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:6",
      "nota": "PROPOSTA",
      "prima": "normale"
     },
     "addestramento": {
      "valore": "nessuno",
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:7",
      "nota": "non è un bersaglio",
      "prima": "nessuno"
     },
     "profilo.STR": {
      "valore": "bassa",
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:9",
      "nota": "PROPOSTA",
      "prima": "media"
     },
     "profilo.DEX": {
      "valore": "media",
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:9",
      "nota": "PROPOSTA",
      "prima": "media"
     },
     "profilo.VIT": {
      "valore": "bassa",
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:9",
      "nota": "PROPOSTA",
      "prima": "media"
     },
     "profilo.INT": {
      "valore": "media",
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:9",
      "nota": "PROPOSTA",
      "prima": "media"
     },
     "mestiere.nome": {
      "valore": null,
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:8",
      "nota": "al più aiuta in famiglia: eredita `sa` dal ruolo, non `puo_dare`",
      "prima": "uno dei lavori del luogo"
     },
     "mestiere.grado": {
      "valore": null,
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:8",
      "nota": "al più aiuta in famiglia: eredita `sa` dal ruolo, non `puo_dare`",
      "prima": [
       "III",
       "VII"
      ]
     },
     "ricchezza": {
      "valore": "povero",
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:10",
      "nota": "",
      "prima": [
       "povero",
       "modesto"
      ]
     },
     "conta": {
      "valore": "nuovo arrivato",
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:11",
      "nota": "PROPOSTA: nel gruppo pesa poco (Status Sociale §3)",
      "prima": "qualunque"
     },
     "giornata": {
      "valore": "lavora dall'alba; la sera è stanco e parla più volentieri",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:15",
      "nota": ""
     },
     "voce": {
      "valore": "parla a raffica, mescola quello che ha visto con quello che ha sentito",
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:25",
      "nota": "",
      "prima": "parlato di tutti i giorni; chiama posti e persone per nome, come chi non si è mai mosso da lì"
     },
     "livello": {
      "valore": [
       3,
       12
      ],
      "da": "età bambino (segue gli anni)",
      "dove": "preset/eta/bambino.yaml:5",
      "nota": "PROPOSTA: fra metà degli anni e gli anni che ha (Lia Orso, Lv 11)",
      "prima": [
       3,
       35
      ]
     },
     "anni": {
      "valore": [
       5,
       12
      ],
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:4",
      "nota": "PROPOSTA: anni umani; le altre razze scalano con `longevita` (regole)"
     },
     "longevita": {
      "valore": {
       "tipo": "umana",
       "fattore": 1
      },
      "da": "razza umano",
      "dove": "preset/razze/umano.yaml:5",
      "nota": ""
     },
     "livello_da_anni": {
      "valore": [
       0.5,
       1
      ],
      "da": "età bambino",
      "dove": "preset/eta/bambino.yaml:5",
      "nota": "PROPOSTA: fra metà degli anni e gli anni che ha (Lia Orso, Lv 11)"
     },
     "moneta": {
      "valore": "corona",
      "da": "regno valeria",
      "dove": "preset/luoghi/regni.yaml:8",
      "nota": "FONTE Ambientazione.txt e Zona_Alba_Chiara"
     },
     "conta_nel_regno": {
      "valore": [
       "onore",
       "commercio"
      ],
      "da": "regno valeria",
      "dove": "preset/luoghi/regni.yaml:11",
      "nota": "FONTE Status Sociale §3"
     },
     "voci_girano": {
      "valore": "tutti sanno tutto entro sera",
      "da": "insediamento villaggio",
      "dove": "preset/luoghi/insediamenti.yaml:4",
      "nota": "FONTE Zona_Alba_Chiara"
     },
     "affinita_iniziale": {
      "valore": -1,
      "da": "zona alba-chiara",
      "dove": "preset/luoghi/zone.yaml:10",
      "nota": "FONTE Zona_Alba_Chiara: un forestiero parte da -1"
     }
    },
    "elenchi": {
     "vuole": [
      {
       "voce": "essere preso sul serio",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:13",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "vedere una cosa da grandi",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:13",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "non tornare a casa",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:13",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "un dolce",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:13",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      }
     ],
     "teme": [
      {
       "voce": "il buio",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:14",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "un adulto preciso",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:14",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "essere scoperto a fare la spia",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:14",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      }
     ],
     "difetto": [
      {
       "voce": "spaccone",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:15",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "bugiardo per gioco",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:15",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "curioso fino al danno",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:15",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "piagnone",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:15",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      }
     ],
     "forestieri": [
      {
       "voce": "eroi delle fiabe",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:16",
       "nota": "«eroi delle fiabe»: Lia Orso"
      },
      {
       "voce": "mostri",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:16",
       "nota": "«eroi delle fiabe»: Lia Orso"
      },
      {
       "voce": "gente che fa regali",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:16",
       "nota": "«eroi delle fiabe»: Lia Orso"
      }
     ],
     "prezzo": [
      {
       "voce": "una storia",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:17",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "un dolce",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:17",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "essere portato con sé",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:17",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "un segreto in cambio",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:17",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      }
     ],
     "vita": [
      {
       "voce": "un fratellino appena nato",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:18",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "una punizione da scontare",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:18",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "l'amico del cuore partito",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:18",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "un animale da nascondere",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:18",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      }
     ],
     "tratti": [
      {
       "voce": "sveglio",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:19",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "testardo",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:19",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "timido",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:19",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "chiacchierone",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:19",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      },
      {
       "voce": "impiccione",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:19",
       "nota": "PROPOSTA tutte: spunti, si riscrivono sulla persona"
      }
     ],
     "intercalare": [
      {
       "voce": "«e che ne so io»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«sentite a me»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«roba da matti»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«Luxor ci scampi»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«come dicevo»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      }
     ],
     "dove": [
      {
       "voce": "mercato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "bottega",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "lavatoio",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "taverna la sera",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "tempio nei giorni di festa",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      }
     ],
     "sa": [
      {
       "voce": "il suo lavoro",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "il suo vicinato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "chi deve soldi a chi",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "chi abita dove",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:20",
       "nota": ""
      },
      {
       "voce": "dove non si deve andare",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:20",
       "nota": ""
      },
      {
       "voce": "quello che ha visto e non doveva",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:20",
       "nota": ""
      }
     ],
     "dicerie": [
      {
       "voce": "i discorsi dei grandi capiti a metà",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:21",
       "nota": ""
      }
     ],
     "puo_dare": [
      {
       "voce": "indizi",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:22",
       "nota": ""
      },
      {
       "voce": "commissioni",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:22",
       "nota": ""
      },
      {
       "voce": "la voce che gira fra i bambini",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:22",
       "nota": ""
      }
     ],
     "no_tipici": [
      {
       "voce": "ha paura di chi comanda",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:23",
       "nota": "Taratura §5"
      },
      {
       "voce": "nasconde qualcosa",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:23",
       "nota": "Taratura §5"
      }
     ],
     "malizia": [
      {
       "voce": "riferire",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:24",
       "nota": "Taratura §6: lo racconta a casa"
      },
      {
       "voce": "pettegolezzo storto",
       "da": "età bambino",
       "dove": "preset/eta/bambino.yaml:24",
       "nota": "Taratura §6: lo racconta a casa"
      }
     ]
    },
    "atteggiamento": {
     "frequenze": {
      "ostile": 10,
      "diffidente": 30,
      "indifferente": 35,
      "interessato": 20,
      "ben_disposto": 5
     },
     "storia": [
      {
       "da": "regole",
       "dove": "regole.yaml:34",
       "nota": "FONTE Taratura §3"
      }
     ]
    },
    "canone": [
     "Marta Orsini",
     "Lv 22; Nessa",
     "Lv 29; Piero Orso",
     "Lv 34 (Zona_Alba_Chiara)",
     "Lia Orso (Zona_Alba_Chiara)"
    ],
    "motivo_richiesto": [],
    "avvisi": [],
    "errori": []
   },
   "seme": 3
  },
  "nuovo_elfo_anziano_rara": {
   "scheda": {
    "id": "alba-chiara/cittadino-5",
    "dettaglio": "scheda",
    "provenienza": {
     "ruolo": "cittadino",
     "eta": "anziano",
     "razza": "elfo",
     "luogo": "valeria/alba-chiara",
     "insediamento": "villaggio",
     "ritocchi": [],
     "seme": 5
    },
    "nome": "[nome da scegliere]",
    "genere": "f",
    "livello": 14,
    "ruolo": "cittadino",
    "razza": "elfo",
    "eta": {
     "fase": "anziano",
     "apparente": 83,
     "vera": 415
    },
    "luogo": "valeria/alba-chiara",
    "conta": "qualunque",
    "tratti": [
     "saggio a modo suo"
    ],
    "vuole": "passare a qualcuno ciò che sa",
    "teme": "diventare un peso",
    "difetto": null,
    "forestieri": "ne ha visti arrivare tanti e li confronta con quelli di una volta",
    "prezzo": "denaro",
    "vita": "una lite col vicino",
    "contraddizione": null,
    "voce": "racconta per giri lunghi, confronta tutto con «una volta»; dice spesso «roba da matti»",
    "sa": [
     "il suo lavoro",
     "il suo vicinato",
     "chi deve soldi a chi",
     "com'era il posto trent'anni fa",
     "chi era parente di chi",
     "perché una cosa si fa così"
    ],
    "dicerie": [
     "la politica",
     "la magia",
     "i posti dove non è mai stato"
    ],
    "puo_dare": [
     "indicazioni",
     "voci",
     "un lavoro a giornata",
     "un letto in cambio di braccia"
    ],
    "no_tipici": [
     "non si fida",
     "ha paura di chi comanda",
     "giornata storta"
    ],
    "malizia": [
     "sovrapprezzo al forestiero",
     "mezza verità",
     "pettegolezzo storto"
    ],
    "segni": [
     "occhi che brillano di una luce verde-dorata"
    ],
    "limiti": [],
    "corporatura": "fragile",
    "addestramento": "nessuno",
    "profilo": {
     "STR": "media",
     "DEX": "media",
     "VIT": "media",
     "INT": "alta"
    },
    "mestiere": {
     "nome": "uno dei lavori del luogo",
     "grado": "IV"
    },
    "ricchezza": "modesto",
    "motivo": null,
    "stato_iniziale": {
     "vivo": true,
     "atteggiamento_iniziale": "diffidente",
     "affinita": -1,
     "memoria": [],
     "legami": []
    },
    "stato": {},
    "origine": {
     "genere": "pescato",
     "livello": "ruolo cittadino (villaggio)",
     "anni": "età anziano",
     "nome": "manca",
     "vuole": "pescato da età anziano",
     "teme": "pescato da età anziano",
     "difetto": "rosa vuota",
     "forestieri": "pescato da età anziano",
     "prezzo": "pescato da ruolo cittadino",
     "vita": "pescato da ruolo cittadino",
     "tratti": "difetto pescato + età anziano",
     "voce": "età anziano + intercalare da ruolo cittadino",
     "mestiere": "ruolo cittadino; grado da ruolo cittadino",
     "corporatura": "età anziano",
     "addestramento": "ruolo cittadino",
     "conta": "ruolo cittadino",
     "profilo": "STR da ruolo cittadino, DEX da ruolo cittadino, VIT da ruolo cittadino, INT da razza elfo"
    },
    "da_ritoccare": [
     "vuole",
     "teme",
     "forestieri",
     "prezzo",
     "vita",
     "contraddizione",
     "perche_qui"
    ],
    "ritratto": {
     "descrizione": "Elfo, anziana, sui 83 anni all'aspetto. Corporatura fragile. Occhi che brillano di una luce verde-dorata. Cittadino, uno dei lavori del luogo. Di solito mercato. Si vede che è saggio a modo suo. Vestiti semplici e puliti.",
     "immagini": []
    },
    "perche_qui": null,
    "contraddizione_spunto": "smentisci «saggio a modo suo»: in che cosa questa persona fa il contrario?"
   },
   "errori": [],
   "avvisi": [
    "razza rara nel luogo: elfo a Regno di Valeria (non elencata); la scheda deve dire perché è lì",
    "nessuno stile di nomi scritto per elfo a valeria: il nome va scelto a mano"
   ],
   "composizione": {
    "strati": {
     "ruolo": "cittadino",
     "eta": "anziano",
     "razza": "elfo",
     "regno": "valeria",
     "insediamento": "villaggio",
     "zona": "alba-chiara",
     "ritocchi": []
    },
    "campi": {
     "corporatura": {
      "valore": "fragile",
      "da": "età anziano",
      "dove": "preset/eta/anziano.yaml:5",
      "nota": "PROPOSTA: un gradino sotto il ruolo",
      "sposta": -1,
      "prima": "normale"
     },
     "addestramento": {
      "valore": "nessuno",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:9",
      "nota": ""
     },
     "profilo.STR": {
      "valore": "media",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:10",
      "nota": ""
     },
     "profilo.DEX": {
      "valore": "media",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:10",
      "nota": ""
     },
     "profilo.VIT": {
      "valore": "media",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:10",
      "nota": ""
     },
     "profilo.INT": {
      "valore": "alta",
      "da": "razza elfo",
      "dove": "preset/razze/elfo.yaml:8",
      "nota": "PROPOSTA",
      "sposta": 1,
      "prima": "media"
     },
     "mestiere.nome": {
      "valore": "uno dei lavori del luogo",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:11",
      "nota": "PROPOSTA"
     },
     "mestiere.grado": {
      "valore": [
       "III",
       "VII"
      ],
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:11",
      "nota": "PROPOSTA"
     },
     "ricchezza": {
      "valore": [
       "povero",
       "modesto"
      ],
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:12",
      "nota": ""
     },
     "conta": {
      "valore": "qualunque",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:13",
      "nota": ""
     },
     "giornata": {
      "valore": "lavora dall'alba; la sera è stanco e parla più volentieri",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:15",
      "nota": ""
     },
     "voce": {
      "valore": "racconta per giri lunghi, confronta tutto con «una volta»",
      "da": "età anziano",
      "dove": "preset/eta/anziano.yaml:12",
      "nota": "",
      "prima": "parlato di tutti i giorni; chiama posti e persone per nome, come chi non si è mai mosso da lì"
     },
     "livello": {
      "valore": [
       3,
       35
      ],
      "da": "ruolo cittadino (villaggio)",
      "dove": "preset/ruoli/cittadino.yaml:5",
      "nota": "FONTE Zona_Alba_Chiara: contadino 3-12, Marta 22, Nessa 29, Piero Orso 34"
     },
     "anni": {
      "valore": [
       60,
       90
      ],
      "da": "età anziano",
      "dove": "preset/eta/anziano.yaml:3",
      "nota": "PROPOSTA"
     },
     "longevita": {
      "valore": {
       "tipo": "lunghissima",
       "fattore": 5
      },
      "da": "razza elfo",
      "dove": "preset/razze/elfo.yaml:5",
      "nota": "«esseri longevi»: FONTE Ambientazione.txt; quanto, è PROPOSTA (fattore in regole.yaml)"
     },
     "fase_della_vita": {
      "valore": true,
      "da": "razza elfo",
      "dove": "preset/razze/elfo.yaml:6",
      "nota": "PROPOSTA: il livello segue la fase della vita, non gli anni di calendario"
     },
     "rara_nel_luogo": {
      "valore": true,
      "da": "regno valeria",
      "dove": "preset/luoghi/regni.yaml:10",
      "nota": "FONTE Ambientazione.txt; il resto del 15 non è detto"
     },
     "moneta": {
      "valore": "corona",
      "da": "regno valeria",
      "dove": "preset/luoghi/regni.yaml:8",
      "nota": "FONTE Ambientazione.txt e Zona_Alba_Chiara"
     },
     "conta_nel_regno": {
      "valore": [
       "onore",
       "commercio"
      ],
      "da": "regno valeria",
      "dove": "preset/luoghi/regni.yaml:11",
      "nota": "FONTE Status Sociale §3"
     },
     "voci_girano": {
      "valore": "tutti sanno tutto entro sera",
      "da": "insediamento villaggio",
      "dove": "preset/luoghi/insediamenti.yaml:4",
      "nota": "FONTE Zona_Alba_Chiara"
     },
     "affinita_iniziale": {
      "valore": -1,
      "da": "zona alba-chiara",
      "dove": "preset/luoghi/zone.yaml:10",
      "nota": "FONTE Zona_Alba_Chiara: un forestiero parte da -1"
     }
    },
    "elenchi": {
     "vuole": [
      {
       "voce": "passare a qualcuno ciò che sa",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:7",
       "nota": ""
      },
      {
       "voce": "un erede",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:7",
       "nota": ""
      },
      {
       "voce": "compagnia",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:7",
       "nota": ""
      },
      {
       "voce": "che le cose restino come sono",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:7",
       "nota": ""
      }
     ],
     "teme": [
      {
       "voce": "morire senza aver detto una cosa",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:8",
       "nota": ""
      },
      {
       "voce": "diventare un peso",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:8",
       "nota": ""
      },
      {
       "voce": "le novità",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:8",
       "nota": ""
      }
     ],
     "forestieri": [
      {
       "voce": "ne ha visti arrivare tanti e li confronta con quelli di una volta",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:9",
       "nota": ""
      },
      {
       "voce": "mortali di passaggio",
       "da": "razza elfo",
       "dove": "preset/razze/elfo.yaml:12",
       "nota": "«distacco dalle preoccupazioni degli esseri mortali»: FONTE Ambientazione.txt"
      },
      {
       "voce": "distratti dalle loro faccende",
       "da": "razza elfo",
       "dove": "preset/razze/elfo.yaml:12",
       "nota": "«distacco dalle preoccupazioni degli esseri mortali»: FONTE Ambientazione.txt"
      }
     ],
     "prezzo": [
      {
       "voce": "denaro",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:20",
       "nota": ""
      },
      {
       "voce": "un favore",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:20",
       "nota": ""
      },
      {
       "voce": "una commissione",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:20",
       "nota": ""
      },
      {
       "voce": "una parola buona con qualcuno",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:20",
       "nota": ""
      }
     ],
     "vita": [
      {
       "voce": "un parente malato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:21",
       "nota": ""
      },
      {
       "voce": "una lite col vicino",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:21",
       "nota": ""
      },
      {
       "voce": "un matrimonio da pagare",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:21",
       "nota": ""
      },
      {
       "voce": "un lavoro perso o appena trovato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:21",
       "nota": ""
      }
     ],
     "tratti": [
      {
       "voce": "brontolone",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:10",
       "nota": "«brontolone»: Duilio"
      },
      {
       "voce": "saggio a modo suo",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:10",
       "nota": "«brontolone»: Duilio"
      },
      {
       "voce": "sospettoso",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:10",
       "nota": "«brontolone»: Duilio"
      },
      {
       "voce": "sereno",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:10",
       "nota": "«brontolone»: Duilio"
      },
      {
       "voce": "svanito a tratti",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:10",
       "nota": "«brontolone»: Duilio"
      },
      {
       "voce": "distaccato",
       "da": "razza elfo",
       "dove": "preset/razze/elfo.yaml:13",
       "nota": "PROPOSTA, dal testo di Ambientazione.txt"
      },
      {
       "voce": "paziente",
       "da": "razza elfo",
       "dove": "preset/razze/elfo.yaml:13",
       "nota": "PROPOSTA, dal testo di Ambientazione.txt"
      },
      {
       "voce": "altero",
       "da": "razza elfo",
       "dove": "preset/razze/elfo.yaml:13",
       "nota": "PROPOSTA, dal testo di Ambientazione.txt"
      }
     ],
     "intercalare": [
      {
       "voce": "«e che ne so io»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«sentite a me»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«roba da matti»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«Luxor ci scampi»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«come dicevo»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      }
     ],
     "dove": [
      {
       "voce": "mercato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "bottega",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "lavatoio",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "taverna la sera",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "tempio nei giorni di festa",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      }
     ],
     "sa": [
      {
       "voce": "il suo lavoro",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "il suo vicinato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "chi deve soldi a chi",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "com'era il posto trent'anni fa",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:11",
       "nota": ""
      },
      {
       "voce": "chi era parente di chi",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:11",
       "nota": ""
      },
      {
       "voce": "perché una cosa si fa così",
       "da": "età anziano",
       "dove": "preset/eta/anziano.yaml:11",
       "nota": ""
      }
     ],
     "dicerie": [
      {
       "voce": "la politica",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:17",
       "nota": ""
      },
      {
       "voce": "la magia",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:17",
       "nota": ""
      },
      {
       "voce": "i posti dove non è mai stato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:17",
       "nota": ""
      }
     ],
     "puo_dare": [
      {
       "voce": "indicazioni",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:18",
       "nota": ""
      },
      {
       "voce": "voci",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:18",
       "nota": ""
      },
      {
       "voce": "un lavoro a giornata",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:18",
       "nota": ""
      },
      {
       "voce": "un letto in cambio di braccia",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:18",
       "nota": ""
      }
     ],
     "no_tipici": [
      {
       "voce": "non si fida",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:23",
       "nota": "Taratura §5"
      },
      {
       "voce": "ha paura di chi comanda",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:23",
       "nota": "Taratura §5"
      },
      {
       "voce": "giornata storta",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:23",
       "nota": "Taratura §5"
      }
     ],
     "malizia": [
      {
       "voce": "sovrapprezzo al forestiero",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:24",
       "nota": "Taratura §6"
      },
      {
       "voce": "mezza verità",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:24",
       "nota": "Taratura §6"
      },
      {
       "voce": "pettegolezzo storto",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:24",
       "nota": "Taratura §6"
      }
     ],
     "segni": [
      {
       "voce": "occhi che brillano di una luce verde-dorata",
       "da": "razza elfo",
       "dove": "preset/razze/elfo.yaml:10",
       "nota": "FONTE Ambientazione.txt"
      }
     ]
    },
    "atteggiamento": {
     "frequenze": {
      "ostile": 10,
      "diffidente": 30,
      "indifferente": 35,
      "interessato": 20,
      "ben_disposto": 5
     },
     "storia": [
      {
       "da": "regole",
       "dove": "regole.yaml:34",
       "nota": "FONTE Taratura §3"
      }
     ]
    },
    "canone": [
     "Marta Orsini",
     "Lv 22; Nessa",
     "Lv 29; Piero Orso",
     "Lv 34 (Zona_Alba_Chiara)",
     "Elena la Saggia",
     "Lv 45 (Sistema_PNG §4 e Zona_Alba_Chiara)",
     "Duilio (Zona_Alba_Chiara)",
     "la Vedova Rossi (Zona_Alba_Chiara)"
    ],
    "motivo_richiesto": [],
    "avvisi": [
     "razza rara nel luogo: elfo a Regno di Valeria (non elencata); la scheda deve dire perché è lì"
    ],
    "errori": []
   },
   "seme": 5
  },
  "goblin_cittadino_bloccato": {
   "scheda": null,
   "errori": [
    "serve un motivo — cittadino · variante goblin: i goblin vivono fuori dalle mura, al margine di Silverleaf; dentro solo con un motivo"
   ],
   "avvisi": [
    "razza goblin: la longevità non è scritta; uso quella umana",
    "razza rara nel luogo: goblin a Regno di Valeria (non elencata); la scheda deve dire perché è lì"
   ],
   "composizione": {
    "strati": {
     "ruolo": "cittadino",
     "eta": "adulto",
     "razza": "goblin",
     "regno": "valeria",
     "insediamento": "villaggio",
     "zona": "alba-chiara",
     "ritocchi": []
    },
    "campi": {
     "corporatura": {
      "valore": "fragile",
      "da": "razza goblin",
      "dove": "preset/razze/goblin.yaml:7",
      "nota": "Combat.txt: il goblin esploratore è Fragile; per tutti i goblin è PROPOSTA",
      "prima": "normale"
     },
     "addestramento": {
      "valore": "nessuno",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:9",
      "nota": ""
     },
     "profilo.STR": {
      "valore": "media",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:10",
      "nota": ""
     },
     "profilo.DEX": {
      "valore": "alta",
      "da": "razza goblin",
      "dove": "preset/razze/goblin.yaml:9",
      "nota": "PROPOSTA: arcieri, fionde (Zona_Alba_Chiara)",
      "sposta": 1,
      "prima": "media"
     },
     "profilo.VIT": {
      "valore": "media",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:10",
      "nota": ""
     },
     "profilo.INT": {
      "valore": "media",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:10",
      "nota": ""
     },
     "mestiere.nome": {
      "valore": "uno dei lavori del luogo",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:11",
      "nota": "PROPOSTA"
     },
     "mestiere.grado": {
      "valore": [
       "III",
       "VII"
      ],
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:11",
      "nota": "PROPOSTA"
     },
     "ricchezza": {
      "valore": [
       "povero",
       "modesto"
      ],
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:12",
      "nota": ""
     },
     "conta": {
      "valore": "qualunque",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:13",
      "nota": ""
     },
     "giornata": {
      "valore": "lavora dall'alba; la sera è stanco e parla più volentieri",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:15",
      "nota": ""
     },
     "voce": {
      "valore": "parlato di tutti i giorni; chiama posti e persone per nome, come chi non si è mai mosso da lì",
      "da": "ruolo cittadino",
      "dove": "preset/ruoli/cittadino.yaml:25",
      "nota": ""
     },
     "livello": {
      "valore": [
       3,
       35
      ],
      "da": "ruolo cittadino (villaggio)",
      "dove": "preset/ruoli/cittadino.yaml:5",
      "nota": "FONTE Zona_Alba_Chiara: contadino 3-12, Marta 22, Nessa 29, Piero Orso 34"
     },
     "anni": {
      "valore": [
       18,
       59
      ],
      "da": "età adulto",
      "dove": "preset/eta/adulto.yaml:3",
      "nota": "PROPOSTA"
     },
     "longevita": {
      "valore": null,
      "da": "razza goblin",
      "dove": "preset/razze/goblin.yaml:6",
      "nota": ""
     },
     "rara_nel_luogo": {
      "valore": true,
      "da": "regno valeria",
      "dove": "preset/luoghi/regni.yaml:10",
      "nota": "FONTE Ambientazione.txt; il resto del 15 non è detto"
     },
     "moneta": {
      "valore": "corona",
      "da": "regno valeria",
      "dove": "preset/luoghi/regni.yaml:8",
      "nota": "FONTE Ambientazione.txt e Zona_Alba_Chiara"
     },
     "conta_nel_regno": {
      "valore": [
       "onore",
       "commercio"
      ],
      "da": "regno valeria",
      "dove": "preset/luoghi/regni.yaml:11",
      "nota": "FONTE Status Sociale §3"
     },
     "voci_girano": {
      "valore": "tutti sanno tutto entro sera",
      "da": "insediamento villaggio",
      "dove": "preset/luoghi/insediamenti.yaml:4",
      "nota": "FONTE Zona_Alba_Chiara"
     },
     "affinita_iniziale": {
      "valore": -1,
      "da": "zona alba-chiara",
      "dove": "preset/luoghi/zone.yaml:10",
      "nota": "FONTE Zona_Alba_Chiara: un forestiero parte da -1"
     }
    },
    "elenchi": {
     "vuole": [
      {
       "voce": "arrivare a fine mese",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:7",
       "nota": ""
      },
      {
       "voce": "sistemare un figlio",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:7",
       "nota": ""
      },
      {
       "voce": "saldare un debito",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:7",
       "nota": ""
      },
      {
       "voce": "fare bella figura coi vicini",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:7",
       "nota": ""
      },
      {
       "voce": "grano",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:15",
       "nota": "FONTE Zona_Alba_Chiara, «Goblin di Silverleaf»"
      },
      {
       "voce": "ferro",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:15",
       "nota": "FONTE Zona_Alba_Chiara, «Goblin di Silverleaf»"
      },
      {
       "voce": "non essere cacciato",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:15",
       "nota": "FONTE Zona_Alba_Chiara, «Goblin di Silverleaf»"
      }
     ],
     "teme": [
      {
       "voce": "perdere il lavoro",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:8",
       "nota": ""
      },
      {
       "voce": "una malattia in casa",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:8",
       "nota": ""
      },
      {
       "voce": "chi comanda",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:8",
       "nota": ""
      },
      {
       "voce": "le chiacchiere sul suo conto",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:8",
       "nota": ""
      },
      {
       "voce": "chi entra nel bosco armato",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:16",
       "nota": "FONTE Zona_Alba_Chiara"
      },
      {
       "voce": "essere cacciato dal margine del bosco",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:16",
       "nota": "FONTE Zona_Alba_Chiara"
      }
     ],
     "difetto": [
      {
       "voce": "avaro",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      },
      {
       "voce": "vanitoso",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      },
      {
       "voce": "pettegolo",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      },
      {
       "voce": "codardo",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      },
      {
       "voce": "rancoroso",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      },
      {
       "voce": "bugiardo",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:9",
       "nota": "FONTE Taratura §2"
      }
     ],
     "forestieri": [
      {
       "voce": "chi entra nel bosco armato è un nemico",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:17",
       "nota": "FONTE Zona_Alba_Chiara"
      },
      {
       "voce": "a reputazione neutra si scambiano mappe",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:17",
       "nota": "FONTE Zona_Alba_Chiara"
      }
     ],
     "prezzo": [
      {
       "voce": "denaro",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:20",
       "nota": ""
      },
      {
       "voce": "un favore",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:20",
       "nota": ""
      },
      {
       "voce": "una commissione",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:20",
       "nota": ""
      },
      {
       "voce": "una parola buona con qualcuno",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:20",
       "nota": ""
      }
     ],
     "vita": [
      {
       "voce": "un parente malato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:21",
       "nota": ""
      },
      {
       "voce": "una lite col vicino",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:21",
       "nota": ""
      },
      {
       "voce": "un matrimonio da pagare",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:21",
       "nota": ""
      },
      {
       "voce": "un lavoro perso o appena trovato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:21",
       "nota": ""
      }
     ],
     "tratti": [
      {
       "voce": "pratico",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "diffidente",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "gentile",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "stanco",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "onesto",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "ansioso",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "rigido",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "mite",
       "da": "età adulto",
       "dove": "preset/eta/adulto.yaml:11",
       "nota": "FONTE i «tratti chiave» dei PNG di Zona_Alba_Chiara"
      },
      {
       "voce": "curioso",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:18",
       "nota": "FONTE Zona_Alba_Chiara (Tek, la goblin con un occhio solo)"
      },
      {
       "voce": "furbo",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:18",
       "nota": "FONTE Zona_Alba_Chiara (Tek, la goblin con un occhio solo)"
      },
      {
       "voce": "tiene i conti",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:18",
       "nota": "FONTE Zona_Alba_Chiara (Tek, la goblin con un occhio solo)"
      }
     ],
     "intercalare": [
      {
       "voce": "«e che ne so io»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«sentite a me»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«roba da matti»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«Luxor ci scampi»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      },
      {
       "voce": "«come dicevo»",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:22",
       "nota": "PROPOSTA"
      }
     ],
     "dove": [
      {
       "voce": "mercato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "bottega",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "lavatoio",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "taverna la sera",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      },
      {
       "voce": "tempio nei giorni di festa",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:14",
       "nota": ""
      }
     ],
     "sa": [
      {
       "voce": "il suo lavoro",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "il suo vicinato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      },
      {
       "voce": "chi deve soldi a chi",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:16",
       "nota": ""
      }
     ],
     "dicerie": [
      {
       "voce": "la politica",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:17",
       "nota": ""
      },
      {
       "voce": "la magia",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:17",
       "nota": ""
      },
      {
       "voce": "i posti dove non è mai stato",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:17",
       "nota": ""
      }
     ],
     "puo_dare": [
      {
       "voce": "indicazioni",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:18",
       "nota": ""
      },
      {
       "voce": "voci",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:18",
       "nota": ""
      },
      {
       "voce": "un lavoro a giornata",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:18",
       "nota": ""
      },
      {
       "voce": "un letto in cambio di braccia",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:18",
       "nota": ""
      }
     ],
     "no_tipici": [
      {
       "voce": "non si fida",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:23",
       "nota": "Taratura §5"
      },
      {
       "voce": "ha paura di chi comanda",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:23",
       "nota": "Taratura §5"
      },
      {
       "voce": "giornata storta",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:23",
       "nota": "Taratura §5"
      }
     ],
     "malizia": [
      {
       "voce": "sovrapprezzo al forestiero",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:24",
       "nota": "Taratura §6"
      },
      {
       "voce": "mezza verità",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:24",
       "nota": "Taratura §6"
      },
      {
       "voce": "pettegolezzo storto",
       "da": "ruolo cittadino",
       "dove": "preset/ruoli/cittadino.yaml:24",
       "nota": "Taratura §6"
      }
     ],
     "segni": [
      {
       "voce": "tacche per i morti sulla pietra della frana",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:11",
       "nota": "FONTE Zona_Alba_Chiara, «Usanze»"
      }
     ],
     "limiti": [
      {
       "voce": "parla la lingua comune a pezzi",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:12",
       "nota": "FONTE Zona_Alba_Chiara (Tek)"
      }
     ],
     "usanze": [
      {
       "voce": "giura «su radice»",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:13",
       "nota": "FONTE Zona_Alba_Chiara e Taratura §9"
      },
      {
       "voce": "rispetta i patti alla lettera e non oltre",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:13",
       "nota": "FONTE Zona_Alba_Chiara e Taratura §9"
      },
      {
       "voce": "si tratta senza ferro",
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:13",
       "nota": "FONTE Zona_Alba_Chiara e Taratura §9"
      }
     ]
    },
    "atteggiamento": {
     "frequenze": {
      "ostile": 9,
      "diffidente": 41,
      "indifferente": 32,
      "interessato": 18,
      "ben_disposto": 0
     },
     "storia": [
      {
       "da": "regole",
       "dove": "regole.yaml:34",
       "nota": "FONTE Taratura §3"
      },
      {
       "da": "razza goblin",
       "dove": "preset/razze/goblin.yaml:19",
       "nota": "PROPOSTA: «diffidente verso ogni umano» (Zona_Alba_Chiara)",
       "sposta": {
        "diffidente": 15,
        "ben_disposto": -5
       }
      }
     ]
    },
    "canone": [
     "Marta Orsini",
     "Lv 22; Nessa",
     "Lv 29; Piero Orso",
     "Lv 34 (Zona_Alba_Chiara)"
    ],
    "motivo_richiesto": [
     "cittadino · variante goblin: i goblin vivono fuori dalle mura, al margine di Silverleaf; dentro solo con un motivo"
    ],
    "avvisi": [
     "razza goblin: la longevità non è scritta; uso quella umana",
     "razza rara nel luogo: goblin a Regno di Valeria (non elencata); la scheda deve dire perché è lì"
    ],
    "errori": [
     "serve un motivo — cittadino · variante goblin: i goblin vivono fuori dalle mura, al margine di Silverleaf; dentro solo con un motivo"
    ]
   }
  },
  "comparse": {
   "comparse": [
    {
     "dettaglio": "comparsa",
     "id": "alba-chiara/ornella-bianchi",
     "nome": "Ornella Bianchi",
     "genere": "f",
     "ruolo": "cittadino",
     "razza": "umano",
     "eta": "adulto",
     "livello": 13,
     "tratto": "stanco",
     "difetto": "codardo",
     "atteggiamento": "indifferente",
     "voce": "parlato di tutti i giorni; chiama posti e persone per nome, come chi non si è mai mosso da lì; dice spesso «sentite a me»",
     "provenienza": {
      "ruolo": "cittadino",
      "eta": "adulto",
      "razza": "umano",
      "luogo": "valeria/alba-chiara",
      "insediamento": "villaggio",
      "ritocchi": [],
      "seme": 479341424
     }
    },
    {
     "dettaglio": "comparsa",
     "id": "alba-chiara/bernardo",
     "nome": "Bernardo",
     "genere": "m",
     "ruolo": "contadino",
     "razza": "umano",
     "eta": "adulto",
     "livello": 7,
     "tratto": "stanco",
     "difetto": "bugiardo",
     "atteggiamento": "diffidente",
     "voce": "parla sporco e impreca; misura tutto in raccolti e stagioni; dice spesso «porca miseria»",
     "provenienza": {
      "ruolo": "contadino",
      "eta": "adulto",
      "razza": "umano",
      "luogo": "valeria/alba-chiara",
      "insediamento": "villaggio",
      "ritocchi": [],
      "seme": 1915941033
     }
    },
    {
     "dettaglio": "comparsa",
     "id": "alba-chiara/agnese-dal-pozzo",
     "nome": "Agnese Dal Pozzo",
     "genere": "f",
     "ruolo": "guardia",
     "razza": "umano",
     "eta": "adulto",
     "livello": 20,
     "tratto": "pratico",
     "difetto": "avaro",
     "atteggiamento": "diffidente",
     "voce": "formale col forestiero, sporca fra colleghi; dice spesso «qui non si fa»",
     "provenienza": {
      "ruolo": "guardia",
      "eta": "adulto",
      "razza": "umano",
      "luogo": "valeria/alba-chiara",
      "insediamento": "villaggio",
      "ritocchi": [],
      "seme": 63989048
     }
    },
    {
     "dettaglio": "comparsa",
     "id": "alba-chiara/ida",
     "nome": "Ida",
     "genere": "f",
     "ruolo": "cittadino",
     "razza": "umano",
     "eta": "adulto",
     "livello": 18,
     "tratto": "pratico",
     "difetto": "pettegolo",
     "atteggiamento": "indifferente",
     "voce": "parlato di tutti i giorni; chiama posti e persone per nome, come chi non si è mai mosso da lì; dice spesso «roba da matti»",
     "provenienza": {
      "ruolo": "cittadino",
      "eta": "adulto",
      "razza": "umano",
      "luogo": "valeria/alba-chiara",
      "insediamento": "villaggio",
      "ritocchi": [],
      "seme": 56985562
     }
    },
    {
     "dettaglio": "comparsa",
     "id": "alba-chiara/martino-bianchi",
     "nome": "Martino Bianchi",
     "genere": "m",
     "ruolo": "guardia",
     "razza": "umano",
     "eta": "adulto",
     "livello": 31,
     "tratto": "pratico",
     "difetto": "corruttibile",
     "atteggiamento": "diffidente",
     "voce": "formale col forestiero, sporca fra colleghi; dice spesso «parlane col sergente»",
     "provenienza": {
      "ruolo": "guardia",
      "eta": "adulto",
      "razza": "umano",
      "luogo": "valeria/alba-chiara",
      "insediamento": "villaggio",
      "ritocchi": [],
      "seme": 1170252924
     }
    },
    {
     "dettaglio": "comparsa",
     "id": "alba-chiara/brunello-tessitori",
     "nome": "Brunello Tessitori",
     "genere": "m",
     "ruolo": "mercante_ambulante",
     "razza": "umano",
     "eta": "adulto",
     "livello": 20,
     "tratto": "diffidente",
     "difetto": "rancoroso",
     "atteggiamento": "interessato",
     "voce": "lusinghiero, svelto con i numeri, cambia tono quando non conviene più; dice spesso «affare fatto?»",
     "provenienza": {
      "ruolo": "mercante_ambulante",
      "eta": "adulto",
      "razza": "umano",
      "luogo": "valeria/alba-chiara",
      "insediamento": "villaggio",
      "ritocchi": [],
      "seme": 1738238662
     }
    }
   ],
   "seme": 42,
   "avvisi": []
  },
  "combattimento_fabbro": {
   "vita": 1830,
   "danno": 182,
   "formula_vita": "(40 + 59×20) × 1 × 1,5",
   "formula_danno": "(10 + 59×6) × 1 × 0,5 (addestramento)",
   "combatte": true,
   "modello": "creatura",
   "livello": 59,
   "taglia": "Robusta",
   "rarita": "Comune",
   "addestramento": "improvvisato",
   "abilita": null,
   "rango": "Soldato Semplice"
  },
  "confronta_fabbro": {
   "ruolo": "fabbro",
   "luogo": {
    "regno": "valeria",
    "insediamento": "villaggio"
   },
   "varianti": {
    "dragonide": {
     "cambia": {
      "profilo.INT": {
       "umano": "media",
       "dragonide": "alta",
       "da": "razza dragonide"
      },
      "compito": {
       "umano": null,
       "dragonide": "se la stirpe è di fuoco, usa il soffio alla forgia",
       "da": "fabbro · variante dragonide"
      },
      "longevita": {
       "umano": {
        "tipo": "umana",
        "fattore": 1
       },
       "dragonide": null,
       "da": "razza dragonide"
      },
      "tratti": {
       "aggiunte": [
        {
         "voce": "fiero",
         "da": "razza dragonide"
        },
        {
         "voce": "misurato",
         "da": "razza dragonide"
        },
        {
         "voce": "rispettoso della gerarchia",
         "da": "razza dragonide"
        }
       ],
       "tolte": []
      },
      "segni": {
       "aggiunte": [
        {
         "voce": "scaglie che riflettono l'elemento della stirpe",
         "da": "razza dragonide"
        }
       ],
       "tolte": []
      },
      "capacita": {
       "aggiunte": [
        {
         "voce": "respira l'elemento del suo lignaggio",
         "da": "razza dragonide"
        },
        {
         "voce": "saggezza degli antenati tramandata nei sogni",
         "da": "razza dragonide"
        }
       ],
       "tolte": []
      }
     },
     "errori": [],
     "motivo_richiesto": []
    },
    "elementale_minore": {
     "cambia": {
      "mestiere.nome": {
       "umano": "Forgia",
       "elementale_minore": "legato al suo elemento",
       "da": "cittadino · variante elementale_minore"
      },
      "compito": {
       "umano": null,
       "elementale_minore": "tiene vivo il fuoco; lavora alla fiamma, non alla tempra",
       "da": "fabbro · variante elementale_minore"
      },
      "longevita": {
       "umano": {
        "tipo": "umana",
        "fattore": 1
       },
       "elementale_minore": null,
       "da": "razza elementale_minore"
      },
      "fase_della_vita": {
       "umano": null,
       "elementale_minore": true,
       "da": "razza elementale_minore"
      }
     },
     "errori": [],
     "motivo_richiesto": []
    },
    "elfo": {
     "cambia": {
      "profilo.INT": {
       "umano": "media",
       "elfo": "alta",
       "da": "razza elfo"
      },
      "longevita": {
       "umano": {
        "tipo": "umana",
        "fattore": 1
       },
       "elfo": {
        "tipo": "lunghissima",
        "fattore": 5
       },
       "da": "razza elfo"
      },
      "fase_della_vita": {
       "umano": null,
       "elfo": true,
       "da": "razza elfo"
      },
      "forestieri": {
       "aggiunte": [
        {
         "voce": "mortali di passaggio",
         "da": "razza elfo"
        },
        {
         "voce": "distratti dalle loro faccende",
         "da": "razza elfo"
        }
       ],
       "tolte": []
      },
      "tratti": {
       "aggiunte": [
        {
         "voce": "distaccato",
         "da": "razza elfo"
        },
        {
         "voce": "paziente",
         "da": "razza elfo"
        },
        {
         "voce": "altero",
         "da": "razza elfo"
        }
       ],
       "tolte": []
      },
      "segni": {
       "aggiunte": [
        {
         "voce": "occhi che brillano di una luce verde-dorata",
         "da": "razza elfo"
        }
       ],
       "tolte": []
      }
     },
     "errori": [],
     "motivo_richiesto": []
    },
    "goblin": {
     "cambia": {
      "corporatura": {
       "umano": "robusta",
       "goblin": "fragile",
       "da": "razza goblin"
      },
      "profilo.DEX": {
       "umano": "media",
       "goblin": "alta",
       "da": "razza goblin"
      },
      "longevita": {
       "umano": {
        "tipo": "umana",
        "fattore": 1
       },
       "goblin": null,
       "da": "razza goblin"
      },
      "vuole": {
       "aggiunte": [
        {
         "voce": "grano",
         "da": "razza goblin"
        },
        {
         "voce": "ferro",
         "da": "razza goblin"
        },
        {
         "voce": "non essere cacciato",
         "da": "razza goblin"
        }
       ],
       "tolte": []
      },
      "teme": {
       "aggiunte": [
        {
         "voce": "chi entra nel bosco armato",
         "da": "razza goblin"
        },
        {
         "voce": "essere cacciato dal margine del bosco",
         "da": "razza goblin"
        }
       ],
       "tolte": []
      },
      "forestieri": {
       "aggiunte": [
        {
         "voce": "chi entra nel bosco armato è un nemico",
         "da": "razza goblin"
        },
        {
         "voce": "a reputazione neutra si scambiano mappe",
         "da": "razza goblin"
        }
       ],
       "tolte": [
        "creature della magia antica",
        "gente che paga",
        "inviati degli dèi",
        "non-morti",
        "spiriti incarnati",
        "un problema di ordine pubblico",
        "viaggiatori"
       ]
      },
      "tratti": {
       "aggiunte": [
        {
         "voce": "curioso",
         "da": "razza goblin"
        },
        {
         "voce": "furbo",
         "da": "razza goblin"
        },
        {
         "voce": "tiene i conti",
         "da": "razza goblin"
        }
       ],
       "tolte": []
      },
      "segni": {
       "aggiunte": [
        {
         "voce": "tacche per i morti sulla pietra della frana",
         "da": "razza goblin"
        }
       ],
       "tolte": []
      },
      "limiti": {
       "aggiunte": [
        {
         "voce": "parla la lingua comune a pezzi",
         "da": "razza goblin"
        }
       ],
       "tolte": []
      },
      "usanze": {
       "aggiunte": [
        {
         "voce": "giura «su radice»",
         "da": "razza goblin"
        },
        {
         "voce": "rispetta i patti alla lettera e non oltre",
         "da": "razza goblin"
        },
        {
         "voce": "si tratta senza ferro",
         "da": "razza goblin"
        }
       ],
       "tolte": []
      },
      "atteggiamento": {
       "umano": {
        "ostile": 10,
        "diffidente": 29,
        "indifferente": 39,
        "interessato": 19,
        "ben_disposto": 3
       },
       "goblin": {
        "ostile": 9,
        "diffidente": 39,
        "indifferente": 35,
        "interessato": 17,
        "ben_disposto": 0
       }
      }
     },
     "errori": [
      "serve un motivo — cittadino · variante goblin: i goblin vivono fuori dalle mura, al margine di Silverleaf; dentro solo con un motivo"
     ],
     "motivo_richiesto": [
      "cittadino · variante goblin: i goblin vivono fuori dalle mura, al margine di Silverleaf; dentro solo con un motivo"
     ]
    },
    "halfling": {
     "cambia": {
      "longevita": {
       "umano": {
        "tipo": "umana",
        "fattore": 1
       },
       "halfling": null,
       "da": "razza halfling"
      }
     },
     "errori": [],
     "motivo_richiesto": []
    },
    "nano": {
     "cambia": {
      "mestiere.grado": {
       "umano": [
        "VI",
        "IX"
       ],
       "nano": [
        "VII",
        "X"
       ],
       "da": "fabbro · variante nano"
      },
      "note": {
       "umano": null,
       "nano": "alleati tradizionali degli umani",
       "da": "razza nano"
      },
      "longevita": {
       "umano": {
        "tipo": "umana",
        "fattore": 1
       },
       "nano": null,
       "da": "razza nano"
      },
      "vuole": {
       "aggiunte": [
        {
         "voce": "un pezzo degno del nome del clan",
         "da": "fabbro · variante nano"
        }
       ],
       "tolte": []
      },
      "teme": {
       "aggiunte": [
        {
         "voce": "il disonore di un lavoro mediocre",
         "da": "fabbro · variante nano"
        }
       ],
       "tolte": []
      },
      "forestieri": {
       "aggiunte": [
        {
         "voce": "li misura dal valore in battaglia",
         "da": "razza nano"
        }
       ],
       "tolte": []
      },
      "tratti": {
       "aggiunte": [
        {
         "voce": "orgoglioso",
         "da": "razza nano"
        },
        {
         "voce": "leale al clan",
         "da": "razza nano"
        },
        {
         "voce": "tenace",
         "da": "razza nano"
        }
       ],
       "tolte": []
      },
      "segni": {
       "aggiunte": [
        {
         "voce": "la storia della stirpe incisa negli ornamenti della barba",
         "da": "razza nano"
        },
        {
         "voce": "rune sugli strumenti",
         "da": "razza nano"
        }
       ],
       "tolte": []
      },
      "legami_tipici": {
       "aggiunte": [
        {
         "voce": "il clan",
         "da": "razza nano"
        },
        {
         "voce": "il patriarca",
         "da": "razza nano"
        }
       ],
       "tolte": []
      }
     },
     "errori": [],
     "motivo_richiesto": []
    }
   }
  },
  "riga_zona": {
   "celle": [
    "Mira Vacchetti",
    "59",
    "fabbro",
    "rancoroso, stanco",
    "spiriti incarnati",
    "riparazioni (5-20 corone in un villaggio); armi e attrezzi comuni (una spada di ferro, 80 corone); affilatura"
   ],
   "markdown": "| Mira Vacchetti | 59 | fabbro | rancoroso, stanco | spiriti incarnati | riparazioni (5-20 corone in un villaggio); armi e attrezzi comuni (una spada di ferro, 80 corone); affilatura |"
  }
 },
 "catalogo": {
  "ruoli": [
   {
    "id": "cittadino",
    "nome": "Cittadino",
    "desc": "abitante qualunque, con un lavoro ordinario",
    "fasce": {
     "villaggio": [
      3,
      35
     ],
     "citta": [
      15,
      45
     ],
     "metropoli": [
      20,
      90
     ]
    },
    "file": "preset/ruoli/cittadino.yaml"
   },
   {
    "id": "contadino",
    "nome": "Contadino",
    "desc": "lavora la terra; fattorie, campi, la Piazza il giorno di mercato",
    "fasce": {
     "villaggio": [
      3,
      12
     ],
     "citta": null,
     "metropoli": null
    },
    "file": "preset/ruoli/contadino.yaml"
   },
   {
    "id": "fabbro",
    "nome": "Fabbro",
    "desc": "lavora il ferro alla forgia; ripara, affila, vende armi e attrezzi comuni",
    "fasce": {
     "villaggio": [
      30,
      65
     ],
     "citta": [
      40,
      99
     ],
     "metropoli": [
      100,
      200
     ]
    },
    "file": "preset/ruoli/fabbro.yaml"
   },
   {
    "id": "guardia",
    "nome": "Guardia",
    "desc": "guardia del posto; ronde, registro dei forestieri, risse",
    "fasce": {
     "villaggio": [
      20,
      45
     ],
     "citta": null,
     "metropoli": null
    },
    "file": "preset/ruoli/guardia.yaml"
   },
   {
    "id": "mercante_ambulante",
    "nome": "Mercante ambulante",
    "desc": "gira i mercati; compra basso, vende alto, porta notizie",
    "fasce": {
     "villaggio": [
      15,
      30
     ],
     "citta": null,
     "metropoli": null
    },
    "file": "preset/ruoli/mercante_ambulante.yaml"
   },
   {
    "id": "viaggiatore",
    "nome": "Viaggiatore",
    "desc": "di passaggio; pellegrino, disertore, apprendista mago",
    "fasce": {
     "villaggio": [
      10,
      60
     ],
     "citta": null,
     "metropoli": null
    },
    "file": "preset/ruoli/viaggiatore.yaml"
   }
  ],
  "eta": [
   {
    "id": "bambino",
    "nome": "Bambino",
    "desc": "dai cinque ai dodici anni; aiuta in famiglia, gioca, osserva"
   },
   {
    "id": "ragazzo",
    "nome": "Ragazzo",
    "desc": "dai tredici ai diciassette anni; impara un mestiere sotto qualcuno"
   },
   {
    "id": "adulto",
    "nome": "Adulto",
    "desc": "dai diciotto ai cinquantanove anni; il mestiere pieno"
   },
   {
    "id": "anziano",
    "nome": "Anziano",
    "desc": "dai sessant'anni; ha visto arrivare tanti forestieri"
   }
  ],
  "razze": [
   {
    "id": "umano",
    "nome": "Umano",
    "desc": "la maggior parte della gente di Valeria, di Frostland e di Qadesh",
    "segni": []
   },
   {
    "id": "nano",
    "nome": "Nano",
    "desc": "maestri artigiani dalla resistenza leggendaria, in clan patriarcali",
    "segni": [
     "la storia della stirpe incisa negli ornamenti della barba",
     "rune sugli strumenti"
    ]
   },
   {
    "id": "elfo",
    "nome": "Elfo",
    "desc": "esseri longevi dalla bellezza eterea, custodi della magia naturale",
    "segni": [
     "occhi che brillano di una luce verde-dorata"
    ]
   },
   {
    "id": "goblin",
    "nome": "Goblin",
    "desc": "i goblin di Silverleaf; esploratori al margine del bosco",
    "segni": []
   },
   {
    "id": "halfling",
    "nome": "Halfling",
    "desc": "i documenti tacciono",
    "segni": []
   },
   {
    "id": "dragonide",
    "nome": "Dragonide",
    "desc": "discendenti degli antichi draghi, con scaglie del colore del loro elemento",
    "segni": [
     "scaglie che riflettono l'elemento della stirpe"
    ]
   },
   {
    "id": "elementale_minore",
    "nome": "Elementale minore",
    "desc": "i documenti dicono solo che vivono a Qadesh",
    "segni": []
   }
  ],
  "regni": [
   {
    "id": "valeria",
    "nome": "Regno di Valeria",
    "popoli": {
     "umano": 85
    },
    "moneta": "corona"
   },
   {
    "id": "frostland",
    "nome": "Frostland",
    "popoli": {
     "umano": 70,
     "nano": 25
    },
    "moneta": null
   },
   {
    "id": "qadesh",
    "nome": "Qadesh",
    "popoli": {},
    "moneta": null
   },
   {
    "id": "eldermoor",
    "nome": "Eldermoor",
    "popoli": {},
    "moneta": null
   }
  ],
  "insediamenti": [
   {
    "id": "villaggio",
    "nome": "Villaggio",
    "abitanti": 2000
   },
   {
    "id": "citta",
    "nome": "Città",
    "abitanti": 50000
   },
   {
    "id": "metropoli",
    "nome": "Metropoli",
    "abitanti": 500000
   }
  ],
  "zone": [
   {
    "id": "alba-chiara",
    "nome": "Alba Chiara",
    "regno": "valeria",
    "insediamento": "villaggio"
   }
  ],
  "varianti": {
   "cittadino": {
    "elementale_minore": "variante",
    "goblin": "motivo"
   },
   "fabbro": {
    "dragonide": "variante",
    "elementale_minore": "variante",
    "elfo": "variante",
    "goblin": "variante",
    "halfling": "variante",
    "nano": "variante"
   },
   "guardia": {
    "goblin": "motivo"
   },
   "mercante_ambulante": {
    "halfling": "variante"
   }
  }
 },
 "prove": [
  {
   "nome": "Bram Ferraguto",
   "lv": 61,
   "componi": "fabbro · adulto · umano · alba-chiara",
   "ritocchi": [
    "ex soldato della Corona"
   ],
   "atteso": "passa",
   "esito": "passa",
   "nota": "terzo alto della fascia di villaggio (30-65), con un motivo",
   "dove": "prove.yaml:5"
  },
  {
   "nome": "Lia Orso",
   "lv": 11,
   "componi": "cittadino · bambino · umano · alba-chiara",
   "ritocchi": [],
   "atteso": "passa",
   "esito": "passa",
   "nota": "il livello segue l'età; niente mestiere, niente combattimento",
   "dove": "prove.yaml:13"
  },
  {
   "nome": "Berto Rossi",
   "lv": 9,
   "componi": "contadino · adulto · umano · alba-chiara",
   "ritocchi": [],
   "atteso": "passa",
   "esito": "passa",
   "nota": "fascia 3-12 del contadino",
   "dove": "prove.yaml:20"
  },
  {
   "nome": "Marta Orsini",
   "lv": 22,
   "componi": "cittadino · adulto · umano · alba-chiara",
   "ritocchi": [],
   "atteso": "passa",
   "esito": "passa",
   "nota": "due terzi bassi della fascia di villaggio (3-35)",
   "dove": "prove.yaml:28"
  },
  {
   "nome": "Nessa",
   "lv": 29,
   "componi": "cittadino · adulto · umano · alba-chiara",
   "ritocchi": [],
   "atteso": "avviso",
   "esito": "avviso",
   "nota": "terzo alto senza un motivo scritto nella zona",
   "dove": "prove.yaml:35"
  },
  {
   "nome": "Sergente Hald",
   "lv": 72,
   "componi": "guardia · adulto · umano · alba-chiara",
   "ritocchi": [
    "livello 72",
    "capo delle guardie"
   ],
   "atteso": "avviso",
   "esito": "avviso",
   "nota": "il ritocco sfonda la fascia della guardia (20-45): avvisa e obbedisce",
   "dove": "prove.yaml:49"
  },
  {
   "nome": "Elena la Saggia",
   "lv": 45,
   "componi": "cittadino · anziano · umano · alba-chiara",
   "ritocchi": [
    "livello 45",
    "ex cortigiana"
   ],
   "atteso": "avviso",
   "esito": "avviso",
   "nota": "anziana sopra la fascia del cittadino di villaggio, con il motivo scritto",
   "dove": "prove.yaml:57"
  },
  {
   "nome": "Goblin cittadino",
   "lv": null,
   "componi": "cittadino · adulto · goblin · alba-chiara",
   "ritocchi": [],
   "atteso": "motivo",
   "esito": "motivo",
   "nota": "la variante che dice di no chiede un motivo: senza, non esce",
   "dove": "prove.yaml:65"
  }
 ],
 "controlli": {
  "errori": [
   {
    "testo": "ruoli/guardia.yaml: fascia «citta» vuota, ma regni/frostland chiede guardie di città",
    "dove": "preset/ruoli/guardia.yaml:5"
   }
  ],
  "avvisi": [
   {
    "testo": "razza nano: la longevità non è scritta; uso quella umana",
    "dove": "preset/razze/nano.yaml:6"
   },
   {
    "testo": "razza goblin: la longevità non è scritta; uso quella umana",
    "dove": "preset/razze/goblin.yaml:4"
   },
   {
    "testo": "nessuno stile di nomi scritto per elfo a valeria: il nome va scelto a mano",
    "dove": "preset/luoghi/regni.yaml:11"
   },
   {
    "testo": "razza halfling: descrizione assente (i documenti tacciono)",
    "dove": "preset/razze/halfling.yaml:2"
   }
  ]
 },
 "archivio": [
  {
   "id": "alba-chiara/bram-ferraguto",
   "nome": "Bram Ferraguto",
   "ruolo": "fabbro",
   "razza": "umano",
   "eta": "adulto",
   "livello": 61,
   "dettaglio": "completa",
   "vivo": true,
   "tratto": "orgoglioso",
   "atteggiamento": "indifferente",
   "canone": true
  },
  {
   "id": "alba-chiara/marta-orsini",
   "nome": "Marta Orsini",
   "ruolo": "cittadino",
   "razza": "umano",
   "eta": "adulto",
   "livello": 22,
   "dettaglio": "completa",
   "vivo": true,
   "tratto": "chiacchierona",
   "atteggiamento": "interessato",
   "canone": true
  },
  {
   "id": "alba-chiara/hald",
   "nome": "Sergente Hald",
   "ruolo": "guardia",
   "razza": "umano",
   "eta": "adulto",
   "livello": 72,
   "dettaglio": "completa",
   "vivo": true,
   "tratto": "inflessibile",
   "atteggiamento": "diffidente",
   "canone": true
  },
  {
   "id": "alba-chiara/nessa",
   "nome": "Nessa",
   "ruolo": "cittadino",
   "razza": "umano",
   "eta": "adulto",
   "livello": 29,
   "dettaglio": "scheda",
   "vivo": true,
   "tratto": "pratica",
   "atteggiamento": "interessato",
   "canone": true
  },
  {
   "id": "alba-chiara/piero-orso",
   "nome": "Piero Orso",
   "ruolo": "cittadino",
   "razza": "umano",
   "eta": "adulto",
   "livello": 34,
   "dettaglio": "scheda",
   "vivo": true,
   "tratto": "burbero",
   "atteggiamento": "indifferente",
   "canone": true
  },
  {
   "id": "alba-chiara/lia-orso",
   "nome": "Lia Orso",
   "ruolo": "cittadino",
   "razza": "umano",
   "eta": "bambino",
   "livello": 11,
   "dettaglio": "scheda",
   "vivo": true,
   "tratto": "impicciona",
   "atteggiamento": "ben_disposto",
   "canone": true
  },
  {
   "id": "alba-chiara/berto-rossi",
   "nome": "Berto Rossi",
   "ruolo": "contadino",
   "razza": "umano",
   "eta": "adulto",
   "livello": 9,
   "dettaglio": "scheda",
   "vivo": false,
   "tratto": "testardo",
   "atteggiamento": "diffidente",
   "canone": true,
   "nota": "morto nell'incendio del fienile (sessione 4)"
  },
  {
   "id": "alba-chiara/mira-vacchetti",
   "nome": "Mira Vacchetti",
   "ruolo": "fabbro",
   "razza": "umano",
   "eta": "adulto",
   "livello": 59,
   "dettaglio": "scheda",
   "vivo": true,
   "tratto": "rancoroso",
   "atteggiamento": "indifferente",
   "canone": false
  },
  {
   "id": "alba-chiara/corrado-vacchetti",
   "nome": "Corrado Vacchetti",
   "ruolo": "cittadino",
   "razza": "umano",
   "eta": "bambino",
   "livello": 5,
   "dettaglio": "scheda",
   "vivo": true,
   "tratto": "spaccone",
   "atteggiamento": "interessato",
   "canone": false
  },
  {
   "id": "alba-chiara/ornella-bianchi",
   "nome": "Ornella Bianchi",
   "ruolo": "cittadino",
   "razza": "umano",
   "eta": "adulto",
   "livello": 13,
   "dettaglio": "comparsa",
   "vivo": true,
   "tratto": "stanco",
   "atteggiamento": "indifferente",
   "canone": false
  },
  {
   "id": "alba-chiara/bernardo",
   "nome": "Bernardo",
   "ruolo": "contadino",
   "razza": "umano",
   "eta": "adulto",
   "livello": 7,
   "dettaglio": "comparsa",
   "vivo": true,
   "tratto": "stanco",
   "atteggiamento": "diffidente",
   "canone": false
  },
  {
   "id": "alba-chiara/agnese-dal-pozzo",
   "nome": "Agnese Dal Pozzo",
   "ruolo": "guardia",
   "razza": "umano",
   "eta": "adulto",
   "livello": 20,
   "dettaglio": "comparsa",
   "vivo": true,
   "tratto": "pratico",
   "atteggiamento": "diffidente",
   "canone": false
  },
  {
   "id": "alba-chiara/martino-bianchi",
   "nome": "Martino Bianchi",
   "ruolo": "guardia",
   "razza": "umano",
   "eta": "adulto",
   "livello": 31,
   "dettaglio": "comparsa",
   "vivo": false,
   "tratto": "pratico",
   "atteggiamento": "diffidente",
   "canone": false,
   "nota": "ucciso dai banditi sulla strada del mulino"
  },
  {
   "id": "alba-chiara/brunello-tessitori",
   "nome": "Brunello Tessitori",
   "ruolo": "mercante_ambulante",
   "razza": "umano",
   "eta": "adulto",
   "livello": 20,
   "dettaglio": "comparsa",
   "vivo": true,
   "tratto": "diffidente",
   "atteggiamento": "interessato",
   "canone": false
  },
  {
   "id": "alba-chiara/tek",
   "nome": "Tek",
   "ruolo": "viaggiatore",
   "razza": "goblin",
   "eta": "adulto",
   "livello": 18,
   "dettaglio": "scheda",
   "vivo": true,
   "tratto": "furtivo",
   "atteggiamento": "diffidente",
   "canone": true,
   "nota": "motivo: porta messaggi da Silverleaf al tempio"
  }
 ],
 "riferimenti": [
  {
   "id": "r1",
   "strato": "ruolo fabbro",
   "titolo": "Grembiule di cuoio, maniche arrotolate",
   "tinta": [
    "#5a3a22",
    "#e3b55a"
   ],
   "motivo": "forgia"
  },
  {
   "id": "r2",
   "strato": "ruolo fabbro",
   "titolo": "Bottega con mantici e incudine",
   "tinta": [
    "#3b2a20",
    "#f08c3e"
   ],
   "motivo": "forgia"
  },
  {
   "id": "r3",
   "strato": "razza nano",
   "titolo": "Barba intrecciata con anelli di stirpe",
   "tinta": [
    "#4a3b2b",
    "#a5aabb"
   ],
   "motivo": "barba"
  },
  {
   "id": "r4",
   "strato": "razza elfo",
   "titolo": "Occhi verde-dorati, orecchie lunghe",
   "tinta": [
    "#1f3b2a",
    "#62c375"
   ],
   "motivo": "occhi"
  },
  {
   "id": "r5",
   "strato": "regno valeria",
   "titolo": "Vesti di lana tinta, spilla con la corona",
   "tinta": [
    "#2c3a6e",
    "#e3b55a"
   ],
   "motivo": "corona"
  },
  {
   "id": "r6",
   "strato": "zona alba-chiara",
   "titolo": "Piazza dell'Alba al mattino",
   "tinta": [
    "#3b4470",
    "#f2e3a0"
   ],
   "motivo": "piazza"
  },
  {
   "id": "r7",
   "strato": "età anziano",
   "titolo": "Rughe profonde, mani nodose",
   "tinta": [
    "#4a4a55",
    "#c3bddb"
   ],
   "motivo": "rughe"
  },
  {
   "id": "r8",
   "strato": "ruolo guardia",
   "titolo": "Corazza di cuoio bollito, lancia",
   "tinta": [
    "#3a2f2f",
    "#e35d5d"
   ],
   "motivo": "lancia"
  }
 ]
};
})();
