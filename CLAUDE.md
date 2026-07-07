# mosh-hacking-console — Contexte module

## Identité

| Élément | Valeur |
|---|---|
| ID technique | `mosh-hacking-console` |
| Ancien ID | `mosh-hacking-console-fr` |
| Version de référence | `0.7.7` |
| Foundry VTT | V13 |
| Dépendance obligatoire | `mosh-hackers-handbook >= 0.9.5` |
| Interface FR | prévue ultérieurement (source anglais actuellement) |

## Rôle — à ne pas dépasser

```
mosh-hacking-console  = réseaux, nœuds, hacking, réactions, synchronisation
mosh-hackers-handbook = objets, inventaire, decks, logiciels (lu en dépendance)
```

## Architecture — modèle serveur authoritative

```
Console hacker (joueur)  --intent-->  Console MJ (autorité)  --validation+mutation-->  État canonique  --broadcast-->  Tous les clients
```
La console MJ est la **seule** source d'autorité (état, nœuds, réactions,
invitations, connexions, resets). Les clients joueurs n'envoient que des
intentions, jamais de mutation directe.

## Stockage : un système de hacking = un `JournalEntry`

```
JournalEntry
├── _CONFIG      # type HACK_SYSTEM, entry node, reaction table, hack console yes/no
├── _MAP         # (prévu) rendu graphique uniquement — Connections reste la vérité logique
├── page node 1
├── page node 2
└── ...
```
Chaque page de nœud (texte) contient : `Network`, `Node`, `Function`,
`Security`, `Reaction`, `Grid`, `Connections`, puis sections HTML
`GM Description` / `Data` / `Success` / `Failure`.

⚠️ Respecter la règle générale d'ID (16 car. alphanumériques) pour tout
`_id` de page créée par le Network Builder.

## Niveaux de sécurité des nœuds

```
UNSECURED  → pas de test, ouverture directe, contour pointillé
SECURE     → test normal, contour plein
HARDENED   → test avec désavantage, deux contours
ENCRYPTED  → verrouillé par défaut, nécessite PEK/décryptage, trois contours
```
Pas de niveau `BROKEN`. Statut de **sécurité** et statut de **progression**
(scanné/ouvert/compromis/verrouillé) sont deux notions séparées.

## Accessibilité / découverte

`Connections` = vérité logique gameplay (qui voit quoi, qui devient
accessible). Un `ROUTER` ouvert permet d'attaquer n'importe quel nœud déjà
**visible** (il ne révèle pas tout le réseau, il change l'accessibilité).
`Xmap` révèle tous les nœuds (`visible=true`) sans les ouvrir ni contourner
la sécurité.

## Dépendance à `mosh-hackers-handbook`

```js
flags["mosh-hackers-handbook"]              // priorité
flags["mosh-hackers-handbook-fr"]           // fallback ancien namespace
```
Seuls les logiciels réellement installés dans le deck sélectionné sont
utilisables depuis la console. Effets connus via `effectKey` : voir
`mosh-hackers-handbook/CLAUDE.md`.

## Tests de hacking — workflow

```
Console hacker → jet de Hacking (côté joueur, système MoSh) → résultat envoyé au MJ
  → succès : nœud ouvert, voisins révélables, data/actions affichées
  → échec : nœud compromis, Réaction MJ déclenchée, effets envoyés aux hackers connectés uniquement
```
Réaction 0 = pas de jet, effet auto "Network's Reaction +1" (tous les nœuds
+1). Réaction >0 = table de réaction MJ (résultats sensibles → MJ seul,
effets visibles → joueurs connectés seulement).

## Network Builder

Modes : `Select/Move`, `Create link`, `Delete link`. 4 ports d'accroche par
nœud (top/right/bottom/left). Bibliothèque actuelle : Terminal, Databank,
Router, Firewall, Infrastructure, Uplink, Mobile terminal, Encrypted databank.

## Structure actuelle (à découper — voir cible ci-dessous)

```
mosh-hacking-console/
├── module.json
├── scripts/main.js        # ⚠️ TRÈS volumineux actuellement — quasi tout le module
├── styles/console.css
└── macros/
    ├── lancer-console-piratage.js   # globalThis.MoshHackingConsole.launchConsole()
    └── ouvrir-network-builder.js    # globalThis.MoshHackingConsole.launchBuilder()
```

### Structure cible (découpage prévu, priorité V1.0)

```
scripts/
├── main.js
├── core/{constants,state,utils}.js
├── console/{gm-console,hacker-console,session-manager,socket-service}.js
├── builder/{network-builder,node-library,link-editor,map-storage,journal-writer}.js
├── hacking/{accessibility,discovery,hacking-roll,router-service}.js
├── services/{handbook-compat,software-service,reaction-service,journal-parser}.js
└── ui/{overlays,context-menu,invitation-dialog}.js
```
Code partagé avec `mosh-hackers-handbook` (constantes d'`effectKey`, schéma
réseau) → `shared/hack-core/` du monorepo, pas dupliqué dans chaque module.

## Roadmap (ordre de priorité)

- **V0.7.x** (actuelle) : tracé manuel multi-segments, embranchements, page `_MAP`, choix du point d'entrée dans le Builder
- **V0.8.x** : tests complets gameplay, sync multi-clients, routeurs, Xmap, PEK, logiciels, réactions, resets
- **V0.9.x** : extraction textes → `lang/en.json` + `lang/fr.json`, parser compatible anciens journaux FR
- **V1.0** : découpage de `main.js` selon la structure cible, doc complète, démos, version stable distribuable

## Points de vigilance

- `main.js` est déjà trop volumineux — tout nouvel ajout majeur doit anticiper le découpage V1.0 plutôt que d'empiler davantage dans ce fichier
- Ne pas confondre `_MAP` (dessin) et `Connections` (logique) — `_MAP` ne doit jamais devenir une source de vérité gameplay
