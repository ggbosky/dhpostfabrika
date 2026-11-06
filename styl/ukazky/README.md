# Sem dej svoje reálné příspěvky

Dvě možnosti (lze kombinovat):

1. **Instagram export** – rozbal stažený ZIP (formát **JSON**) třeba do `styl/export/`
   a spusť `python -m postfabrika analyzuj styl/export`.
2. **Ručně** – vytvoř tady soubor `prispevky.txt` a vlož do něj 20–50 popisků
   příspěvků. Jednotlivé příspěvky odděl řádkem se třemi pomlčkami:

```
🚨 První příspěvek…

#hokej #denikhokeje
---
Druhý příspěvek…
---
Třetí…
```

Pak: `python -m postfabrika analyzuj styl/ukazky`

Obsah této složky se necommituje (je v .gitignore).
