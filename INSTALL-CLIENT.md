# Installation MCP NinjaTrader 8 — Guide Client

## Prérequis
- Claude Desktop installé (https://claude.ai/download)
- Node.js 18+ installé (https://nodejs.org/)

## Installation

### Étape 1: Copier le dossier MCP

Copier le dossier `mcp-server` sur votre ordinateur, par exemple:
```
C:\Users\VotreNom\Documents\mcp-ninjatrader\
```

### Étape 2: Installer les dépendances

Ouvrir un terminal (PowerShell ou CMD) dans le dossier:
```
cd C:\Users\VotreNom\Documents\mcp-ninjatrader
npm install
npm run build
```

### Étape 3: Configurer Claude Desktop

1. Ouvrir le fichier de config Claude Desktop:
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`

2. Ajouter cette configuration:

```json
{
  "mcpServers": {
    "ninjatrader": {
      "command": "node",
      "args": ["C:\\Users\\VotreNom\\Documents\\mcp-ninjatrader\\dist\\index.js"],
      "env": {
        "OUTPUT_DIR": "C:\\Users\\VotreNom\\Documents\\NinjaTrader-Scripts"
      }
    }
  }
}
```

**IMPORTANT**: Remplacez `VotreNom` par votre nom d'utilisateur Windows.

### Étape 4: Redémarrer Claude Desktop

Fermez et rouvrez Claude Desktop. Les outils NinjaTrader apparaîtront automatiquement.

## Utilisation

### Demander un nouveau script
```
Je veux un indicateur qui met des flèches vertes quand le RSI croise
au-dessus de 30 avec un volume élevé, sur NQ 512 ticks.
```

### Voir les scripts existants
```
Montre-moi les scripts NinjaTrader disponibles.
```

### Récupérer un script
```
Donne-moi le code du RSI Divergence v2.
```

### Pipeline complet
```
Crée-moi une stratégie automatique NQ avec MACD + EMA crossover,
stop ATR 1.5x, target 2.5x, sessions 9h30-11h30 et 14h-15h30.
```

Claude va automatiquement:
1. Générer le script avec le knowledge base NT8
2. Vérifier les best practices
3. Auditer le code (12 checks)
4. Tester la compilation
5. Sauvegarder le .cs prêt à importer

## Outils disponibles (9)

| Outil | Description |
|-------|-------------|
| `list_scripts` | Liste les 7 scripts existants |
| `get_script` | Récupère un script par nom |
| `generate_script` | Génère un script depuis une description |
| `update_code` | Vérifie les best practices NT8 |
| `audit_script` | Audit complet (12 checks qualité) |
| `test_compilation` | Test statique de compilation |
| `deliver_script` | Sauvegarde le .cs final |
| `run_pipeline` | Pipeline complet de génération |
| `validate_and_deliver` | Valide et livre le code généré |

## Support

SeoAI — michaelperron12@gmail.com — 514-609-2882
